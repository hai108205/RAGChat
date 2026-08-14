"""Unit tests for synthesis strategies with a fake LLM."""

import pytest
from langchain_core.documents import Document

from src.rag.prompt.builder import PromptBuilder
from src.services.chat_service.ctx_strategy import (
    CreateAndRefineStrategy,
    TreeSummarizationStrategy,
    get_ctx_synthesis_strategies,
    get_ctx_synthesis_strategy,
)


class FakeLLM:
    """Records calls and returns canned answers."""

    def __init__(self):
        self.calls = []

    def invoke(self, messages, **kwargs):
        system = messages[0].content
        user = messages[1].content
        self.calls.append((system, user))
        return _ANSWER(len(self.calls))


def _ANSWER(n):
    return type("Resp", (), {"content": f"answer-{n}"})()


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
        answer, _prompts = await strategy.generate_response(make_docs(3), "q?")
        assert answer == "answer-3"  # last refinement wins
        assert len(llm.calls) == 3


class TestTreeSummarization:
    async def test_single_chunk(self):
        llm = FakeLLM()
        strategy = TreeSummarizationStrategy(llm, PromptBuilder())
        answer, _ = await strategy.generate_response(make_docs(1), "q?")
        # 1 leaf answer + 1 final combine
        assert answer.startswith("answer-")
        assert len(llm.calls) == 2

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
