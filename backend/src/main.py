"""RAGChat Backend — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.storage.vectorstore import VectorStore
from src.rag.embedding.embedder import Embedder
from src.rag.llm.adapter import create_llm_adapter
from src.rag.pipeline import RAGPipeline
from src.api import chat, documents

# Global instances initialized at startup
embedder: Embedder
vector_store: VectorStore
pipeline: RAGPipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    global embedder, vector_store, pipeline

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
    )

    yield

    await vector_store.close()


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


@app.get("/health")
async def health():
    return {"status": "ok"}
