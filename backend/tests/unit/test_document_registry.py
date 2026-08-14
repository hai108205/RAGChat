"""Unit tests for DocumentRegistry (SQLite in-memory)."""

import pytest
from sqlmodel import Session, SQLModel, create_engine

from src.services.ingest_documents_service.document_registry import DocumentRegistry


@pytest.fixture
def registry():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield DocumentRegistry(session)


class TestDocumentRegistry:
    def test_upsert_and_get(self, registry):
        registry.upsert("doc1", filename="a.txt", version_hash="v1", chunk_ids=["c1", "c2"])
        record = registry.get("doc1")
        assert record is not None
        assert record.filename == "a.txt"
        assert record.version_hash == "v1"
        assert record.chunk_ids == ["c1", "c2"]

    def test_upsert_replaces_existing(self, registry):
        registry.upsert("doc1", filename="a.txt", version_hash="v1")
        registry.upsert("doc1", filename="a.txt", version_hash="v2")
        assert registry.get("doc1").version_hash == "v2"
        assert len(registry.get_all()) == 1

    def test_get_missing_returns_none(self, registry):
        assert registry.get("nope") is None

    def test_remove(self, registry):
        registry.upsert("doc1", filename="a.txt")
        registry.remove("doc1")
        assert registry.get("doc1") is None

    def test_remove_missing_is_noop(self, registry):
        registry.remove("nope")  # must not raise

    def test_get_by_filename(self, registry):
        registry.upsert("doc1", filename="a.txt")
        assert registry.get_by_filename("a.txt").document_id == "doc1"
        assert registry.get_by_filename("b.txt") is None

    def test_get_stale_documents(self, registry):
        registry.upsert("keep", version_hash="v1")
        registry.upsert("change", version_hash="old")
        registry.upsert("gone", version_hash="v1")

        new, changed, deleted = registry.get_stale_documents(
            {
                "keep": "v1",
                "change": "new",
                "added": "v1",
            }
        )
        assert new == {"added"}
        assert changed == {"change"}
        assert deleted == {"gone"}
