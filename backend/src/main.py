"""RAGChat Backend — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api import chat, chat_jobs, documents
from src.config import settings
from src.helpers.log import get_logger
from src.monitoring import setup_metrics
from src.rag.embedding.embedder import Embedder
from src.rag.llm.runtime import create_chat_model
from src.rag.pipeline import RAGPipeline
from src.services.chat_service.chat_history import init_chat_history
from src.state import state
from src.storage.vectorstore import VectorStore
from src.taskqueue import close_redis_pool

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting RAGChat backend...")

    state.embedder = Embedder(
        api_key=settings.openai_api_key,
        model=settings.embedding_model,
        base_url=settings.openai_base_url,
    )

    state.vector_store = VectorStore(
        settings.database_url,
        embeddings=state.embedder.embeddings,
    )
    await state.vector_store.initialize()

    state.llm = create_chat_model(
        provider=settings.llm_provider,
        model=settings.model,
        api_key=settings.openai_api_key if settings.llm_provider == "openai" else settings.anthropic_api_key,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        base_url=(
            settings.openai_base_url if settings.llm_provider == "openai" else settings.anthropic_base_url
        ),
    )

    state.pipeline = RAGPipeline(
        embedder=state.embedder,
        vector_store=state.vector_store,
        llm=state.llm,
        top_k=settings.top_k,
        synthesis_strategy=settings.synthesis_strategy,
        provider=settings.llm_provider,
    )

    # Initialize server-side chat history (ring buffer)
    state.chat_history = init_chat_history(total_length=settings.chat_history_length)

    logger.info("RAGChat backend started successfully.")

    yield

    logger.info("Shutting down RAGChat backend...")
    await close_redis_pool()
    if state.vector_store is not None:
        await state.vector_store.close()
    logger.info("RAGChat backend shut down.")


app = FastAPI(
    title="RAGChat Backend",
    description="RAG pipeline for Rocket.Chat document Q&A",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(chat_jobs.router, prefix="/api")
app.include_router(documents.router, prefix="/api")

setup_metrics(app)


@app.get("/health")
async def health():
    return {"status": "ok"}
