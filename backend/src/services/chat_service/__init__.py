"""Chat service — conversation handler, synthesis strategies, and chat history."""

from src.services.chat_service.chat_history import ChatHistory, init_chat_history
from src.services.chat_service.ctx_strategy import (
    SynthesisStrategyType,
    BaseSynthesisStrategy,
    CreateAndRefineStrategy,
    TreeSummarizationStrategy,
    get_ctx_synthesis_strategies,
    get_ctx_synthesis_strategy,
)
from src.services.chat_service.conversation_handler import (
    refine_question,
    answer,
    answer_with_context,
)

__all__ = [
    "ChatHistory",
    "init_chat_history",
    "SynthesisStrategyType",
    "BaseSynthesisStrategy",
    "CreateAndRefineStrategy",
    "TreeSummarizationStrategy",
    "get_ctx_synthesis_strategies",
    "get_ctx_synthesis_strategy",
    "refine_question",
    "answer",
    "answer_with_context",
]