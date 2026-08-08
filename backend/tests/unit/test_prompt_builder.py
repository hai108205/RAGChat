"""Unit tests for PromptBuilder."""

import pytest
from src.rag.prompt.builder import PromptBuilder


class TestPromptBuilder:
    def test_build_rag_prompt_with_context(self):
        context_docs = [
            {
                "filename": "policy.pdf",
                "content": "Employees are entitled to 15 days of annual leave.",
                "page": 5,
            },
            {
                "filename": "handbook.pdf",
                "content": "Leave requests must be submitted 2 weeks in advance.",
                "page": 12,
            },
        ]

        system, user = PromptBuilder.build_rag_prompt(
            query="How many vacation days do I have?",
            context_docs=context_docs,
        )

        assert "policy.pdf" in system
        assert "15 days of annual leave" in system
        assert "handbook.pdf" in system
        assert "How many vacation days do I have?" in user

    def test_build_rag_prompt_with_empty_context(self):
        system, user = PromptBuilder.build_rag_prompt(
            query="What is the policy?",
            context_docs=[],
        )
        assert "No relevant documents found" in system
        assert "What is the policy?" in user

    def test_build_rag_prompt_with_history(self):
        history = [
            {"role": "user", "content": "What is the leave policy?"},
            {"role": "assistant", "content": "The leave policy allows 15 days per year."},
            {"role": "user", "content": "Can I carry over unused days?"},
        ]

        context_docs = [{"filename": "policy.pdf", "content": "Up to 5 days can be carried over."}]
        system, user = PromptBuilder.build_rag_prompt(
            query="How many days can I carry over?",
            context_docs=context_docs,
            history=history,
        )

        assert "leave policy" in user
        assert "carry" in user

    def test_build_rag_prompt_without_page(self):
        context_docs = [{"filename": "notes.txt", "content": "Some content."}]
        system, user = PromptBuilder.build_rag_prompt("query", context_docs)
        assert "Page" not in system

    def test_build_rag_prompt_truncates_long_history(self):
        history = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(20)
        ]
        context_docs = [{"filename": "doc.txt", "content": "Test."}]
        system, user = PromptBuilder.build_rag_prompt(
            query="test query",
            context_docs=context_docs,
            history=history,
        )
        # Should only include last 6 messages
        assert "Message 14" in user
        assert "Message 0" not in user

    def test_build_summarize_prompt(self):
        prompt = PromptBuilder.build_summarize_prompt("This is a long text to summarize.")
        assert "This is a long text to summarize." in prompt
        assert "Summary:" in prompt

    def test_build_explain_prompt(self):
        prompt = PromptBuilder.build_explain_prompt("quantum computing")
        assert "quantum computing" in prompt
        assert "Explanation:" in prompt

    def test_build_translate_prompt_known_language(self):
        prompt = PromptBuilder.build_translate_prompt("Hello", "vi")
        assert "Vietnamese" in prompt
        assert "Hello" in prompt

    def test_build_translate_prompt_unknown_language(self):
        prompt = PromptBuilder.build_translate_prompt("Hello", "xx")
        assert "xx" in prompt
        assert "Hello" in prompt