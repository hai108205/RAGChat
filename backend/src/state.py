"""Global singleton state — initialized at FastAPI startup, consumed by API endpoints.

Endpoints import `state` from here instead of `src.main` to avoid a circular
import (main imports the routers, so routers cannot import main).
"""

from typing import Optional

from src.rag.embedding.embedder import Embedder
from src.rag.llm.adapter import LLMAdapter
from src.rag.pipeline import RAGPipeline
from src.services.chat_service.chat_history import ChatHistory
from src.storage.vectorstore import VectorStore


class AppState:
    """Container for singletons created during the application lifespan."""

    def __init__(self) -> None:
        self.embedder: Optional[Embedder] = None
        self.vector_store: Optional[VectorStore] = None
        self.llm: Optional[LLMAdapter] = None
        self.pipeline: Optional[RAGPipeline] = None
        self.chat_history: Optional[ChatHistory] = None


state = AppState()
