"""Synthesis strategies — strategies for combining multiple retrieved chunks into a single answer."""

import asyncio
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

from langchain_core.documents import Document

from src.helpers.log import get_logger
from src.rag.llm.runtime import ainvoke

logger = get_logger(__name__)


class SynthesisStrategyType(Enum):
    CREATE_AND_REFINE = "create-and-refine"
    TREE_SUMMARIZATION = "tree-summarization"


class BaseSynthesisStrategy(ABC):
    """Abstract base for synthesis strategies."""

    def __init__(self, llm):
        """Initialize with an LLM adapter instance.

        Args:
            llm: An LLM adapter (e.g., OpenAIAdapter, ClaudeAdapter) with a
                 `generate(system_prompt, user_message) -> str` method.
        """
        self.llm = llm

    @abstractmethod
    async def generate_response(
        self,
        retrieved_contents: list[Document],
        question: str,
        max_new_tokens: int = 512,
    ) -> tuple[str, list[str]]:
        """Generate a response using the synthesis strategy.

        Args:
            retrieved_contents: List of retrieved document chunks.
            question: The user's question.
            max_new_tokens: Max tokens for the generated response.

        Returns:
            Tuple of (answer_text, list_of_prompts_used).
        """
        ...


class CreateAndRefineStrategy(BaseSynthesisStrategy):
    """Sequential refinement: start with first chunk, then refine with subsequent chunks."""

    def __init__(self, llm, prompt_builder):
        super().__init__(llm)
        self._prompt_builder = prompt_builder

    async def generate_response(
        self,
        retrieved_contents: list[Document],
        question: str,
        max_new_tokens: int = 512,
    ) -> tuple[str, list[str]]:
        cur_response = None
        fmt_prompts = []
        num_of_contents = len(retrieved_contents)

        for idx, node in enumerate(retrieved_contents, start=1):
            logger.info(f"--- Generating an answer for the chunk {idx} ... ---")
            context = node.page_content
            logger.debug(f"--- Context: '{context[:200]}...' ---")

            if idx == 1:
                system_prompt, user_message = self._prompt_builder.build_ctx_prompt(
                    question=question, context=context
                )
            else:
                system_prompt, user_message = self._prompt_builder.build_refined_ctx_prompt(
                    context=context,
                    question=question,
                    existing_answer=str(cur_response),
                )
            fmt_prompts.append(f"{system_prompt}\n\n{user_message}")

            cur_response = await ainvoke(
                self.llm,
                system_prompt=system_prompt,
                user_message=user_message,
            )
            logger.debug(f"--- Current response: '{cur_response[:200]}...' ---")

        return cur_response, fmt_prompts


class TreeSummarizationStrategy(BaseSynthesisStrategy):
    """Concurrent hierarchical summarization — combines chunks in a tree structure."""

    def __init__(self, llm, prompt_builder):
        super().__init__(llm)
        self._prompt_builder = prompt_builder

    async def generate_response(
        self,
        retrieved_contents: list[Document],
        question: str,
        max_new_tokens: int = 512,
        num_children: int = 2,
    ) -> tuple[str, list[str]]:
        # Generate all prompts + answers concurrently
        async def process_chunk(idx: int, content: Document) -> tuple[int, str, str]:
            logger.info(f"--- Generating an answer for the chunk {idx} ... ---")
            system_prompt, user_message = self._prompt_builder.build_ctx_prompt(
                question=question, context=content.page_content
            )
            answer = await ainvoke(
                self.llm,
                system_prompt=system_prompt,
                user_message=user_message,
            )
            return idx, answer, f"{system_prompt}\n\n{user_message}"

        tasks = [
            process_chunk(idx, content)
            for idx, content in enumerate(retrieved_contents, start=1)
        ]
        results = await asyncio.gather(*tasks)

        # Sort by index
        sorted_results = sorted(results, key=lambda x: x[0])
        node_responses = [r[1] for r in sorted_results]
        fmt_prompts = [r[2] for r in sorted_results]

        # Combine hierarchically
        response, combine_prompts = await self._combine_results(
            node_responses,
            question,
            fmt_prompts,
            max_new_tokens=max_new_tokens,
            num_children=num_children,
        )

        return response, fmt_prompts + combine_prompts

    async def _combine_results(
        self,
        texts: list[str],
        question: str,
        cur_prompts: list[str],
        max_new_tokens: int = 512,
        num_children: int = 2,
    ) -> tuple[str, list[str]]:
        """Recursively combine results in batches of num_children."""
        new_prompts = []

        async def process_batch(batch_idx: int, text_batch: list[str]) -> tuple[int, str, str]:
            logger.info(f"--- Creating prompts in batches of size {len(text_batch)} ... ---")
            context = "\n\n".join(text_batch)
            system_prompt, user_message = self._prompt_builder.build_ctx_prompt(
                question=question, context=context
            )
            answer = await ainvoke(
                self.llm,
                system_prompt=system_prompt,
                user_message=user_message,
            )
            return batch_idx, answer, f"{system_prompt}\n\n{user_message}"

        batch_tasks = []
        for batch_idx, idx in enumerate(range(0, len(texts), num_children)):
            text_batch = texts[idx : idx + num_children]
            batch_tasks.append(process_batch(batch_idx, text_batch))

        batch_results = await asyncio.gather(*batch_tasks)
        sorted_batch = sorted(batch_results, key=lambda x: x[0])

        combined = [r[1] for r in sorted_batch]
        new_prompts = [r[2] for r in sorted_batch]

        if len(combined) == 1:
            logger.info("--- Generating final response ... ---")
            return combined[0], new_prompts
        else:
            logger.info(f"--- Combining {len(combined)} responses ... ---")
            deeper, deeper_prompts = await self._combine_results(
                combined,
                question,
                cur_prompts + new_prompts,
                max_new_tokens=max_new_tokens,
                num_children=num_children,
            )
            return deeper, new_prompts + deeper_prompts


STRATEGIES = {
    SynthesisStrategyType.CREATE_AND_REFINE.value: CreateAndRefineStrategy,
    SynthesisStrategyType.TREE_SUMMARIZATION.value: TreeSummarizationStrategy,
}


def get_ctx_synthesis_strategies() -> list[str]:
    """Return list of available synthesis strategy names."""
    return list(STRATEGIES.keys())


def get_ctx_synthesis_strategy(strategy_name: str, **kwargs):
    """Factory: return a synthesis strategy instance by name.

    Args:
        strategy_name: One of 'create-and-refine' or 'tree-summarization'.
        **kwargs: Passed to the strategy constructor (llm, prompt_builder).

    Returns:
        A BaseSynthesisStrategy instance.

    Raises:
        KeyError: If the strategy name is not supported.
    """
    strategy = STRATEGIES.get(strategy_name)

    if strategy is None:
        raise KeyError(strategy_name + " is a not supported synthesis strategy")

    return strategy(**kwargs)