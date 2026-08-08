"""Claude LLM adapter using LangChain.

Async wrapper around ChatAnthropic that offloads synchronous calls to a
thread pool, keeping the event loop free.
"""

import asyncio
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

from src.rag.llm.base import LLMAdapter


class ClaudeAdapter(LLMAdapter):
    """Async adapter for Anthropic Claude models via LangChain.

    Wraps :class:`~langchain_anthropic.ChatAnthropic` so that the synchronous
    ``invoke`` call runs on a thread pool, providing a native async
    ``generate`` method.

    Attributes:
        model_name: The Claude model identifier in use.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "claude-3-5-sonnet-20241022",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> None:
        """Initialise the Claude adapter.

        Args:
            api_key: Anthropic API key.
            model: Model identifier. Defaults to
                ``"claude-3-5-sonnet-20241022"``.
            temperature: Sampling temperature. Defaults to 0.7.
            max_tokens: Maximum completion tokens. Defaults to 2048.
        """
        self._model = ChatAnthropic(
            anthropic_api_key=api_key,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self._model_name = model

    async def generate(
        self, system_prompt: str, user_message: str, **kwargs: Any
    ) -> str:
        """Generate a response for the given conversation turn.

        Args:
            system_prompt: System-level instruction string.
            user_message: The user's input message.
            **kwargs: Additional keyword arguments forwarded to the model.

        Returns:
            The text content of the model's response.
        """
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ]
        response = await asyncio.to_thread(self._model.invoke, messages, **kwargs)
        return response.content

    @property
    def model_name(self) -> str:
        """Return the Claude model name."""
        return self._model_name
