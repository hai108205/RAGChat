"""Unit tests for async chat job enqueue API."""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_enqueue_chat_success():
    """Test POST /api/chat/async successfully enqueues job and returns 202."""
    with patch("src.api.chat_jobs.enqueue_chat_job", new_callable=AsyncMock) as mock_enqueue:
        mock_enqueue.return_value = "chat:req-123"

        response = client.post(
            "/api/chat/async",
            json={
                "query": "Chính sách nghỉ phép là gì?",
                "request_id": "req-123",
                "user_id": "user-456",
                "room_id": "room-789",
                "thread_id": "thread-111",
                "placeholder_id": "msg-999",
                "history": [],
            },
        )

        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "accepted"
        assert data["job_id"] == "chat:req-123"
        assert data["request_id"] == "req-123"

        mock_enqueue.assert_awaited_once_with(
            request_id="req-123",
            query="Chính sách nghỉ phép là gì?",
            user_id="user-456",
            room_id="room-789",
            thread_id="thread-111",
            placeholder_id="msg-999",
            history=[],
        )


def test_enqueue_chat_validation_error():
    """Test POST /api/chat/async returns 422 if query or request_id is missing."""
    response = client.post(
        "/api/chat/async",
        json={
            "query": "",
            "request_id": "",
        },
    )
    assert response.status_code == 422
