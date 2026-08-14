"""Services package — chat service and document ingestion service."""

from src.services.chat_service.chat_history import ChatHistory, init_chat_history
from src.services.chat_service.conversation_handler import (
    answer,
    answer_with_context,
    refine_question,
)
from src.services.chat_service.ctx_strategy import (
    SynthesisStrategyType,
    get_ctx_synthesis_strategies,
    get_ctx_synthesis_strategy,
)

__all__ = [
    "ChatHistory",
    "SynthesisStrategyType",
    "answer",
    "answer_with_context",
    "get_ctx_synthesis_strategies",
    "get_ctx_synthesis_strategy",
    "init_chat_history",
    "refine_question",
]
