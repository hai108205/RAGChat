"""Unit tests for application config."""

import pytest
from src.config import Settings


class TestSettings:
    def test_default_values(self):
        settings = Settings()
        assert settings.database_url == "postgresql://ragchat:ragchat@localhost:5432/ragchat"
        assert settings.llm_provider == "openai"
        assert settings.model == "gpt-4o"
        assert settings.temperature == 0.7
        assert settings.max_tokens == 2048
        assert settings.embedding_model == "text-embedding-3-small"
        assert settings.embedding_dimension == 1536
        assert settings.top_k == 5
        assert settings.chunk_size == 1000
        assert settings.chunk_overlap == 200
        assert settings.host == "0.0.0.0"
        assert settings.port == 8000
        assert settings.debug is False

    def test_redis_url_default(self):
        settings = Settings()
        assert settings.redis_url == "redis://localhost:6379/0"

    def test_minio_defaults(self):
        settings = Settings()
        assert settings.minio_endpoint == "localhost:9000"
        assert settings.minio_access_key == "minioadmin"
        assert settings.minio_secure is False
        assert settings.use_minio is False

    def test_extra_fields_ignored(self):
        settings = Settings(extra_field="should_be_ignored")
        assert not hasattr(settings, "extra_field")