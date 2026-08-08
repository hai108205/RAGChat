"""Unit tests for DocumentParser."""

import tempfile
from pathlib import Path
from src.rag.document.parser import DocumentParser, ParsedDocument


class TestDocumentParser:
    def test_parse_returns_parsed_document(self):
        parser = DocumentParser()
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("Hello world test content")
            tmp_path = f.name

        try:
            result = parser.parse(tmp_path, "Hello world test content")
            assert isinstance(result, ParsedDocument)
            assert result.content == "Hello world test content"
            assert Path(tmp_path).name == result.filename
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_parse_extracts_metadata(self):
        parser = DocumentParser()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"%PDF-1.4 test content")
            tmp_path = f.name

        try:
            result = parser.parse(tmp_path, "PDF page content")
            assert result.metadata["file_format"] == "pdf"
            assert "file_size" in result.metadata
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_parse_docx_metadata(self):
        parser = DocumentParser()
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"fake docx content")
            tmp_path = f.name

        try:
            result = parser.parse(tmp_path, "DOCX extracted text")
            assert result.metadata["file_format"] == "docx"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_parse_with_nonexistent_file(self):
        parser = DocumentParser()
        result = parser.parse("/nonexistent/file.txt", "Some text")
        assert result.content == "Some text"
        assert result.metadata["file_size"] == 0  # file doesn't exist

    def test_parse_pdf_splits_pages(self):
        parser = DocumentParser()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"%PDF-1.4")
            tmp_path = f.name

        try:
            text = "Page 1 content\n\n\nPage 2 content\n\n\nPage 3 content"
            result = parser.parse(tmp_path, text)
            assert len(result.pages) > 0
        finally:
            Path(tmp_path).unlink(missing_ok=True)