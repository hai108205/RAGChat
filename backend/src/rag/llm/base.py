"""Abstract LLM adapter interface shared by all providers."""

from abc import ABC, abstractmethod
from typing import Any


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
