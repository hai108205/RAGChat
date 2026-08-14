"""Integration tests for document processing pipeline."""

import tempfile
from pathlib import Path

import pytest

from src.rag.document.chunker import DocumentChunker
from src.rag.document.cleaner import DocumentCleaner
from src.rag.document.loader import DocumentLoader
from src.rag.document.parser import DocumentParser


class TestDocumentPipeline:
    """End-to-end document processing pipeline tests."""

    def test_txt_pipeline(self):
        """Full pipeline on a .txt file."""
        loader = DocumentLoader()
        parser = DocumentParser()
        cleaner = DocumentCleaner()
        chunker = DocumentChunker(chunk_size=200, chunk_overlap=50)

        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as f:
            f.write("This is a test document.\n\nIt has multiple paragraphs.\n\n" * 20)
            f.write("Each paragraph contains useful information for RAG.")
            tmp_path = f.name

        try:
            raw_text = loader.load(tmp_path)
            parsed = parser.parse(tmp_path, raw_text)
            cleaned = cleaner.clean(parsed.content)
            chunks = chunker.split(cleaned)

            assert len(raw_text) > 0
            assert parsed.filename == Path(tmp_path).name
            assert len(cleaned) > 0
            assert len(chunks) > 0
            assert all(len(c) > 0 for c in chunks)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_markdown_pipeline(self):
        """Pipeline on a markdown file."""
        loader = DocumentLoader()
        cleaner = DocumentCleaner()
        chunker = DocumentChunker(chunk_size=300, chunk_overlap=50)

        md_content = """# Test Document

## Section 1
This is the first section with some content about RAG systems.

## Section 2
This is the second section with more details about vector databases.

### Subsection 2.1
pgVector is a PostgreSQL extension for vector similarity search.
"""

        with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w", encoding="utf-8") as f:
            f.write(md_content)
            tmp_path = f.name

        try:
            raw_text = loader.load(tmp_path)
            cleaned = cleaner.clean(raw_text)
            chunks = chunker.split(cleaned)

            assert len(raw_text) > 0
            assert "RAG" in raw_text
            assert len(chunks) > 0
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_empty_file_pipeline(self):
        """Pipeline on an empty file."""
        loader = DocumentLoader()
        cleaner = DocumentCleaner()
        chunker = DocumentChunker()

        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as f:
            f.write("")
            tmp_path = f.name

        try:
            raw_text = loader.load(tmp_path)
            cleaned = cleaner.clean(raw_text)
            chunks = chunker.split(cleaned)

            assert raw_text == ""
            assert cleaned == ""
            assert chunks == []
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_large_document_chunk_count(self):
        """Large document produces reasonable chunk count."""
        chunker = DocumentChunker(chunk_size=500, chunk_overlap=100)
        cleaner = DocumentCleaner()

        # Generate ~10KB of text
        text = "The quick brown fox jumps over the lazy dog. " * 200

        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as f:
            f.write(text)
            tmp_path = f.name

        try:
            loader = DocumentLoader()
            raw_text = loader.load(tmp_path)
            cleaned = cleaner.clean(raw_text)
            chunks = chunker.split(cleaned)

            # ~10KB / 500 = ~20 chunks
            assert 10 <= len(chunks) <= 50
            for chunk in chunks:
                assert len(chunk) <= 600  # 500 + small margin
        finally:
            Path(tmp_path).unlink(missing_ok=True)


class TestDocumentLoader:
    """Tests for the document loader."""

    def test_supported_extensions(self):
        """Verify all 8 required formats are supported."""
        exts = DocumentLoader.SUPPORTED_EXTENSIONS
        required = {".pdf", ".docx", ".pptx", ".txt", ".md", ".html", ".csv", ".xlsx"}
        assert required.issubset(exts)

    def test_unsupported_extension_raises(self):
        """Loading an unsupported format raises ValueError."""
        loader = DocumentLoader()
        with pytest.raises(ValueError, match="Unsupported file format"):
            loader.load("/fake/file.xyz")
