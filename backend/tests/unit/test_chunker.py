"""Unit tests for DocumentChunker."""

import pytest
from src.rag.document.chunker import DocumentChunker


class TestDocumentChunker:
    def test_empty_text_returns_empty_list(self):
        chunker = DocumentChunker(chunk_size=100, chunk_overlap=20)
        assert chunker.split("") == []
        assert chunker.split("   ") == []

    def test_text_smaller_than_chunk_size_returns_single_chunk(self):
        chunker = DocumentChunker(chunk_size=1000, chunk_overlap=200)
        result = chunker.split("Hello world, this is a short text.")
        assert len(result) == 1
        assert result[0] == "Hello world, this is a short text."

    def test_text_larger_than_chunk_size_produces_multiple_chunks(self):
        chunker = DocumentChunker(chunk_size=50, chunk_overlap=10)
        text = " ".join(["word"] * 100)
        result = chunker.split(text)
        assert len(result) > 1

    def test_chunks_are_within_size_limit(self):
        chunk_size = 200
        chunker = DocumentChunker(chunk_size=chunk_size, chunk_overlap=50)
        text = "The quick brown fox jumps over the lazy dog. " * 50
        result = chunker.split(text)
        for chunk in result:
            assert len(chunk) <= chunk_size + 50  # Allow small margin for word boundaries

    def test_split_with_metadata(self):
        chunker = DocumentChunker(chunk_size=500, chunk_overlap=100)
        text = "Section A. " * 50 + "Section B. " * 50
        base_metadata = {"source": "test.pdf", "author": "tester"}
        result = chunker.split_with_metadata(text, base_metadata, page=3)

        assert len(result) > 0
        for i, chunk in enumerate(result):
            assert "content" in chunk
            assert "metadata" in chunk
            assert chunk["page"] == 3
            assert chunk["metadata"]["source"] == "test.pdf"
            assert chunk["metadata"]["chunk_index"] == i
            assert chunk["metadata"]["chunk_total"] == len(result)