"""Global singleton state — initialized at FastAPI startup, consumed by API endpoints.

Endpoints import `state` from here instead of `src.main` to avoid a circular
import (main imports the routers, so routers cannot import main).
"""

from langchain_core.language_models.chat_models import BaseChatModel

from src.rag.embedding.embedder import Embedder
from src.rag.pipeline import RAGPipeline
from src.services.chat_service.chat_history import ChatHistory
from src.storage.vectorstore import VectorStore


class AppState:
    """Container for singletons created during the application lifespan."""

    def __init__(self) -> None:
        self.embedder: Embedder | None = None
        self.vector_store: VectorStore | None = None
        self.llm: BaseChatModel | None = None
        self.pipeline: RAGPipeline | None = None
        self.chat_history: ChatHistory | None = None


state = AppState()
