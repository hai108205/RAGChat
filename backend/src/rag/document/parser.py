"""Document parser — extracts structured content and metadata from loaded documents."""

from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class ParsedDocument:
    """A parsed document with extracted text and metadata."""

    filename: str
    content: str
    source: str  # original file path
    metadata: dict = field(default_factory=dict)
    pages: list[dict] = field(default_factory=list)  # [{page_num, content}]


class DocumentParser:
    """Parse documents into structured ParsedDocument objects."""

    def parse(self, file_path: str | Path, raw_text: str) -> ParsedDocument:
        """Parse raw document text into a structured format with metadata.

        Args:
            file_path: Original file path.
            raw_text: Raw text extracted from the document.

        Returns:
            ParsedDocument with content and metadata.
        """
        file_path = Path(file_path)
        ext = file_path.suffix.lower()

        metadata = {
            "file_format": ext.lstrip("."),
            "file_size": file_path.stat().st_size if file_path.exists() else 0,
        }

        # For PDF, try to split by pages (page markers from PyPDF2)
        pages = []
        if ext == ".pdf":
            page_texts = raw_text.split("\n\n")
            for i, page_text in enumerate(page_texts):
                if page_text.strip():
                    pages.append({"page_num": i + 1, "content": page_text.strip()})

        return ParsedDocument(
            filename=file_path.name,
            content=raw_text,
            source=str(file_path.absolute()),
            metadata=metadata,
            pages=pages,
        )
