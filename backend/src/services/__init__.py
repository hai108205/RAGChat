"""Services package — chat service and document ingestion service."""

from src.services.chat_service.chat_history import ChatHistory, init_chat_history
from src.services.chat_service.ctx_strategy import (
    SynthesisStrategyType,
    get_ctx_synthesis_strategies,
    get_ctx_synthesis_strategy,
)
from src.services.chat_service.conversation_handler import (
    refine_question,
    answer,
    answer_with_context,
)

__all__ = [
    # Chat history
    "ChatHistory",
    "init_chat_history",
    # Synthesis strategies
    "SynthesisStrategyType",
    "get_ctx_synthesis_strategies",
    "get_ctx_synthesis_strategy",
    # Conversation handler
    "refine_question",
    "answer",
    "answer_with_context",
]