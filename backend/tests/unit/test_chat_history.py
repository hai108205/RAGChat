"""Unit tests for ChatHistory ring buffer."""

from src.services.chat_service.chat_history import ChatHistory, init_chat_history


class TestChatHistory:
    def test_append_within_capacity(self):
        h = ChatHistory(total_length=3)
        h.append("a")
        h.append("b")
        assert list(h) == ["a", "b"]

    def test_append_evicts_oldest_at_capacity(self):
        h = ChatHistory(total_length=2)
        h.append("a")
        h.append("b")
        h.append("c")
        assert list(h) == ["b", "c"]

    def test_init_with_messages(self):
        h = ChatHistory(messages=["x", "y"], total_length=5)
        assert list(h) == ["x", "y"]
        assert h.total_length == 5

    def test_str_joins_with_newlines(self):
        h = ChatHistory(messages=["a", "b"], total_length=5)
        assert str(h) == "a\nb"

    def test_init_chat_history_factory(self):
        h = init_chat_history(total_length=4)
        assert isinstance(h, ChatHistory)
        assert h.total_length == 4
        assert len(h) == 0
