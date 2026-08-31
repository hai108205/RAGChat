"""Async chat job API endpoints — enqueue RAG questions for background processing."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.api.deps import require_api_key
from src.helpers.log import get_logger
from src.taskqueue import enqueue_chat_job

logger = get_logger(__name__)
router = APIRouter(tags=["chat_jobs"], dependencies=[Depends(require_api_key)])


class ChatJobRequest(BaseModel):
    query: str = Field(..., min_length=1, description="User's question")
    request_id: str = Field(..., min_length=1, description="Unique request ID for idempotency & correlation")
    user_id: str | None = Field(None, description="Rocket.Chat user ID")
    room_id: str | None = Field(None, description="Rocket.Chat room ID")
    thread_id: str | None = Field(None, description="Rocket.Chat thread ID")
    placeholder_id: str | None = Field(None, description="Rocket.Chat placeholder message ID")
    history: list[dict] | None = Field(None, description="Conversation history")


class ChatJobResponse(BaseModel):
    status: str = "accepted"
    job_id: str
    request_id: str


@router.post("/chat/async", response_model=ChatJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_chat(request: ChatJobRequest):
    """Enqueue a RAG chat question to ARQ worker. Returns 202 Accepted immediately."""
    try:
        job_id = await enqueue_chat_job(
            request_id=request.request_id,
            query=request.query,
            user_id=request.user_id or "",
            room_id=request.room_id or "",
            thread_id=request.thread_id or "",
            placeholder_id=request.placeholder_id or "",
            history=request.history,
        )
        return ChatJobResponse(
            status="accepted",
            job_id=job_id,
            request_id=request.request_id,
        )
    except Exception as e:
        logger.exception("Failed to enqueue chat job")
        raise HTTPException(status_code=500, detail=f"Failed to enqueue chat job: {e}")
