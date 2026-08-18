"""Document chunker — splits documents into overlapping chunks.

Two strategies are supported:

* **recursive** — fixed-size, markdown-aware recursive splitting (the legacy
  behaviour). Good default when structure is unknown.
* **semantic** — splits along headings/paragraph boundaries first, and protects
  table blocks (markdown pipe tables, ``Sheet:`` CSV/XLSX dumps, code fences) so
  a table is never torn in half. Semantic chunks that still exceed ``chunk_size``
  fall back to the recursive splitter.

``DocumentChunker`` keeps the original ``split``/``split_with_metadata``
interface so the ingest pipeline stays unchanged.
"""

from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.services.ingest_documents_service.document_loader.format import (
    Format,
    get_separators,
)


class DocumentChunker:
    """Split documents into overlapping chunks using a markdown-aware recursive splitter."""

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        strategy: str = "recursive",
        protect_tables: bool = True,
    ):
        self._splitter = RecursiveCharacterTextSplitter(
            separators=get_separators(Format.MARKDOWN.value),
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            keep_separator=True,
        )
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.strategy = strategy
        self.protect_tables = protect_tables

    def split(self, text: str) -> list[str]:
        """Split text into overlapping chunks.

        Args:
            text: Cleaned document text to chunk.

        Returns:
            List of text chunks.
        """
        if not text.strip():
            return []

        if self.strategy == "semantic":
            chunks = self._split_semantic(text)
            if chunks:
                return chunks
            # Fall back to recursive on any unexpected error/empty result.
        return self._splitter.split_text(text)

    def split_with_metadata(self, text: str, base_metadata: dict, page: int | None = None) -> list[dict]:
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

    # ------------------------------------------------------------------
    # Semantic splitting
    # ------------------------------------------------------------------

    def _split_semantic(self, text: str) -> list[str]:
        """Split by protected blocks + heading/paragraph boundaries.

        Protection runs first: table/code blocks are extracted whole so a
        subsequent size split never bisects them. Remaining prose is split with
        the recursive splitter, then every protected block and prose chunk is
        assembled in original order.
        """
        pieces = self._protect_blocks(text) if self.protect_tables else [(text, False)]

        chunks: list[str] = []
        buffer = ""
        for content, is_protected in pieces:
            if is_protected:
                # Flush any pending prose, then emit the block as its own chunk.
                if buffer.strip():
                    chunks.extend(self._chunk_prose(buffer))
                    buffer = ""
                chunks.extend(self._chunk_oversized(content))
            else:
                buffer += ("\n\n" if buffer else "") + content

        if buffer.strip():
            chunks.extend(self._chunk_prose(buffer))

        return [c for c in chunks if c.strip()]

    def _chunk_prose(self, prose: str) -> list[str]:
        """Split prose along headings/paragraphs using the recursive splitter."""
        return self._splitter.split_text(prose)

    def _chunk_oversized(self, block: str) -> list[str]:
        """Emit a protected block; if it exceeds chunk_size, split it recursively."""
        if len(block) <= self.chunk_size:
            return [block]
        # Oversized table — split but keep overlap so rows are not lost.
        return self._splitter.split_text(block)

    @staticmethod
    def _protect_blocks(text: str) -> list[tuple[str, bool]]:
        """Extract table / code / sheet blocks; return (content, is_protected) pairs.

        Repeatedly finds the next block, appending preceding prose as an
        unprotected piece, so ordering is preserved.
        """
        import re

        # Order matters: pipe tables and code fences take precedence.
        patterns = [
            # Markdown code fences ``` ... ```
            (re.compile(r"```[^\n]*\n.*?```", re.DOTALL), "code"),
            # Markdown pipe tables: contiguous lines that all start with a pipe.
            (re.compile(r"(?:^[ \t]*\|.*\|[ \t]*$\n?)+", re.MULTILINE), "table"),
            # XLSX/CSV "Sheet:" dump blocks until the next blank paragraph.
            (re.compile(r"\[Sheet: [^\]]+\]\n(?:.*\n?)+?(?=\n\s*\n|\[Sheet: |\Z)", re.DOTALL), "sheet"),
        ]

        pieces: list[tuple[str, bool]] = []
        cursor = 0
        # Find the earliest match among all patterns at each step.
        while cursor < len(text):
            earliest_pos = len(text)
            earliest_match = None
            for pat, _name in patterns:
                m = pat.search(text, cursor)
                if m and m.start() < earliest_pos:
                    earliest_pos = m.start()
                    earliest_match = m

            if earliest_match is None:
                break

            # Prose before the block.
            if earliest_match.start() > cursor:
                pieces.append((text[cursor : earliest_match.start()], False))
            pieces.append((earliest_match.group(0).rstrip("\n"), True))
            cursor = earliest_match.end()

        if cursor < len(text):
            pieces.append((text[cursor:], False))

        return [(content, protected) for content, protected in pieces if content.strip()]
