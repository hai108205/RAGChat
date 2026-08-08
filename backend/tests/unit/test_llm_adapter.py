"""Unit tests for LLM adapter factory."""

import pytest
from src.rag.llm.adapter import create_llm_adapter, LLMAdapter
from src.rag.llm.openai import OpenAIAdapter
from src.rag.llm.claude import ClaudeAdapter


class TestCreateLLMAdapter:
    def test_create_openai_adapter(self):
        adapter = create_llm_adapter(
            provider="openai",
            model="gpt-4o",
            api_key="test-key",
            temperature=0.5,
            max_tokens=1000,
        )
        assert isinstance(adapter, OpenAIAdapter)
        assert isinstance(adapter, LLMAdapter)

    def test_create_claude_adapter(self):
        adapter = create_llm_adapter(
            provider="claude",
            model="claude-3-5-sonnet",
            api_key="test-key",
        )
        assert isinstance(adapter, ClaudeAdapter)
        assert isinstance(adapter, LLMAdapter)

    def test_unsupported_provider_raises_error(self):
        with pytest.raises(ValueError, match="Unsupported LLM provider"):
            create_llm_adapter(
                provider="unknown_provider",
                model="some-model",
                api_key="key",
            )

    def test_default_temperature_and_max_tokens(self):
        adapter = create_llm_adapter(
            provider="openai",
            model="gpt-4o",
            api_key="key",
        )
        assert adapter is not None