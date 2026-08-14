"""Document API endpoints — upload, list, delete indexed documents."""

import base64
import binascii
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from src.api.deps import require_api_key
from src.config import settings
from src.helpers.id_generator import generate_document_id
from src.helpers.log import get_logger
from src.monitoring import documents_count
from src.rag.document.loader import DocumentLoader
from src.services.ingest_documents_service.ingest import (
    ingest_document,
    remove_from_registry,
)
from src.state import state
from src.storage.objectstore import get_object_store

logger = get_logger(__name__)

router = APIRouter(tags=["documents"], dependencies=[Depends(require_api_key)])


class DocumentInfo(BaseModel):
    id: str
    filename: str
    chunks_count: int
    created_at: str | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    chunks_count: int
    status: str


class DeleteResponse(BaseModel):
    status: str


class Base64UploadRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_base64: str = Field(..., min_length=1)
    content_type: str = "application/octet-stream"
    user_id: str | None = None
    room_id: str | None = None


async def _process_upload(
    filename: str,
    content: bytes,
    content_type: str,
    user_id: str | None,
    room_id: str | None,
) -> DocumentUploadResponse:
    """Shared ingest path for multipart and base64 uploads."""
    # Deterministic document ID from canonical filename (Plan 2.2)
    doc_id = generate_document_id(filename)

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{doc_id}_{filename}"
    file_path.write_bytes(content)

    if settings.use_minio:
        object_store = get_object_store()
        await object_store.ensure_bucket()
        object_name = f"{doc_id}/{filename}"
        await object_store.upload(object_name, content, content_type)

    if settings.use_async_indexing:
        # Async: enqueue background job, return immediately
        from src.taskqueue import enqueue_index_document

        job_id = await enqueue_index_document(
            doc_id=str(doc_id),
            filename=filename,
            file_path_str=str(file_path),
            user_id=user_id or "",
            room_id=room_id or "",
        )
        return DocumentUploadResponse(
            document_id=str(doc_id),
            filename=filename,
            chunks_count=0,
            status=f"queued (job: {job_id})",
        )

    # Sync: process immediately
    result = await ingest_document(
        doc_id=doc_id,
        filename=filename,
        file_path=file_path,
        content=content,
        content_type=content_type,
        embedder=state.embedder,
        vector_store=state.vector_store,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )

    if result["status"] == "unchanged":
        file_path.unlink(missing_ok=True)

    return DocumentUploadResponse(
        document_id=str(doc_id),
        filename=filename,
        chunks_count=result["chunks_count"],
        status=result["status"],
    )


def _validate_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in DocumentLoader.SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Supported: {', '.join(DocumentLoader.SUPPORTED_EXTENSIONS)}",
        )


@router.post("/documents", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    user_id: str | None = Form(None),
    room_id: str | None = Form(None),
):
    """Upload and index a document for RAG Q&A.

    Documents get a deterministic SHA-256 ID from their filename and a content
    version hash; re-uploading an unchanged file is skipped via the registry.
    Set USE_ASYNC_INDEXING=true to enable background job processing.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    _validate_extension(file.filename)

    try:
        content = await file.read()
        return await _process_upload(
            file.filename,
            content,
            file.content_type or "application/octet-stream",
            user_id,
            room_id,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {e!s}")


@router.post("/documents/base64", response_model=DocumentUploadResponse)
async def upload_document_base64(request: Base64UploadRequest):
    """Upload and index a document sent as base64 JSON.

    Used by the Rocket.Chat app, whose IHttp client cannot send multipart
    form data. Same semantics as POST /documents.
    """
    _validate_extension(request.filename)

    try:
        content = base64.b64decode(request.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 content")

    if not content:
        raise HTTPException(status_code=400, detail="Empty file content")

    try:
        return await _process_upload(
            request.filename,
            content,
            request.content_type,
            request.user_id,
            request.room_id,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {e!s}")


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents():
    """List all indexed documents."""
    try:
        docs = await state.vector_store.list_documents()
        documents_count.set(len(docs))
        return DocumentListResponse(documents=[DocumentInfo(**d) for d in docs])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/jobs/{job_id}")
async def get_job_status_endpoint(job_id: str):
    """Get the status of an async indexing job."""
    try:
        from src.taskqueue import get_job_status

        return await get_job_status(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}", response_model=DeleteResponse)
async def delete_document(document_id: str):
    """Delete a document and all its chunks."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    try:
        count = await state.vector_store.delete_document(doc_uuid)

        # Remove from registry regardless of chunk count
        remove_from_registry(document_id)

        if count == 0:
            raise HTTPException(status_code=404, detail="Document not found")

        # Remove from MinIO if enabled
        if settings.use_minio:
            object_store = get_object_store()
            await object_store.delete_prefix(document_id)

        # Also remove the uploaded file if it exists locally
        upload_dir = Path(settings.upload_dir)
        for f in upload_dir.glob(f"{document_id}_*"):
            f.unlink(missing_ok=True)

        return DeleteResponse(status=f"deleted ({count} chunks removed)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
