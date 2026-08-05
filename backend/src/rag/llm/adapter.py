"""LLM adapter factory and abstract interface.

Provides a common interface for different LLM backends (OpenAI, Claude)
and a factory function to instantiate the appropriate adapter at runtime.
"""

from abc import ABC, abstractmethod
from typing import Any

from .openai import OpenAIAdapter
from .claude import ClaudeAdapter


class LLMAdapter(ABC):
    """Abstract base class for LLM adapters.

    All concrete adapters must implement ``generate`` so that callers
    can interact with any supported LLM through a uniform async API.
    """

    @abstractmethod
    async def generate(
        self, system_prompt: str, user_message: str, **kwargs: Any
    ) -> str:
        """Generate a response from the LLM.

        Args:
            system_prompt: The system-level instruction for the model.
            user_message: The user's input message.
            **kwargs: Additional provider-specific parameters.

        Returns:
            The generated text response as a string.
        """
        ...


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
