"""Unit tests for semantic/table-aware chunking."""

from src.rag.document.chunker import DocumentChunker


def _table_text() -> str:
    return """# Report

Intro paragraph with some prose.

| ID         | Name  |
|------------|-------|
| NV-2023-XYZ | Alice |
| NV-2024-ABC | Bob   |

Conclusion paragraph.
"""


class TestSemanticChunker:
    def test_table_block_kept_intact(self):
        chunker = DocumentChunker(strategy="semantic", protect_tables=True)
        chunks = chunker.split(_table_text())

        # The pipe-table rows must appear together in one chunk, never split.
        table_chunk = next(c for c in chunks if "NV-2023-XYZ" in c)
        assert "NV-2024-ABC" in table_chunk
        assert "| ID" in table_chunk

    def test_recursive_default_unchanged(self):
        chunker = DocumentChunker(chunk_size=1000, chunk_overlap=200)
        chunks = chunker.split("Hello world, this is a short text.")
        assert len(chunks) == 1

    def test_protect_tables_disabled_falls_back(self):
        chunker = DocumentChunker(strategy="semantic", protect_tables=False)
        chunks = chunker.split(_table_text())
        assert len(chunks) > 0

    def test_oversized_table_split_but_complete(self):
        chunker = DocumentChunker(strategy="semantic", protect_tables=True, chunk_size=80, chunk_overlap=20)
        big_table = "| ID | Name |\n|----|------|\n" + "\n".join(f"| NV-{i} | Name {i} |" for i in range(50))
        chunks = chunker.split(big_table)
        # No chunk should be empty; splitting an oversized table still emits content.
        assert all(c.strip() for c in chunks)
