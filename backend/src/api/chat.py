"""Chat API endpoints — RAG Q&A, search, summarization, explanation, translation."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from src.main import pipeline


router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, description="User's question")
    user_id: Optional[str] = Field(None, description="Rocket.Chat user ID")
    room_id: Optional[str] = Field(None, description="Rocket.Chat room ID")
    history: Optional[list[dict]] = Field(None, description="Conversation history")


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    model: str


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    top_k: int = Field(5, ge=1, le=20, description="Number of results")


class SearchResponse(BaseModel):
    results: list[dict]


class TextRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ConceptRequest(BaseModel):
    concept: str = Field(..., min_length=1)


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    target_lang: str = Field("vi", description="Target language code")


class TextResponse(BaseModel):
    summary: str = ""


class ExplanationResponse(BaseModel):
    explanation: str = ""


class TranslationResponse(BaseModel):
    translation: str = ""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Ask a RAG question. Retrieves relevant documents and generates an answer with citations."""
    try:
        result = await pipeline.ask(
            query=request.query,
            history=request.history,
        )
        return ChatResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Semantic search across document chunks."""
    try:
        results = await pipeline.search(
            query=request.query,
            top_k=request.top_k,
        )
        return SearchResponse(results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summarize", response_model=TextResponse)
async def summarize(request: TextRequest):
    """Summarize the provided text."""
    try:
        summary = await pipeline.summarize(text=request.text)
        return TextResponse(summary=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/explain", response_model=ExplanationResponse)
async def explain(request: ConceptRequest):
    """Explain a concept in simple terms."""
    try:
        explanation = await pipeline.explain(concept=request.concept)
        return ExplanationResponse(explanation=explanation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate", response_model=TranslationResponse)
async def translate(request: TranslateRequest):
    """Translate text to another language."""
    try:
        translation = await pipeline.translate(
            text=request.text,
            target_lang=request.target_lang,
        )
        return TranslationResponse(translation=translation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
