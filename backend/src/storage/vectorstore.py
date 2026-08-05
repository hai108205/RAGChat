"""pgVector vector store client — synchronous SQLAlchemy + psycopg2, called via asyncio.to_thread."""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, DateTime, Index, Integer, String, Text, create_engine, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    embedding = mapped_column(Vector(1536))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index(
            "idx_chunks_embedding",
            embedding,
            postgresql_using="ivfflat",
            postgresql_with={"lists": 100},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


class VectorStore:
    """Synchronous pgVector store. All public methods are async wrappers over sync DB calls."""

    def __init__(self, database_url: str) -> None:
        # psycopg2 expects postgresql:// or postgresql+psycopg2://
        if database_url.startswith("postgresql://"):
            sync_url = database_url
        elif database_url.startswith("postgresql+asyncpg://"):
            sync_url = database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        elif database_url.startswith("postgresql+psycopg2://"):
            sync_url = database_url
        else:
            sync_url = database_url

        self.engine: Engine = create_engine(sync_url, pool_size=5, max_overflow=10)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)

    # ------------------------------------------------------------------
    # Internal sync helpers
    # ------------------------------------------------------------------

    def _initialize_sync(self) -> None:
        with self.engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        Base.metadata.create_all(self.engine)

    def _add_chunks_sync(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        ids: list[str] = []
        with self.session_factory() as session:
            for chunk, embedding in zip(chunks, embeddings):
                doc = DocumentChunk(
                    document_id=chunk["document_id"],
                    filename=chunk["filename"],
                    content=chunk["content"],
                    page=chunk.get("page"),
                    metadata_=chunk.get("metadata", {}),
                    embedding=embedding,
                )
                session.add(doc)
                session.flush()  # populate doc.id before commit
                ids.append(str(doc.id))
            session.commit()
        return ids

    def _search_sync(
        self, query_embedding: list[float], top_k: int = 5, filters: Optional[dict] = None
    ) -> list[dict]:
        with self.session_factory() as session:
            result = session.execute(
                text("""
                    SELECT id, document_id, filename, content, page, metadata,
                           1 - (embedding <=> :embedding) AS relevance
                    FROM document_chunks
                    WHERE 1 - (embedding <=> :embedding) > 0.5
                    ORDER BY embedding <=> :embedding
                    LIMIT :top_k
                """),
                {"embedding": query_embedding, "top_k": top_k},
            )
            rows = result.fetchall()
        return [
            {
                "id": str(row[0]),
                "document_id": str(row[1]),
                "filename": row[2],
                "content": row[3],
                "page": row[4],
                "metadata": row[5],
                "relevance": float(row[6]),
            }
            for row in rows
        ]

    def _delete_document_sync(self, document_id: uuid.UUID) -> int:
        with self.session_factory() as session:
            result = session.execute(
                text("DELETE FROM document_chunks WHERE document_id = :doc_id"),
                {"doc_id": document_id},
            )
            session.commit()
            return result.rowcount

    def _list_documents_sync(self) -> list[dict]:
        with self.session_factory() as session:
            result = session.execute(
                text("""
                    SELECT document_id, filename, COUNT(*) AS chunks_count,
                           MIN(created_at) AS created_at
                    FROM document_chunks
                    GROUP BY document_id, filename
                    ORDER BY created_at DESC
                """)
            )
            rows = result.fetchall()
        return [
            {
                "id": str(row[0]),
                "filename": row[1],
                "chunks_count": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
            }
            for row in rows
        ]

    def _close_sync(self) -> None:
        self.engine.dispose()

    # ------------------------------------------------------------------
    # Public async API (run_blocking calls via asyncio.to_thread)
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        await asyncio.to_thread(self._initialize_sync)

    async def add_chunks(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        return await asyncio.to_thread(self._add_chunks_sync, chunks, embeddings)

    async def search(
        self, query_embedding: list[float], top_k: int = 5, filters: Optional[dict] = None
    ) -> list[dict]:
        return await asyncio.to_thread(self._search_sync, query_embedding, top_k, filters)

    async def delete_document(self, document_id: uuid.UUID) -> int:
        return await asyncio.to_thread(self._delete_document_sync, document_id)

    async def list_documents(self) -> list[dict]:
        return await asyncio.to_thread(self._list_documents_sync)

    async def close(self) -> None:
        await asyncio.to_thread(self._close_sync)
