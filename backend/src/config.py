"""Application configuration loaded from environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql://ragchat:ragchat@localhost:5432/ragchat"
    registry_url: str = "sqlite:///./data/registry.db"  # SQLite for DocumentRegistry

    # LLM
    llm_provider: str = "openai"  # openai | claude
    model: str = "gpt-4o"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    temperature: float = 0.7
    max_tokens: int = 2048

    # Embedding
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536

    # Retrieval
    top_k: int = 5
    similarity_threshold: float = 0.3  # Plan 2.4: configurable relevance threshold

    # Document processing
    chunk_size: int = 1000
    chunk_overlap: int = 200
    upload_dir: str = "./data/uploads"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Auth — Bearer token required on /api/* when set; empty = open (dev mode)
    api_key: str = ""

    # Rocket.Chat app callback (webhook) for async job notifications
    app_callback_url: str = ""

    # Redis / Queue
    redis_url: str = "redis://localhost:6379/0"
    use_async_indexing: bool = False  # Set to True to use ARQ background jobs

    # MinIO / Object Storage
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    use_minio: bool = False  # Set to True to use MinIO instead of local filesystem

    # Chat
    chat_history_length: int = 2  # Server-side ring buffer max turns
    synthesis_strategy: str = "tree-summarization"  # tree-summarization | create-and-refine


settings = Settings()