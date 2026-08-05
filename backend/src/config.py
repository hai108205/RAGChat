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
    similarity_threshold: float = 0.7

    # Document processing
    chunk_size: int = 1000
    chunk_overlap: int = 200
    upload_dir: str = "./data/uploads"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False


settings = Settings()
