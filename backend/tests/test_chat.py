"""Integration tests for the RAGChat backend."""

import pytest
from httpx import ASGITransport, AsyncClient
from src.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """Health check endpoint returns 200."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_chat_empty_query(client: AsyncClient):
    """Chat endpoint rejects empty query."""
    response = await client.post("/api/chat", json={"query": ""})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_search_empty_query(client: AsyncClient):
    """Search endpoint rejects empty query."""
    response = await client.post("/api/search", json={"query": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_summarize_empty_text(client: AsyncClient):
    """Summarize endpoint rejects empty text."""
    response = await client.post("/api/summarize", json={"text": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_explain_empty_concept(client: AsyncClient):
    """Explain endpoint rejects empty concept."""
    response = await client.post("/api/explain", json={"concept": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_translate_empty_text(client: AsyncClient):
    """Translate endpoint rejects empty text."""
    response = await client.post("/api/translate", json={"text": "", "target_lang": "vi"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_documents_empty(client: AsyncClient):
    """List documents returns empty array when no documents indexed."""
    response = await client.get("/api/documents")
    assert response.status_code == 200
    data = response.json()
    assert "documents" in data
    assert isinstance(data["documents"], list)
