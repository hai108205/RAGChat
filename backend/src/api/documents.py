"""Document API endpoints — upload, list, delete indexed documents."""

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from src.config import settings
from src.main import embedder, vector_store
from src.rag.document.loader import DocumentLoader
from src.rag.document.parser import DocumentParser
from src.rag.document.cleaner import DocumentCleaner
from src.rag.document.chunker import DocumentChunker


router = APIRouter(tags=["documents"])


class DocumentInfo(BaseModel):
    id: str
    filename: str
    chunks_count: int
    created_at: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    chunks_count: int
    status: str


class DeleteResponse(BaseModel):
    status: str


@router.post("/documents", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and index a document for RAG Q&A."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate extension
    ext = Path(file.filename).suffix.lower()
    if ext not in DocumentLoader.SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Supported: {', '.join(DocumentLoader.SUPPORTED_EXTENSIONS)}",
        )

    try:
        # Save uploaded file
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)

        doc_id = uuid.uuid4()
        file_path = upload_dir / f"{doc_id}_{file.filename}"
        content = await file.read()
        file_path.write_bytes(content)

        # Process document
        loader = DocumentLoader()
        parser = DocumentParser()
        cleaner = DocumentCleaner()
        chunker = DocumentChunker(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        # Load → Parse → Clean → Chunk
        raw_text = loader.load(file_path)
        parsed = parser.parse(file_path, raw_text)
        cleaned = cleaner.clean(parsed.content)
        chunks = chunker.split(cleaned)

        if not chunks:
            # Clean up empty file
            file_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Document produced no text content")

        # Prepare chunks with metadata
        chunk_dicts = []
        for i, chunk_text in enumerate(chunks):
            chunk_dicts.append({
                "document_id": doc_id,
                "filename": file.filename,
                "content": chunk_text,
                "page": None,
                "metadata": {
                    "source": parsed.source,
                    "file_format": parsed.metadata.get("file_format", ""),
                    "chunk_index": i,
                    "chunk_total": len(chunks),
                },
            })

        # Embed all chunks
        embeddings = await embedder.embed_documents([c["content"] for c in chunk_dicts])

        # Store in vector database
        await vector_store.add_chunks(chunk_dicts, embeddings)

        return DocumentUploadResponse(
            document_id=str(doc_id),
            filename=file.filename,
            chunks_count=len(chunks),
            status="indexed",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents():
    """List all indexed documents."""
    try:
        docs = await vector_store.list_documents()
        return DocumentListResponse(
            documents=[DocumentInfo(**d) for d in docs]
        )
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
        count = await vector_store.delete_document(doc_uuid)
        if count == 0:
            raise HTTPException(status_code=404, detail="Document not found")

        # Also remove the uploaded file if it exists
        upload_dir = Path(settings.upload_dir)
        for f in upload_dir.glob(f"{document_id}_*"):
            f.unlink(missing_ok=True)

        return DeleteResponse(status=f"deleted ({count} chunks removed)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
