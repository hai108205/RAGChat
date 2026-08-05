"""Document cleaner — normalizes and cleans extracted text."""

import re


class DocumentCleaner:
    """Clean and normalize document text for embedding."""

    def clean(self, text: str) -> str:
        """Clean and normalize text.

        Steps:
        1. Normalize Unicode (NFKC)
        2. Remove excessive whitespace
        3. Remove control characters (except newlines and tabs)
        4. Normalize blank lines (max 2 consecutive)
        5. Strip leading/trailing whitespace

        Args:
            text: Raw text to clean.

        Returns:
            Cleaned and normalized text.
        """
        import unicodedata

        # Normalize Unicode
        text = unicodedata.normalize("NFKC", text)

        # Remove dangerous control characters but keep newlines and tabs
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)

        # Replace Windows line endings
        text = text.replace("\r\n", "\n").replace("\r", "\n")

        # Collapse multiple spaces (but not newlines)
        text = re.sub(r"[ \t]+", " ", text)

        # Normalize blank lines — max 2 consecutive newlines
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Remove leading/trailing whitespace
        text = text.strip()

        return text
