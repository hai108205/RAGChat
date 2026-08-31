"""Chat API endpoints — RAG Q&A, search, summarization, explanation, translation."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.deps import require_api_key
from src.helpers.log import get_logger
from src.state import state

logger = get_logger(__name__)
router = APIRouter(tags=["chat"], dependencies=[Depends(require_api_key)])


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, description="User's question")
    user_id: str | None = Field(None, description="Rocket.Chat user ID")
    room_id: str | None = Field(None, description="Rocket.Chat room ID")
    history: list[dict] | None = Field(None, description="Conversation history")


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    model: str


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    top_k: int = Field(5, ge=1, le=20, description="Number of results")
    user_id: str | None = Field(None, description="Rocket.Chat user ID")
    room_id: str | None = Field(None, description="Rocket.Chat room ID")


class SearchResponse(BaseModel):
    results: list[dict]


class TextRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ConceptRequest(BaseModel):
    concept: str = Field(..., min_length=1)


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    target_lang: str = Field("vi", description="Target language code")


class GenerateReplyRequest(BaseModel):
    text: str = Field(..., min_length=1)
    sender_name: str | None = Field(None, description="Original message sender")


class TextResponse(BaseModel):
    summary: str = ""


class ExplanationResponse(BaseModel):
    explanation: str = ""


class TranslationResponse(BaseModel):
    translation: str = ""


class GenerateReplyResponse(BaseModel):
    reply: str = ""


class ClearHistoryResponse(BaseModel):
    status: str = "ok"


def _require_pipeline():
    if state.pipeline is None:
        raise HTTPException(status_code=503, detail="Backend not initialized")
    return state.pipeline


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Ask a RAG question. Retrieves relevant documents and generates an answer with citations."""
    try:
        result = await _require_pipeline().ask(
            query=request.query,
            history=request.history,
            chat_history=state.chat_history,
            room_id=request.room_id,
            user_id=request.user_id,
        )
        return ChatResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /chat")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/chat/history", response_model=ClearHistoryResponse)
async def clear_history():
    """Clear the server-side chat history."""
    if state.chat_history is not None:
        state.chat_history.clear()
    return ClearHistoryResponse(status="ok")


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Semantic search across document chunks."""
    try:
        results = await _require_pipeline().search(
            query=request.query,
            top_k=request.top_k,
            room_id=request.room_id,
            user_id=request.user_id,
        )
        return SearchResponse(results=results)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /search")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summarize", response_model=TextResponse)
async def summarize(request: TextRequest):
    """Summarize the provided text."""
    try:
        summary = await _require_pipeline().summarize(text=request.text)
        return TextResponse(summary=summary)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /summarize")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/explain", response_model=ExplanationResponse)
async def explain(request: ConceptRequest):
    """Explain a concept in simple terms."""
    try:
        explanation = await _require_pipeline().explain(concept=request.concept)
        return ExplanationResponse(explanation=explanation)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /explain")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate", response_model=TranslationResponse)
async def translate(request: TranslateRequest):
    """Translate text to another language."""
    try:
        translation = await _require_pipeline().translate(
            text=request.text,
            target_lang=request.target_lang,
        )
        return TranslationResponse(translation=translation)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /translate")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-reply", response_model=GenerateReplyResponse)
async def generate_reply(request: GenerateReplyRequest):
    """Generate a suggested reply to a chat message."""
    try:
        reply = await _require_pipeline().generate_reply(
            text=request.text,
            sender_name=request.sender_name or "",
        )
        return GenerateReplyResponse(reply=reply)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /generate-reply")
        raise HTTPException(status_code=500, detail=str(e))
