"""Unit tests for deterministic ID generation."""

import uuid

from src.helpers.id_generator import (
    normalize_text,
    generate_id,
    generate_document_id,
    generate_version_hash,
)


class TestNormalizeText:
    def test_lowercase(self):
        assert normalize_text("HeLLo") == "hello"

    def test_collapse_whitespace(self):
        assert normalize_text("a  \t\n b") == "a b"

    def test_strip(self):
        assert normalize_text("  x  ") == "x"


class TestGenerateId:
    def test_deterministic(self):
        assert generate_id("Hello World") == generate_id("Hello World")

    def test_normalization_insensitive(self):
        assert generate_id("Hello   World") == generate_id("hello world")

    def test_different_input_different_id(self):
        assert generate_id("a") != generate_id("b")

    def test_known_vector(self):
        assert generate_id("Hello World") == (
            "d2a84f4b8b650937ec8f73cd8be2c74add5a911ba64df27458ed8229da804a26"
        )


class TestGenerateDocumentId:
    def test_returns_uuid(self):
        doc_id = generate_document_id("report.pdf")
        assert isinstance(doc_id, uuid.UUID)

    def test_deterministic(self):
        assert generate_document_id("a.txt") == generate_document_id("a.txt")

    def test_different_files_different_ids(self):
        assert generate_document_id("a.txt") != generate_document_id("b.txt")


class TestGenerateVersionHash:
    def test_raw_bytes_sensitive_to_whitespace(self):
        assert generate_version_hash(b"a b") != generate_version_hash(b"a  b")

    def test_deterministic(self):
        assert generate_version_hash(b"x") == generate_version_hash(b"x")
