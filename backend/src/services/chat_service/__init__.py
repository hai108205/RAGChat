"""Chat service — conversation handler, synthesis strategies, and chat history."""

from src.services.chat_service.chat_history import ChatHistory, init_chat_history
from src.services.chat_service.conversation_handler import (
    answer,
    answer_with_context,
    refine_question,
)
from src.services.chat_service.ctx_strategy import (
    BaseSynthesisStrategy,
    CreateAndRefineStrategy,
    SynthesisStrategyType,
    TreeSummarizationStrategy,
    get_ctx_synthesis_strategies,
    get_ctx_synthesis_strategy,
)

__all__ = [
    "BaseSynthesisStrategy",
    "ChatHistory",
    "CreateAndRefineStrategy",
    "SynthesisStrategyType",
    "TreeSummarizationStrategy",
    "answer",
    "answer_with_context",
    "get_ctx_synthesis_strategies",
    "get_ctx_synthesis_strategy",
    "init_chat_history",
    "refine_question",
]
