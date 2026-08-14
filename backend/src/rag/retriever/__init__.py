"""Retriever package.

Retrieval is delegated to LangChain's ``PGVector`` store (see
``src.storage.vectorstore``), which wraps its own ``similarity_search`` /
``similarity_search_with_score_by_vector`` helpers. This package no longer
ships a hand-rolled distance-metric module.
"""
