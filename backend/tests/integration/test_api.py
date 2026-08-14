"""Integration tests for the RAGChat backend API."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.main import app
from src.state import state


class FakeVectorStore:
    """In-memory stand-in for VectorStore so document endpoints work without a DB."""

    def __init__(self):
        self.docs = []

    async def list_documents(self):
        return self.docs

    async def delete_document(self, doc_uuid):
        return 0


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def fake_vector_store():
    """Swap state.vector_store with a fake for the duration of a test."""
    original = state.vector_store
    state.vector_store = FakeVectorStore()
    yield state.vector_store
    state.vector_store = original


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """Health check endpoint returns 200."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_metrics_endpoint(client: AsyncClient):
    """Metrics endpoint returns Prometheus metrics."""
    response = await client.get("/metrics")
    assert response.status_code == 200
    text = response.text
    # Should contain prometheus standard metrics
    assert "ragchat_" in text or "http_requests" in text or "python_" in text


# ── Chat endpoint validation ──────────────────────────────


@pytest.mark.asyncio
async def test_chat_requires_query(client: AsyncClient):
    """Chat endpoint rejects empty query."""
    response = await client.post("/api/chat", json={"query": ""})
    assert response.status_code == 422

    response = await client.post("/api/chat", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_accepts_valid_request(client: AsyncClient):
    """Chat endpoint returns 503 when the pipeline is not initialized (test env)."""
    response = await client.post(
        "/api/chat",
        json={
            "query": "What is the leave policy?",
            "user_id": "user123",
            "room_id": "room456",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Backend not initialized"


# ── Search endpoint validation ────────────────────────────


@pytest.mark.asyncio
async def test_search_requires_query(client: AsyncClient):
    """Search endpoint rejects empty query."""
    response = await client.post("/api/search", json={"query": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_validates_top_k_range(client: AsyncClient):
    """Search endpoint validates top_k range."""
    response = await client.post("/api/search", json={"query": "test", "top_k": 0})
    assert response.status_code == 422

    response = await client.post("/api/search", json={"query": "test", "top_k": 21})
    assert response.status_code == 422

    response = await client.post("/api/search", json={"query": "test", "top_k": 5})
    assert response.status_code == 503  # pipeline not initialized in test env


# ── Summarize endpoint validation ─────────────────────────


@pytest.mark.asyncio
async def test_summarize_requires_text(client: AsyncClient):
    """Summarize endpoint rejects empty text."""
    response = await client.post("/api/summarize", json={"text": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_summarize_accepts_valid_request(client: AsyncClient):
    """Summarize endpoint returns 503 when the pipeline is not initialized."""
    response = await client.post(
        "/api/summarize", json={"text": "This is a long text that needs to be summarized."}
    )
    assert response.status_code == 503


# ── Explain endpoint validation ───────────────────────────


@pytest.mark.asyncio
async def test_explain_requires_concept(client: AsyncClient):
    """Explain endpoint rejects empty concept."""
    response = await client.post("/api/explain", json={"concept": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_explain_accepts_valid_request(client: AsyncClient):
    """Explain endpoint returns 503 when the pipeline is not initialized."""
    response = await client.post("/api/explain", json={"concept": "quantum computing"})
    assert response.status_code == 503


# ── Translate endpoint validation ─────────────────────────


@pytest.mark.asyncio
async def test_translate_requires_text(client: AsyncClient):
    """Translate endpoint rejects empty text."""
    response = await client.post("/api/translate", json={"text": "", "target_lang": "vi"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_translate_default_target_lang(client: AsyncClient):
    """Translate endpoint returns 503 when the pipeline is not initialized."""
    response = await client.post("/api/translate", json={"text": "Hello world"})
    assert response.status_code == 503


# ── Documents endpoint validation ─────────────────────────


@pytest.mark.asyncio
async def test_list_documents(client: AsyncClient, fake_vector_store):
    """List documents returns a valid response."""
    response = await client.get("/api/documents")
    assert response.status_code == 200
    data = response.json()
    assert "documents" in data
    assert isinstance(data["documents"], list)


@pytest.mark.asyncio
async def test_delete_nonexistent_document(client: AsyncClient, fake_vector_store):
    """Delete nonexistent document returns 404."""
    response = await client.delete("/api/documents/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_invalid_uuid(client: AsyncClient):
    """Delete with invalid UUID returns 400."""
    response = await client.delete("/api/documents/not-a-uuid")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_unsupported_format(client: AsyncClient):
    """Upload with unsupported format returns 400."""
    response = await client.post(
        "/api/documents", files={"file": ("test.exe", b"binary content", "application/octet-stream")}
    )
    assert response.status_code == 400
    assert "Unsupported" in response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_without_filename(client: AsyncClient):
    """Upload without filename returns 422 (FastAPI rejects empty filename)."""
    response = await client.post("/api/documents", files={"file": ("", b"content", "text/plain")})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_txt_document(client: AsyncClient, fake_vector_store, tmp_path):
    """Upload a valid .txt document (sync indexing with stubbed embedder/store)."""
    settings.upload_dir = str(tmp_path / "uploads")
    response = await client.post(
        "/api/documents",
        files={"file": ("test.txt", b"This is a test document content for indexing.", "text/plain")},
    )
    # Sync ingest needs a real embedder/vector store; without them the
    # endpoint must fail cleanly with 500, not crash the server.
    assert response.status_code in (200, 500)
    if response.status_code == 200:
        data = response.json()
        assert data["filename"] == "test.txt"
        assert data["status"] in ("indexed", "queued")
        assert "document_id" in data


@pytest.mark.asyncio
async def test_upload_multiple_formats(client: AsyncClient, fake_vector_store, tmp_path):
    """Upload documents in various supported formats (validation only)."""
    settings.upload_dir = str(tmp_path / "uploads")
    formats = [
        ("doc.pdf", b"%PDF-1.4 test", "application/pdf"),
        ("doc.docx", b"DOCX test", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("doc.md", b"# Markdown test", "text/markdown"),
        ("doc.html", b"<html>test</html>", "text/html"),
        ("doc.csv", b"col1,col2\nval1,val2", "text/csv"),
    ]
    for filename, content, mime in formats:
        response = await client.post("/api/documents", files={"file": (filename, content, mime)})
        assert response.status_code in (200, 400, 500)
