"""pgVector vector store — backed by LangChain's PGVector.

Wraps ``langchain_community.vectorstores.PGVector`` (which manages its own
``langchain_pg_embedding`` table and collection) behind the synchronous async
API the rest of the app uses. All synchronous calls are offloaded to a thread
pool via :func:`asyncio.to_thread`.

Retrieval supports three modes:

* **Dense** — pure cosine-similarity vector search (the default).
* **Keyword** — SQL ``ILIKE`` full-text search over chunk text (exact-match friendly).
* **Hybrid** — fuses the two via Reciprocal Rank Fusion (RRF).

Every mode honours an optional ``filters`` dict (e.g. ``{"room_id": "..."}``)
applied as ``cmetadata`` JSON predicates, so per-room data isolation is
enforced at the storage layer.
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

    def __init__(self, database_url: str, embeddings: Embeddings | None = None) -> None:
        # psycopg2 expects postgresql:// or postgresql+psycopg2://
        if database_url.startswith("postgresql+asyncpg://"):
            sync_url = database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        else:
            sync_url = database_url

        self._url = sync_url
        self._embeddings = embeddings
        # Stub used only when embeddings are unavailable (ARQ worker cold start).
        embedding_function = embeddings or _NoopEmbeddings()
        self._pgvector = PGVector(
            connection_string=sync_url,
            embedding_function=embedding_function,
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

    def _build_filter_clauses(self, filters: dict | None) -> tuple[str, dict]:
        """Build a SQL WHERE fragment + params from metadata filters.

        Each key maps to a JSON key in ``cmetadata``; equality is used.
        """
        if not filters:
            return "", {}
        clauses = []
        params: dict = {}
        for i, (key, value) in enumerate(filters.items()):
            if value is None:
                continue
            param = f"f_{i}"
            clauses.append(f"cmetadata->>'{key}' = :{param}")
            params[param] = str(value)
        if not clauses:
            return "", {}
        return " AND " + " AND ".join(clauses), params

    def _dense_search_sync(
        self,
        query_embedding: list[float],
        top_k: int,
        filters: dict | None,
        similarity_threshold: float,
    ) -> list[tuple[dict, float]]:
        """Cosine-similarity search via raw SQL (skips PGVector's json filter quirks).

        Chunks whose cosine similarity is below ``similarity_threshold`` are dropped.
        """
        where, params = self._build_filter_clauses(filters)
        vec = "[" + ",".join(f"{v:.10f}" for v in query_embedding) + "]"

        sql = (
            "SELECT cmetadata, document, (1 - embedding <=> :vec::vector) AS similarity "
            "FROM langchain_pg_embedding "
            "WHERE (1 - embedding <=> :vec::vector) >= :threshold"
        )
        if where:
            sql += where
        sql += " ORDER BY similarity DESC LIMIT :limit"

        rows = []
        with self._engine.connect() as conn:
            result = conn.execute(
                text(sql),
                {**params, "vec": vec, "threshold": similarity_threshold, "limit": top_k},
            )
            for row in result:
                metadata = row[0] or {}
                similarity = float(row[2])
                dense_ranked_item = (
                    {
                        "id": metadata.get("id"),
                        "document_id": metadata.get("document_id", ""),
                        "filename": metadata.get("filename", "Unknown"),
                        "content": row[1],
                        "page": metadata.get("page"),
                        "metadata": metadata,
                        "relevance": similarity,
                    },
                    similarity,
                )
                rows.append(dense_ranked_item)
        return rows

    def _keyword_search_sync(
        self,
        query: str,
        top_k: int,
        filters: dict | None,
    ) -> list[tuple[dict, float]]:
        """Keyword ``ILIKE`` search (case-insensitive, token-level exact match).

        Each whitespace-separated token must appear in the chunk text (AND) for
        high precision on exact identifiers (``NV-2023-XYZ``, ``Error 504``).
        Chunks are ranked by total occurrence count of the query tokens.
        """
        tokens = [t.strip("%_").strip() for t in query.replace("\n", " ").split(" ") if t.strip()]
        if not tokens:
            return []

        where, params = self._build_filter_clauses(filters)
        ilike_clauses = " AND ".join(f"document ILIKE :kw_{i}" for i in range(len(tokens)))
        for i, tok in enumerate(tokens):
            params[f"kw_{i}"] = f"%{tok}%"

        # occurrence count of every token, summed across the chunk — ties broken by length
        score_expr = " + ".join(
            f"(length(lower(document)) - length(replace(lower(document), lower(:kw_{i}), ''))) / length(lower(:kw_{i}))"
            for i in range(len(tokens))
        )

        sql = (
            "SELECT cmetadata, document, "
            f"({score_expr}) AS score "
            "FROM langchain_pg_embedding "
            f"WHERE {ilike_clauses}"
        )
        if where:
            sql += where
        sql += " ORDER BY score DESC, document ASC LIMIT :limit"

        rows = []
        with self._engine.connect() as conn:
            result = conn.execute(text(sql), {**params, "limit": top_k})
            for row in result:
                metadata = row[0] or {}
                rows.append(
                    (
                        {
                            "id": metadata.get("id"),
                            "document_id": metadata.get("document_id", ""),
                            "filename": metadata.get("filename", "Unknown"),
                            "content": row[1],
                            "page": metadata.get("page"),
                            "metadata": metadata,
                            "relevance": 0.0,  # filled by caller (RRF or keyword score)
                        },
                        float(row[2]),
                    )
                )
        return rows

    def _rrf_fuse(
        self,
        dense: list[tuple[dict, float]],
        keyword: list[tuple[dict, float]],
        top_k: int,
        k: int = 60,
    ) -> list[dict]:
        """Reciprocal Rank Fusion over dense + keyword ranked lists."""
        scores: dict[str, tuple[dict, float]] = {}
        for rank, (doc, _score) in enumerate(dense, start=1):
            key = doc["id"] or f"{doc['document_id']}:{doc['content'][:80]}"
            scores.setdefault(key, [doc, 0.0])
            scores[key][1] += 1.0 / (k + rank)

        for rank, (doc, score) in enumerate(keyword, start=1):
            key = doc["id"] or f"{doc['document_id']}:{doc['content'][:80]}"
            entry = scores.setdefault(key, [doc, 0.0])
            entry[1] += 1.0 / (k + rank)
            # keyword rank is authoritative for exact matches — record it
            entry[0]["relevance"] = max(entry[0]["relevance"], score)

        ranked = sorted(scores.values(), key=lambda x: x[1], reverse=True)
        out = []
        for doc, rrf in ranked[:top_k]:
            doc["_rrf"] = rrf
            # For pure dense + keyword, keep cosine similarity; RRF overrides otherwise.
            out.append(doc)
        return out

    def _search_sync(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        filters: dict | None = None,
        similarity_threshold: float | None = None,
        query_text: str = "",
        mode: str = "dense",
    ) -> list[dict]:
        """Run dense, keyword, or hybrid retrieval.

        ``query_embedding`` is used only for dense/hybrid; ``query_text`` only
        for keyword/hybrid.
        """
        if similarity_threshold is None:
            from src.config import settings

            similarity_threshold = settings.similarity_threshold

        dense_ranked: list[tuple[dict, float]] = []
        keyword_ranked: list[tuple[dict, float]] = []

        if mode in ("dense", "hybrid"):
            limit = top_k * 4 if mode == "hybrid" else top_k
            dense_ranked = self._dense_search_sync(query_embedding, limit, filters, similarity_threshold)

        if mode in ("keyword", "hybrid") and query_text.strip():
            keyword_ranked = self._keyword_search_sync(query_text, top_k, filters)

        if mode == "dense":
            return [doc for doc, _score in dense_ranked[:top_k]]

        if mode == "keyword":
            return [doc for doc, _score in keyword_ranked[:top_k]]

        # hybrid — RRF fusion
        return self._rrf_fuse(dense_ranked, keyword_ranked, top_k)

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
        query_text: str = "",
        mode: str = "dense",
    ) -> list[dict]:
        return await asyncio.to_thread(
            self._search_sync,
            query_embedding,
            top_k,
            filters,
            similarity_threshold,
            query_text,
            mode,
        )

    async def delete_document(self, document_id: uuid.UUID) -> int:
        return await asyncio.to_thread(self._delete_document_sync, document_id)

    async def list_documents(self) -> list[dict]:
        return await asyncio.to_thread(self._list_documents_sync)

    async def close(self) -> None:
        await asyncio.to_thread(self._close_sync)


class _NoopEmbeddings(Embeddings):
    """Embeddings stub for construction-time when no real model is available."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    def embed_query(self, text: str) -> list[float]:
        return [0.0] * 1536
