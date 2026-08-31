"""Incremental index rebuild CLI (Plan.md 4.4 / 5).

Scans a directory of documents, computes (document_id, version_hash) for each,
diffs against the Document Registry, and applies the delta:

  * deleted  → remove chunks from pgVector + registry
  * new/changed → parse, chunk, embed, upsert

Usage:
    python -m scripts.memory_builder <directory>
"""

import asyncio
import sys
from pathlib import Path

from src.config import settings
from src.helpers.id_generator import generate_document_id, generate_version_hash
from src.helpers.log import get_logger
from src.rag.document.loader import DocumentLoader
from src.rag.embedding.embedder import Embedder
from src.services.ingest_documents_service.document_registry import DocumentRegistry
from src.services.ingest_documents_service.ingest import ingest_document, remove_from_registry
from src.services.ingest_documents_service.registry_store import get_registry_session
from src.storage.vectorstore import VectorStore

logger = get_logger(__name__)


def scan_directory(directory: Path) -> dict[str, tuple[Path, str]]:
    """Return {document_id: (path, version_hash)} for supported files."""
    snapshot: dict[str, tuple[Path, str]] = {}
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in DocumentLoader.SUPPORTED_EXTENSIONS:
            continue
        doc_id = str(generate_document_id(path.name))
        snapshot[doc_id] = (path, generate_version_hash(path.read_bytes()))
    return snapshot


async def rebuild(directory: Path) -> None:
    embedder = Embedder(api_key=settings.openai_api_key, model=settings.embedding_model)
    vector_store = VectorStore(settings.database_url)
    await vector_store.initialize()

    try:
        snapshot = scan_directory(directory)
        current_hashes = {doc_id: version for doc_id, (_, version) in snapshot.items()}

        with get_registry_session() as session:
            registry = DocumentRegistry(session)
            new_ids, changed_ids, deleted_ids = registry.get_stale_documents(current_hashes)

        print(f"Scan: {len(snapshot)} files | new={len(new_ids)} changed={len(changed_ids)} deleted={len(deleted_ids)}")

        for doc_id in deleted_ids:
            import uuid as _uuid
            count = await vector_store.delete_document(_uuid.UUID(doc_id))
            remove_from_registry(doc_id)
            print(f"  deleted {doc_id} ({count} chunks removed)")

        for doc_id in sorted(new_ids | changed_ids):
            path, _ = snapshot[doc_id]
            try:
                result = await ingest_document(
                    doc_id=generate_document_id(path.name),
                    filename=path.name,
                    file_path=path,
                    content=path.read_bytes(),
                    content_type="application/octet-stream",
                    embedder=embedder,
                    vector_store=vector_store,
                    chunk_size=settings.chunk_size,
                    chunk_overlap=settings.chunk_overlap,
                )
                print(f"  {result['status']} {path.name} ({result['chunks_count']} chunks)")
            except Exception as e:
                print(f"  FAILED {path.name}: {e}")
    finally:
        await vector_store.close()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.memory_builder <directory>")
        sys.exit(1)
    directory = Path(sys.argv[1])
    if not directory.is_dir():
        print(f"Not a directory: {directory}")
        sys.exit(1)
    asyncio.run(rebuild(directory))


if __name__ == "__main__":
    main()
