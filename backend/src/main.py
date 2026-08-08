"""RAGChat Backend — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.storage.vectorstore import VectorStore
from src.rag.embedding.embedder import Embedder
from src.rag.llm.adapter import create_llm_adapter
from src.rag.pipeline import RAGPipeline
from src.monitoring import setup_metrics
from src.api import chat, documents
from src.queue import close_redis_pool
from src.services.chat_service.chat_history import init_chat_history
from src.helpers.log import get_logger

logger = get_logger(__name__)

# Global instances initialized at startup
embedder: Embedder
vector_store: VectorStore
pipeline: RAGPipeline
chat_history: list  # Server-side ring buffer for session-less chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    global embedder, vector_store, pipeline, chat_history

    logger.info("Starting RAGChat backend...")

    embedder = Embedder(
        api_key=settings.openai_api_key,
        model=settings.embedding_model,
    )

    vector_store = VectorStore(settings.database_url)
    await vector_store.initialize()

    llm = create_llm_adapter(
        provider=settings.llm_provider,
        model=settings.model,
        api_key=settings.openai_api_key if settings.llm_provider == "openai" else settings.anthropic_api_key,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
    )

    pipeline = RAGPipeline(
        embedder=embedder,
        vector_store=vector_store,
        llm=llm,
        top_k=settings.top_k,
        synthesis_strategy=settings.synthesis_strategy,
    )

    # Initialize server-side chat history (ring buffer)
    chat_history = init_chat_history(total_length=settings.chat_history_length)

    logger.info("RAGChat backend started successfully.")

    yield

    logger.info("Shutting down RAGChat backend...")
    await close_redis_pool()
    await vector_store.close()
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
app.include_router(documents.router, prefix="/api")

setup_metrics(app)


@app.get("/health")
async def health():
    return {"status": "ok"}