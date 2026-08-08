"""Document chunker — splits documents into overlapping chunks using markdown-aware recursive splitting."""

from src.services.ingest_documents_service.document_loader.text_splitter import (
    create_recursive_text_splitter,
)
from src.services.ingest_documents_service.document_loader.format import Format


class DocumentChunker:
    """Split documents into overlapping chunks using a markdown-aware recursive splitter."""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self._splitter = create_recursive_text_splitter(
            format=Format.MARKDOWN.value,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split(self, text: str) -> list[str]:
        """Split text into overlapping chunks.

        Args:
            text: Cleaned document text to chunk.

        Returns:
            List of text chunks.
        """
        if not text.strip():
            return []
        return self._splitter.split_text(text)

    def split_with_metadata(
        self, text: str, base_metadata: dict, page: int | None = None
    ) -> list[dict]:
        """Split text and attach metadata to each chunk.

        Args:
            text: Text to chunk.
            base_metadata: Metadata to attach to every chunk.
            page: Optional page number.

        Returns:
            List of dicts with 'content' and 'metadata' keys.
        """
        chunks = self.split(text)
        return [
            {
                "content": chunk,
                "page": page,
                "metadata": {**base_metadata, "chunk_index": i, "chunk_total": len(chunks)},
            }
            for i, chunk in enumerate(chunks)
        ]