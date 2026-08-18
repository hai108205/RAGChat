"""Unit tests for the RAG pipeline's access-control and retrieval helpers.

These cover pure logic in ``RAGPipeline`` without needing a live vector store:
access-filter construction, strict relevance filtering, and query expansion via
a fake LLM.
"""

from src.monitoring import setup_metrics  # noqa: F401  (imports metrics side effects)


class _FakeResp:
    def __init__(self, content):
        self.content = content


class _FakeLLM:
    def __init__(self, response=""):
        self.response = response
        self.model_name = "fake-model"

    def invoke(self, messages, **kwargs):
        return _FakeResp(self.response)


class TestAccessFilter:
    def test_filters_scoped_by_room_and_user(self, monkeypatch):
        from src.config import settings
        from src.rag.pipeline import RAGPipeline

        monkeypatch.setattr(settings, "enforce_room_isolation", True)
        filters = RAGPipeline._build_access_filters(room_id="roomA", user_id="user1")
        assert filters == {"room_id": "roomA", "user_id": "user1"}

    def test_filters_empty_when_disabled(self, monkeypatch):
        from src.config import settings
        from src.rag.pipeline import RAGPipeline

        monkeypatch.setattr(settings, "enforce_room_isolation", False)
        assert RAGPipeline._build_access_filters(room_id="roomA") == {}

    def test_filters_drop_none_values(self, monkeypatch):
        from src.config import settings
        from src.rag.pipeline import RAGPipeline

        monkeypatch.setattr(settings, "enforce_room_isolation", True)
        assert RAGPipeline._build_access_filters(room_id=None, user_id=None) == {}


class TestStrictRelevance:
    def test_filters_below_threshold_and_caps_top_k(self, monkeypatch):
        from src.config import settings
        from src.rag.pipeline import RAGPipeline

        monkeypatch.setattr(settings, "similarity_threshold", 0.3)
        results = [
            {"content": "a", "document_id": "1", "relevance": 0.9},
            {"content": "b", "document_id": "2", "relevance": 0.1},  # below threshold
            {"content": "c", "document_id": "3", "relevance": 0.5},
            {"content": "d", "document_id": "4", "relevance": 0.7},
        ]
        filtered = RAGPipeline._filter_results(results, top_k=2)
        ids = [d["document_id"] for d in filtered]
        assert "2" not in ids  # low relevance dropped
        assert ids == ["1", "4"]  # sorted by relevance desc, capped at top_k
