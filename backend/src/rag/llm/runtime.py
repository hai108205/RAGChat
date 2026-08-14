"""LLM runtime helpers — construct raw LangChain chat models and invoke them.

Replaces the old provider-specific adapter classes with the native LangChain
``BaseChatModel`` implementations (``ChatOpenAI`` / ``ChatAnthropic``), so the
rest of the app works against the LangChain model interface directly.
"""

import asyncio
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI


def create_chat_model(
    provider: str,
    model: str,
    api_key: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> BaseChatModel:
    """Create the appropriate LangChain chat model for the given provider.

    Args:
        provider: LLM backend identifier (``"openai"`` or ``"claude"``).
        model: Model name string for the selected provider.
        api_key: API key for authentication.
        temperature: Sampling temperature (0.0-1.0). Defaults to 0.7.
        max_tokens: Maximum tokens in the generated response. Defaults to 2048.

    Returns:
        A LangChain ``BaseChatModel`` instance.

    Raises:
        ValueError: If *provider* is not supported.
    """
    if provider == "openai":
        return ChatOpenAI(
            openai_api_key=api_key,
            model_name=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    if provider == "claude":
        return ChatAnthropic(
            anthropic_api_key=api_key,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    raise ValueError(f"Unsupported LLM provider: {provider}")


async def ainvoke(llm: BaseChatModel, system_prompt: str, user_message: str, **kwargs: Any) -> str:
    """Generate a response for a system/user message pair.

    Offloads LangChain's synchronous ``invoke`` to a thread pool so the event
    loop stays free, and returns the response text.

    Args:
        llm: A LangChain chat model.
        system_prompt: System-level instruction string.
        user_message: The user's input message.
        **kwargs: Additional keyword arguments forwarded to the model.

    Returns:
        The generated text content.
    """
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]
    response = await asyncio.to_thread(llm.invoke, messages, **kwargs)
    return response.content