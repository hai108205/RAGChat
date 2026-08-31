"""Unit tests for VectorStore SQL queries and search logic."""

from unittest.mock import MagicMock, patch

from src.storage.vectorstore import VectorStore


def test_dense_search_sql_parentheses():
    """Verify that pgvector cosine similarity calculation has correct parentheses.

    Without inner parentheses around `(embedding <=> CAST(:vec AS vector))`,
    PostgreSQL treats `1 - embedding <=> vector` as `(1 - embedding) <=> vector`,
    which causes: 'operator does not exist: integer - vector'.
    """
    with patch("src.storage.vectorstore.PGVector"), patch("src.storage.vectorstore.create_engine") as mock_create_engine:
        engine_mock = MagicMock()
        mock_create_engine.return_value = engine_mock
        conn_mock = MagicMock()
        engine_mock.connect.return_value.__enter__.return_value = conn_mock
        conn_mock.execute.return_value = []

        store = VectorStore(database_url="postgresql://user:pass@localhost/db")

        # Run dense search
        query_vec = [0.1] * 1536
        store._dense_search_sync(
            query_embedding=query_vec,
            top_k=5,
            filters={"room_id": "test-room-123"},
            similarity_threshold=0.7,
        )

        # Check the SQL text executed
        assert conn_mock.execute.called
        call_args = conn_mock.execute.call_args
        sql_text = str(call_args[0][0])
        params = call_args[0][1]

        # SELECT clause must have (1 - (embedding <=> CAST(:vec AS vector)))
        assert "(1 - (embedding <=> CAST(:vec AS vector))) AS similarity" in sql_text
        # WHERE clause must have (1 - (embedding <=> CAST(:vec AS vector))) >= :threshold
        assert "(1 - (embedding <=> CAST(:vec AS vector))) >= :threshold" in sql_text

        # Verify parameter bindings
        assert params["threshold"] == 0.7
        assert params["limit"] == 5
        assert "vec" in params
        assert params["f_0"] == "test-room-123"
        assert "cmetadata->>'room_id' = :f_0" in sql_text


def test_build_filter_clauses():
    """Test filter clause builder for different metadata fields."""
    with patch("src.storage.vectorstore.PGVector"), patch("src.storage.vectorstore.create_engine"):
        store = VectorStore(database_url="postgresql://user:pass@localhost/db")

        # None or empty filters
        where, params = store._build_filter_clauses(None)
        assert where == ""
        assert params == {}

        where, params = store._build_filter_clauses({})
        assert where == ""
        assert params == {}

        # Room ID and document ID filters
        where, params = store._build_filter_clauses({
            "room_id": "general",
            "document_id": "doc-abc",
        })
        assert "cmetadata->>'room_id' = :f_0" in where
        assert "cmetadata->>'document_id' = :f_1" in where
        assert params["f_0"] == "general"
        assert params["f_1"] == "doc-abc"


def test_rrf_fuse():
    """Test Reciprocal Rank Fusion of dense and keyword results."""
    with patch("src.storage.vectorstore.PGVector"), patch("src.storage.vectorstore.create_engine"):
        store = VectorStore(database_url="postgresql://user:pass@localhost/db")

        dense_results = [
            ({"id": "1", "document_id": "d1", "filename": "a.txt", "content": "hello world", "relevance": 0.9}, 0.9),
            ({"id": "2", "document_id": "d2", "filename": "b.txt", "content": "foo bar", "relevance": 0.8}, 0.8),
        ]
        keyword_results = [
            ({"id": "2", "document_id": "d2", "filename": "b.txt", "content": "foo bar", "relevance": 2.0}, 2.0),
            ({"id": "3", "document_id": "d3", "filename": "c.txt", "content": "test item", "relevance": 1.0}, 1.0),
        ]

        fused = store._rrf_fuse(dense_results, keyword_results, top_k=3, k=60)

        assert len(fused) == 3
        # Document 2 appeared in both lists, so it should rank highest in RRF score
        assert fused[0]["id"] == "2"
        assert "_rrf" in fused[0]
