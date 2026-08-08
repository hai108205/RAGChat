"""Integration test for RAGPipeline with fake embedder/vector store/LLM."""

import pytest

from src.rag.pipeline import RAGPipeline
from src.services.chat_service.chat_history import ChatHistory


class FakeEmbedder:
    model_name = "fake-embedder"

    async def embed_query(self, text):
        return [0.1] * 8

    async def embed_documents(self, texts):
        return [[0.1] * 8 for _ in texts]


class FakeVectorStore:
    def __init__(self, results):
        self.results = results

    async def search(self, embedding, top_k=5):
        return self.results[:top_k]


class FakeLLM:
    provider = "fake"
    model_name = "fake-llm"

    def __init__(self):
        self.calls = []

    async def generate(self, system_prompt, user_message, **kwargs):
        self.calls.append(user_message)
        return "fake answer"


def make_pipeline(results, strategy="create-and-refine"):
    return RAGPipeline(
        embedder=FakeEmbedder(),
        vector_store=FakeVectorStore(results),
        llm=FakeLLM(),
        top_k=5,
        synthesis_strategy=strategy,
    )


RESULTS = [
    {"content": "Leave policy: 20 days per year.", "filename": "hr.pdf",
     "page": 1, "document_id": "d1", "relevance": 0.9},
    {"content": "Leave policy: carry-over rules.", "filename": "hr.pdf",
     "page": 2, "document_id": "d1", "relevance": 0.8},
    {"content": "Unrelated cafeteria menu.", "filename": "menu.txt",
     "page": None, "document_id": "d2", "relevance": 0.4},
]


class TestRAGPipelineAsk:
    async def test_ask_returns_answer_sources_model(self):
        pipeline = make_pipeline(RESULTS)
        result = await pipeline.ask("How many leave days?")
        assert result["answer"] == "fake answer"
        assert result["model"] == "fake-llm"
        # sources deduplicated by filename
        titles = [s["title"] for s in result["sources"]]
        assert titles == ["hr.pdf", "menu.txt"]

    async def test_ask_updates_chat_history(self):
        pipeline = make_pipeline(RESULTS)
        history = ChatHistory(total_length=5)
        await pipeline.ask("q1", chat_history=history)
        assert len(history) == 1
        assert "Q: q1" in history[0]

    async def test_ask_no_results_falls_back_to_direct_answer(self):
        pipeline = make_pipeline([])
        result = await pipeline.ask("anything?")
        assert result["answer"] == "fake answer"
        assert result["sources"] == []


class TestRAGPipelineHelpers:
    async def test_search_shapes_results(self):
        pipeline = make_pipeline(RESULTS)
        results = await pipeline.search("leave", top_k=2)
        assert len(results) == 2
        assert results[0]["title"] == "hr.pdf"
        assert "snippet" in results[0]
        assert results[0]["metadata"]["document_id"] == "d1"

    async def test_summarize_explain_translate_generate_reply(self):
        pipeline = make_pipeline([])
        assert await pipeline.summarize("text") == "fake answer"
        assert await pipeline.explain("concept") == "fake answer"
        assert await pipeline.translate("hello", "vi") == "fake answer"
        assert await pipeline.generate_reply("hi", "Alice") == "fake answer"
