"""LLM adapter factory — re-exports the shared LLMAdapter base from base.py."""

from src.rag.llm.base import LLMAdapter

from .openai import OpenAIAdapter
from .claude import ClaudeAdapter

__all__ = ["LLMAdapter", "create_llm_adapter"]


def create_llm_adapter(
    provider: str,
    model: str,
    api_key: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> LLMAdapter:
    """Factory to create the appropriate LLM adapter.

    Args:
        provider: LLM backend identifier (``"openai"`` or ``"claude"``).
        model: Model name string for the selected provider.
        api_key: API key for authentication.
        temperature: Sampling temperature (0.0-1.0). Defaults to 0.7.
        max_tokens: Maximum tokens in the generated response. Defaults to 2048.

    Returns:
        An :class:`LLMAdapter` subclass instance.

    Raises:
        ValueError: If *provider* is not supported.
    """
    if provider == "openai":
        return OpenAIAdapter(
            api_key=api_key,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    if provider == "claude":
        return ClaudeAdapter(
            api_key=api_key,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    raise ValueError(f"Unsupported LLM provider: {provider}")
