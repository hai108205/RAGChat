"""Conversation handler — question refinement, direct answer, and context-aware answer."""

import re
from typing import Any

from src.helpers.log import get_logger
from src.services.chat_service.chat_history import ChatHistory
from src.services.chat_service.ctx_strategy import BaseSynthesisStrategy
from src.services.ingest_documents_service.document import Document

logger = get_logger(__name__)


async def refine_question(
    llm,
    question: str,
    chat_history: ChatHistory,
    prompt_builder,
    max_new_tokens: int = 128,
) -> str:
    """Refine the question to be standalone using conversation history.

    Args:
        llm: The LLM adapter.
        question: The original user question.
        chat_history: Server-side chat history ring buffer.
        prompt_builder: Prompt builder with conversation-awareness templates.
        max_new_tokens: Max tokens for the refinement response.

    Returns:
        The refined standalone question (or original if no history).
    """
    if chat_history and len(chat_history) > 0:
        logger.info("--- Refining the question based on the chat history... ---")

        system_prompt, user_message = prompt_builder.build_refined_question_prompt(
            question=question,
            chat_history=str(chat_history),
        )

        logger.info(f"--- Refine prompt: {user_message[:200]}... ---")

        refined_question = await llm.generate(
            system_prompt=system_prompt,
            user_message=user_message,
        )

        logger.info(f"--- Refined Question: {refined_question} ---")

        return refined_question.strip() if refined_question.strip() else question
    else:
        return question


async def answer(
    llm,
    question: str,
    chat_history: ChatHistory,
    prompt_builder,
    max_new_tokens: int = 512,
) -> str:
    """Generate a direct answer (no RAG) with conversation awareness.

    Args:
        llm: The LLM adapter.
        question: The user's question.
        chat_history: Server-side chat history ring buffer.
        prompt_builder: Prompt builder.
        max_new_tokens: Max tokens for the answer.

    Returns:
        The generated answer text.
    """
    if chat_history and len(chat_history) > 0:
        logger.info("--- Answer the question based on the chat history... ---")

        system_prompt, user_message = prompt_builder.build_conversation_answer_prompt(
            question=question,
            chat_history=str(chat_history),
        )

        logger.debug(f"--- Prompt: {user_message[:200]}... ---")

        return await llm.generate(
            system_prompt=system_prompt,
            user_message=user_message,
        )
    else:
        system_prompt, user_message = prompt_builder.build_qa_prompt(question=question)
        logger.debug(f"--- Prompt: {user_message[:200]}... ---")
        return await llm.generate(
            system_prompt=system_prompt,
            user_message=user_message,
        )


async def answer_with_context(
    llm,
    ctx_synthesis_strategy: BaseSynthesisStrategy,
    question: str,
    chat_history: ChatHistory,
    retrieved_contents: list[Document],
    prompt_builder,
    max_new_tokens: int = 512,
) -> tuple[str, list[str]]:
    """Generate an answer using a context synthesis strategy and retrieved contents.

    Falls back to direct answer if no retrieved contents.

    Args:
        llm: The LLM adapter.
        ctx_synthesis_strategy: Synthesis strategy instance.
        question: The user's question.
        chat_history: Server-side chat history ring buffer.
        retrieved_contents: List of retrieved document chunks.
        prompt_builder: Prompt builder.
        max_new_tokens: Max tokens for the answer.

    Returns:
        Tuple of (answer_text, list_of_prompts_used).
    """
    if not retrieved_contents:
        direct_answer = await answer(llm, question, chat_history, prompt_builder, max_new_tokens)
        return direct_answer, []

    answer_text, fmt_prompts = await ctx_synthesis_strategy.generate_response(
        retrieved_contents, question, max_new_tokens=max_new_tokens
    )

    return answer_text, fmt_prompts