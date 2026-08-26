"""Unit tests for application config."""

import os

from src.config import Settings


class TestSettings:
    def _clean_env(self):
        """Remove all LLM-related env vars so we read true pydantic defaults."""
        remove_keys = [
            "DATABASE_URL",
            "MODEL",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "OPENAI_BASE_URL",
            "ANTHROPIC_BASE_URL",
            "EMBEDDING_MODEL",
            "API_KEY",
            "APP_CALLBACK_URL",
            "CHUNKING_STRATEGY",
        ]
        return {k: os.environ.pop(k, None) for k in remove_keys}

    def _restore_env(self, prev: dict) -> None:
        for k, v in prev.items():
            if v is not None:
                os.environ[k] = v

    def test_default_values(self):
        saved = self._clean_env()
        try:
            settings = Settings(_env_file=None)
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
        finally:
            self._restore_env(saved)

    def test_redis_url_default(self):
        saved = self._clean_env()
        try:
            settings = Settings(_env_file=None)
            assert settings.redis_url == "redis://localhost:6379/0"
        finally:
            self._restore_env(saved)

    def test_minio_defaults(self):
        saved = self._clean_env()
        try:
            settings = Settings(_env_file=None)
            assert settings.minio_endpoint == "localhost:9000"
            assert settings.minio_access_key == "minioadmin"
            assert settings.minio_secure is False
            assert settings.use_minio is False
        finally:
            self._restore_env(saved)

    def test_extra_fields_ignored(self):
        saved = self._clean_env()
        try:
            settings = Settings(extra_field="should_be_ignore")
            assert not hasattr(settings, "extra_field")
        finally:
            self._restore_env(saved)
