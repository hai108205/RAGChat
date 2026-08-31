"""ARQ background job queue — async document indexing.

Replaces synchronous indexing in the HTTP handler with queued
background jobs, ensuring the request doesn't timeout on large files.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from src.config import settings
from src.helpers.log import get_logger
from src.services.app_callback import notify_app
from src.services.ingest_documents_service.ingest import (
    ingest_document,
    remove_from_registry,
)

logger = get_logger(__name__)

# Global ARQ Redis pool — initialized at startup
_redis_pool: ArqRedis | None = None


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
    user_id: str = "",
    room_id: str = "",
    chunking_strategy: str = "semantic",
    protect_tables: bool = True,
) -> dict:
    """Background job: parse, chunk, embed, and store a document.

    Args:
        ctx: ARQ worker context dict. Must contain 'embedder' and 'vector_store'.
        doc_id: Deterministic UUID string for the document.
        filename: Original filename.
        file_path_str: Path to the uploaded file on disk.
        chunk_size: Text chunk size.
        chunk_overlap: Text chunk overlap.
        user_id: Uploading Rocket.Chat user (for callback notification + ACL).
        room_id: Uploading Rocket.Chat room (for callback notification + ACL).
        chunking_strategy: "recursive" or "semantic" splitting.
        protect_tables: Keep table/code blocks intact under semantic splitting.

    Returns:
        Dict with status, document_id, chunks_count.
    """
    embedder = ctx["embedder"]
    vector_store = ctx["vector_store"]

    file_path = Path(file_path_str)

    try:
        content = file_path.read_bytes()
        result = await ingest_document(
            doc_id=uuid.UUID(doc_id),
            filename=filename,
            file_path=file_path,
            content=content,
            content_type="application/octet-stream",
            embedder=embedder,
            vector_store=vector_store,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            user_id=user_id,
            room_id=room_id,
            chunking_strategy=chunking_strategy,
            protect_tables=protect_tables,
        )

        await notify_app(
            "indexing_complete",
            user_id=user_id,
            room_id=room_id,
            document_name=filename,
            chunks_count=result["chunks_count"],
        )

        return {
            "status": result["status"],
            "document_id": doc_id,
            "filename": filename,
            "chunks_count": result["chunks_count"],
        }
    except Exception as e:
        logger.error("Indexing job failed", extra={"document_id": doc_id, "error": str(e)})
        await notify_app(
            "indexing_failed",
            user_id=user_id,
            room_id=room_id,
            document_name=filename,
            error=str(e),
        )
        return {
            "status": "error",
            "document_id": doc_id,
            "filename": filename,
            "error": str(e),
        }


async def chat_job(
    ctx: dict,
    request_id: str,
    query: str,
    user_id: str = "",
    room_id: str = "",
    thread_id: str = "",
    placeholder_id: str = "",
    history: list[dict] | None = None,
) -> dict:
    """Background job: execute RAG pipeline and notify Rocket.Chat app via callback."""
    pipeline = ctx.get("pipeline")
    if pipeline is None:
        logger.error("Chat job failed: RAG pipeline not initialized in worker context", extra={"request_id": request_id})
        await notify_app(
            "chat_failed",
            request_id=request_id,
            user_id=user_id,
            room_id=room_id,
            thread_id=thread_id,
            placeholder_id=placeholder_id,
            query=query,
            error="RAG pipeline not initialized in worker context",
        )
        return {"status": "error", "request_id": request_id, "error": "Pipeline not initialized"}

    try:
        logger.info("Executing chat job", extra={"request_id": request_id, "user_id": user_id, "room_id": room_id})
        result = await pipeline.ask(
            query=query,
            history=history,
            room_id=room_id,
            user_id=user_id,
        )
        await notify_app(
            "chat_completed",
            request_id=request_id,
            user_id=user_id,
            room_id=room_id,
            thread_id=thread_id,
            placeholder_id=placeholder_id,
            query=query,
            answer=result["answer"],
            sources=result.get("sources", []),
            model=result.get("model", ""),
        )
        return {
            "status": "completed",
            "request_id": request_id,
            "answer": result["answer"],
            "sources": result.get("sources", []),
            "model": result.get("model", ""),
        }
    except Exception as e:
        logger.exception("Chat job failed", extra={"request_id": request_id})
        await notify_app(
            "chat_failed",
            request_id=request_id,
            user_id=user_id,
            room_id=room_id,
            thread_id=thread_id,
            placeholder_id=placeholder_id,
            query=query,
            error=str(e),
        )
        return {
            "status": "error",
            "request_id": request_id,
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
        remove_from_registry(doc_id)

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


async def enqueue_chat_job(
    request_id: str,
    query: str,
    user_id: str = "",
    room_id: str = "",
    thread_id: str = "",
    placeholder_id: str = "",
    history: list[dict] | None = None,
) -> str:
    """Enqueue a chat question for async processing. Returns the ARQ job ID."""
    pool = await get_redis_pool()
    job = await pool.enqueue_job(
        "chat_job",
        request_id,
        query,
        user_id,
        room_id,
        thread_id,
        placeholder_id,
        history,
        _job_id=f"chat:{request_id}",
    )
    return job.job_id if job else f"chat:{request_id}"


async def enqueue_index_document(
    doc_id: str,
    filename: str,
    file_path_str: str,
    user_id: str = "",
    room_id: str = "",
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
        user_id,
        room_id,
        settings.chunking_strategy,
        settings.protect_tables,
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

    Used by: arq src.taskqueue.WorkerSettings
    """

    functions = (index_document_job, delete_document_job, chat_job)
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 600  # 10 minutes for large documents / complex RAG
    poll_delay = 0.5

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        """Build the embedder, vector store, llm, and RAG pipeline shared by all jobs."""
        from src.rag.embedding.embedder import Embedder
        from src.rag.llm.runtime import create_chat_model
        from src.rag.pipeline import RAGPipeline
        from src.storage.vectorstore import VectorStore

        embedder = Embedder(
            api_key=settings.openai_api_key,
            model=settings.embedding_model,
            base_url=settings.openai_base_url,
        )
        vector_store = VectorStore(settings.database_url, embeddings=embedder.embeddings)
        await vector_store.initialize()

        llm = create_chat_model(
            provider=settings.llm_provider,
            model=settings.model,
            api_key=settings.openai_api_key if settings.llm_provider == "openai" else settings.anthropic_api_key,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
            base_url=(
                settings.openai_base_url if settings.llm_provider == "openai" else settings.anthropic_base_url
            ),
        )

        pipeline = RAGPipeline(
            embedder=embedder,
            vector_store=vector_store,
            llm=llm,
            top_k=settings.top_k,
            synthesis_strategy=settings.synthesis_strategy,
            provider=settings.llm_provider,
        )

        ctx["embedder"] = embedder
        ctx["vector_store"] = vector_store
        ctx["llm"] = llm
        ctx["pipeline"] = pipeline

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        vector_store = ctx.get("vector_store")
        if vector_store is not None:
            await vector_store.close()

