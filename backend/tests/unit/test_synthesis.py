"""Unit tests for synthesis strategies with a fake LLM."""

import pytest

from src.rag.prompt.builder import PromptBuilder
from src.services.chat_service.ctx_strategy import (
    CreateAndRefineStrategy,
    TreeSummarizationStrategy,
    get_ctx_synthesis_strategy,
    get_ctx_synthesis_strategies,
)
from src.services.ingest_documents_service.document import Document


class FakeLLM:
    """Records calls and returns canned answers."""

    def __init__(self):
        self.calls = []

    async def generate(self, system_prompt, user_message, **kwargs):
        self.calls.append((system_prompt, user_message))
        return f"answer-{len(self.calls)}"


def make_docs(n):
    return [Document(page_content=f"chunk {i}", metadata={}) for i in range(n)]


class TestCreateAndRefine:
    async def test_single_chunk_one_call(self):
        llm = FakeLLM()
        strategy = CreateAndRefineStrategy(llm, PromptBuilder())
        answer, prompts = await strategy.generate_response(make_docs(1), "q?")
        assert answer == "answer-1"
        assert len(llm.calls) == 1
        assert len(prompts) == 1

    async def test_multiple_chunks_sequential_refinement(self):
        llm = FakeLLM()
        strategy = CreateAndRefineStrategy(llm, PromptBuilder())
        answer, prompts = await strategy.generate_response(make_docs(3), "q?")
        assert answer == "answer-3"  # last refinement wins
        assert len(llm.calls) == 3


class TestTreeSummarization:
    async def test_single_chunk(self):
        llm = FakeLLM()
        strategy = TreeSummarizationStrategy(llm, PromptBuilder())
        answer, _ = await strategy.generate_response(make_docs(1), "q?")
        assert answer == "answer-1"

    async def test_multiple_chunks_combines(self):
        llm = FakeLLM()
        strategy = TreeSummarizationStrategy(llm, PromptBuilder())
        answer, _ = await strategy.generate_response(make_docs(3), "q?", num_children=2)
        # 3 leaf answers + 2 combine batches + 1 final combine
        assert answer.startswith("answer-")
        assert len(llm.calls) == 6


class TestFactory:
    def test_list_strategies(self):
        names = get_ctx_synthesis_strategies()
        assert "create-and-refine" in names
        assert "tree-summarization" in names

    def test_create_by_name(self):
        llm = FakeLLM()
        s = get_ctx_synthesis_strategy("tree-summarization", llm=llm, prompt_builder=PromptBuilder())
        assert isinstance(s, TreeSummarizationStrategy)

    def test_unknown_raises(self):
        with pytest.raises(KeyError):
            get_ctx_synthesis_strategy("bogus")
