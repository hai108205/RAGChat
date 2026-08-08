"""ARQ background job queue — async document indexing.

Replaces synchronous indexing in the HTTP handler with queued
background jobs, ensuring the request doesn't timeout on large files.
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Optional

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from src.config import settings
from src.rag.document.loader import DocumentLoader
from src.rag.document.parser import DocumentParser
from src.rag.document.cleaner import DocumentCleaner
from src.rag.document.chunker import DocumentChunker
from src.monitoring import documents_indexed_total, chunks_stored_total

# Global ARQ Redis pool — initialized at startup
_redis_pool: Optional[ArqRedis] = None


async def get_redis_pool() -> ArqRedis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _redis_pool


async def close_redis_pool() -> None:
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.close()
        _redis_pool = None


# ---------------------------------------------------------------------------
# Background job functions (called by ARQ worker)
# ---------------------------------------------------------------------------

async def index_document_job(
    ctx: dict,
    doc_id: str,
    filename: str,
    file_path_str: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> dict:
    """Background job: parse, chunk, embed, and store a document.

    Args:
        ctx: ARQ worker context dict. Must contain 'embedder' and 'vector_store'.
        doc_id: UUID string for the document.
        filename: Original filename.
        file_path_str: Path to the uploaded file on disk.
        chunk_size: Text chunk size.
        chunk_overlap: Text chunk overlap.

    Returns:
        Dict with status, document_id, chunks_count.
    """
    embedder = ctx["embedder"]
    vector_store = ctx["vector_store"]

    file_path = Path(file_path_str)
    document_uuid = uuid.UUID(doc_id)

    try:
        # Load → Parse → Clean → Chunk
        loader = DocumentLoader()
        parser = DocumentParser()
        cleaner = DocumentCleaner()
        chunker = DocumentChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        raw_text = loader.load(file_path)
        parsed = parser.parse(file_path, raw_text)
        cleaned = cleaner.clean(parsed.content)
        chunks = chunker.split(cleaned)

        if not chunks:
            file_path.unlink(missing_ok=True)
            return {"status": "error", "document_id": doc_id, "error": "Document produced no text content"}

        # Prepare chunk dicts
        chunk_dicts = []
        for i, chunk_text in enumerate(chunks):
            chunk_dicts.append({
                "document_id": document_uuid,
                "filename": filename,
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

        documents_indexed_total.inc()
        chunks_stored_total.inc(len(chunks))

        return {
            "status": "indexed",
            "document_id": doc_id,
            "filename": filename,
            "chunks_count": len(chunks),
        }
    except Exception as e:
        return {
            "status": "error",
            "document_id": doc_id,
            "filename": filename,
            "error": str(e),
        }


async def delete_document_job(
    ctx: dict,
    doc_id: str,
) -> dict:
    """Background job: delete a document and its chunks from vector DB."""
    vector_store = ctx["vector_store"]
    document_uuid = uuid.UUID(doc_id)

    try:
        count = await vector_store.delete_document(document_uuid)

        # Also remove uploaded file
        upload_dir = Path(settings.upload_dir)
        for f in upload_dir.glob(f"{doc_id}_*"):
            f.unlink(missing_ok=True)

        return {"status": "deleted", "document_id": doc_id, "chunks_removed": count}
    except Exception as e:
        return {"status": "error", "document_id": doc_id, "error": str(e)}


# ---------------------------------------------------------------------------
# Enqueue helpers (called from API endpoints)
# ---------------------------------------------------------------------------

async def enqueue_index_document(
    doc_id: str,
    filename: str,
    file_path_str: str,
) -> str:
    """Enqueue a document indexing job. Returns the ARQ job ID."""
    pool = await get_redis_pool()
    job = await pool.enqueue_job(
        "index_document_job",
        doc_id,
        filename,
        file_path_str,
        settings.chunk_size,
        settings.chunk_overlap,
        _job_id=f"index:{doc_id}",
    )
    return job.job_id


async def enqueue_delete_document(doc_id: str) -> str:
    """Enqueue a document deletion job. Returns the ARQ job ID."""
    pool = await get_redis_pool()
    job = await pool.enqueue_job(
        "delete_document_job",
        doc_id,
        _job_id=f"delete:{doc_id}",
    )
    return job.job_id


async def get_job_status(job_id: str) -> dict:
    """Check the status of a queued job."""
    pool = await get_redis_pool()
    job_info = await pool.get_job_status(job_id)
    if job_info is None:
        return {"status": "not_found", "job_id": job_id}
    return {
        "job_id": job_id,
        "status": job_info.status,
        "result": job_info.result,
        "enqueue_time": str(job_info.enqueue_time) if job_info.enqueue_time else None,
    }


class WorkerSettings:
    """ARQ Worker configuration.

    Used by: arq src.queue.jobs.WorkerSettings
    """

    on_startup = None  # set dynamically in main.py
    functions = [index_document_job, delete_document_job]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 600  # 10 minutes for large documents
    poll_delay = 0.5