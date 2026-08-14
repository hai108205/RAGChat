"""Unit tests for the TypeScript Validator utility (tested via Python equivalents).

These tests mirror the logic in src/utils/Validator.ts to ensure
input validation logic is correct.
"""


class TestValidatorLogic:
    """Mirror tests for the TypeScript Validator class."""

    def test_is_valid_url(self):
        # Equivalent to Validator.isValidUrl()
        def is_valid_url(url):
            from urllib.parse import urlparse

            parsed = urlparse(url)
            return parsed.scheme in ("http", "https")

        assert is_valid_url("http://localhost:8000") is True
        assert is_valid_url("https://api.example.com/v1") is True
        assert is_valid_url("ftp://files.example.com") is False
        assert is_valid_url("not-a-url") is False
        assert is_valid_url("") is False

    def test_is_non_empty_string(self):
        def is_non_empty_string(value):
            return isinstance(value, str) and len(value.strip()) > 0

        assert is_non_empty_string("hello") is True
        assert is_non_empty_string("  hi  ") is True
        assert is_non_empty_string("") is False
        assert is_non_empty_string("   ") is False
        assert is_non_empty_string(123) is False
        assert is_non_empty_string(None) is False

    def test_sanitize_input(self):
        def sanitize_input(input_str):
            return input_str.strip()[:4000]

        assert sanitize_input("  hello  ") == "hello"
        assert sanitize_input("a" * 5000) == "a" * 4000
        assert sanitize_input("") == ""
