"""Unit tests for DocumentCleaner."""

from src.rag.document.cleaner import DocumentCleaner


class TestDocumentCleaner:
    def setup_method(self):
        self.cleaner = DocumentCleaner()

    def test_clean_normalizes_unicode(self):
        # NFKC normalization: fullwidth to ASCII
        text = "Ｈｅｌｌｏ　Ｗｏｒｌｄ"
        result = self.cleaner.clean(text)
        assert "Hello" in result
        assert "World" in result

    def test_clean_removes_control_characters(self):
        text = "Hello\x00\x01\x02World\x1f\x7fTest"
        result = self.cleaner.clean(text)
        assert "\x00" not in result
        assert "Hello" in result
        assert "World" in result
        assert "Test" in result

    def test_clean_preserves_newlines_and_tabs(self):
        text = "Line 1\nLine 2\tindented\nLine 3"
        result = self.cleaner.clean(text)
        assert "\n" in result
        assert "\t" in result

    def test_clean_replaces_windows_line_endings(self):
        text = "Line 1\r\nLine 2\r\nLine 3"
        result = self.cleaner.clean(text)
        assert "\r" not in result
        assert result.count("\n") == 2

    def test_clean_collapses_multiple_spaces(self):
        text = "Hello     world    test"
        result = self.cleaner.clean(text)
        assert result == "Hello world test"

    def test_clean_normalizes_excessive_blank_lines(self):
        text = "Paragraph 1\n\n\n\n\n\nParagraph 2"
        result = self.cleaner.clean(text)
        assert result == "Paragraph 1\n\nParagraph 2"

    def test_clean_strips_whitespace(self):
        text = "   \n  hello world  \n   "
        result = self.cleaner.clean(text)
        assert result == "hello world"

    def test_clean_empty_string(self):
        assert self.cleaner.clean("") == ""
        assert self.cleaner.clean("   ") == ""
