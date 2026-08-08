"""Shared document ingestion — used by the sync API path and the ARQ job.

Implements the incremental-indexing contract from Plan.md 4.4:
deterministic document ID, content version hash, registry skip-if-unchanged,
chunk → embed → store, and registry upsert with chunk IDs.
"""

import uuid
from pathlib import Path

from src.helpers.id_generator import generate_version_hash
from src.helpers.log import get_logger
from src.monitoring import chunks_stored_total, documents_indexed_total
from src.rag.document.chunker import DocumentChunker
from src.rag.document.cleaner import DocumentCleaner
from src.rag.document.loader import DocumentLoader
from src.rag.document.parser import DocumentParser
from src.services.ingest_documents_service.registry_store import get_registry_session
from src.services.ingest_documents_service.document_registry import DocumentRegistry

logger = get_logger(__name__)


async def ingest_document(
    *,
    doc_id: uuid.UUID,
    filename: str,
    file_path: Path,
    content: bytes,
    content_type: str,
    embedder,
    vector_store,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> dict:
    """Parse, chunk, embed, and store a document; maintain the registry.

    Returns:
        Dict with status ('indexed' | 'unchanged'), chunks_count, version_hash.

    Raises:
        ValueError: If the document produces no text content.
    """
    version_hash = generate_version_hash(content)
    document_id = str(doc_id)

    # Skip if the registry already has this exact version
    with get_registry_session() as session:
        registry = DocumentRegistry(session)
        existing = registry.get(document_id)
        if existing is not None and existing.version_hash == version_hash:
            logger.info("Document unchanged, skipping", extra={"document_id": document_id})
            return {"status": "unchanged", "chunks_count": len(existing.chunk_ids), "version_hash": version_hash}

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
        raise ValueError("Document produced no text content")

    chunk_dicts = []
    for i, chunk_text in enumerate(chunks):
        chunk_dicts.append({
            "document_id": doc_id,
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

    # Re-index of a changed version: drop stale chunks first
    if existing is not None:
        removed = await vector_store.delete_document(doc_id)
        logger.info("Removed stale chunks", extra={"document_id": document_id, "removed": removed})

    embeddings = await embedder.embed_documents([c["content"] for c in chunk_dicts])
    chunk_ids = await vector_store.add_chunks(chunk_dicts, embeddings)

    # Register the new version
    with get_registry_session() as session:
        registry = DocumentRegistry(session)
        registry.upsert(
            document_id,
            source=str(file_path),
            filename=filename,
            size=len(content),
            content_type=content_type,
            version_hash=version_hash,
            chunk_ids=chunk_ids,
        )

    documents_indexed_total.inc()
    chunks_stored_total.inc(len(chunks))

    return {"status": "indexed", "chunks_count": len(chunks), "version_hash": version_hash}


def remove_from_registry(document_id: str) -> None:
    """Delete a document record from the registry (no-op if absent)."""
    with get_registry_session() as session:
        DocumentRegistry(session).remove(document_id)
