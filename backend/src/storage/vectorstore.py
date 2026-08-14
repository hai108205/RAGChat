"""pgVector vector store — backed by LangChain's PGVector.

Wraps ``langchain_community.vectorstores.PGVector`` (which manages its own
``langchain_pg_embedding`` table and collection) behind the synchronous async
API the rest of the app uses. All synchronous calls are offloaded to a thread
pool via :func:`asyncio.to_thread`.
"""

import asyncio
import uuid

from langchain_community.vectorstores import PGVector
from langchain_core.embeddings import Embeddings
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

COLLECTION_NAME = "ragchat"


class VectorStore:
    """Async wrapper around LangChain's PGVector store.

    Preserves the previous ``search``/``add_chunks``/``delete_document``/
    ``list_documents`` interface so callers (pipeline, ingest) stay unchanged.
    Chunks are stored with ``document_id``/``filename``/``page`` in their
    metadata so retrieved results can be reconstructed the same way as before.
    """

    def __init__(self, database_url: str, embeddings: Embeddings) -> None:
        # psycopg2 expects postgresql:// or postgresql+psycopg2://
        if database_url.startswith("postgresql+asyncpg://"):
            sync_url = database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        else:
            sync_url = database_url

        self._url = sync_url
        self._pgvector = PGVector(
            connection_string=sync_url,
            embedding_function=embeddings,
            collection_name=COLLECTION_NAME,
        )
        # Separate engine for metadata queries PGVector does not expose.
        self._engine: Engine = create_engine(sync_url, pool_size=5, max_overflow=10)

    # ------------------------------------------------------------------
    # Internal sync helpers
    # ------------------------------------------------------------------

    def _initialize_sync(self) -> None:
        # Ensure the vector extension + backing table exist.
        with self._engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        self._pgvector.create_tables_if_not_exists()

    def _add_chunks_sync(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        texts = [c["content"] for c in chunks]
        metadatas = []
        for c in chunks:
            metadata = {
                "document_id": str(c["document_id"]),
                "filename": c["filename"],
                "page": c.get("page"),
                **c.get("metadata", {}),
            }
            metadatas.append(metadata)
        return self._pgvector.add_embeddings(
            texts=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def _search_sync(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        filters: dict | None = None,
        similarity_threshold: float | None = None,
    ) -> list[dict]:
        if similarity_threshold is None:
            from src.config import settings

            similarity_threshold = settings.similarity_threshold

        results = self._pgvector.similarity_search_with_score_by_vector(
            embedding=query_embedding,
            k=top_k,
        )
        out = []
        for doc, score in results:
            if score < similarity_threshold:
                continue
            metadata = doc.metadata
            out.append(
                {
                    "id": metadata.get("id"),
                    "document_id": metadata.get("document_id", ""),
                    "filename": metadata.get("filename", "Unknown"),
                    "content": doc.page_content,
                    "page": metadata.get("page"),
                    "metadata": metadata,
                    "relevance": score,
                }
            )
        return out

    def _delete_document_sync(self, document_id: uuid.UUID) -> int:
        with self._engine.begin() as conn:
            result = conn.execute(
                text("""
                    DELETE FROM langchain_pg_embedding
                    WHERE cmetadata->>'document_id' = :doc_id
                """),
                {"doc_id": str(document_id)},
            )
        return result.rowcount

    def _list_documents_sync(self) -> list[dict]:
        with self._engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT cmetadata->>'document_id' AS document_id,
                           cmetadata->>'filename' AS filename,
                           COUNT(*) AS chunks_count
                    FROM langchain_pg_embedding
                    GROUP BY document_id, filename
                    ORDER BY filename ASC
                """)
            )
            rows = result.fetchall()
        return [
            {
                "id": row[0],
                "filename": row[1],
                "chunks_count": row[2],
                "created_at": None,
            }
            for row in rows
        ]

    def _close_sync(self) -> None:
        self._engine.dispose()

    # ------------------------------------------------------------------
    # Public async API (blocking calls via asyncio.to_thread)
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        await asyncio.to_thread(self._initialize_sync)

    async def add_chunks(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        return await asyncio.to_thread(self._add_chunks_sync, chunks, embeddings)

    async def search(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        filters: dict | None = None,
        similarity_threshold: float | None = None,
    ) -> list[dict]:
        return await asyncio.to_thread(
            self._search_sync, query_embedding, top_k, filters, similarity_threshold
        )

    async def delete_document(self, document_id: uuid.UUID) -> int:
        return await asyncio.to_thread(self._delete_document_sync, document_id)

    async def list_documents(self) -> list[dict]:
        return await asyncio.to_thread(self._list_documents_sync)

    async def close(self) -> None:
        await asyncio.to_thread(self._close_sync)
