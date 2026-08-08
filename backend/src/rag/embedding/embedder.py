"""OpenAI embeddings wrapper using LangChain.

Provides async embedding capabilities for query and document texts,
wrapping the LangChain OpenAIEmbeddings client with thread-pool offloading.
"""

import asyncio
from langchain_openai import OpenAIEmbeddings


class Embedder:
    """Async wrapper around LangChain's OpenAIEmbeddings for text embedding.

    Offloads the synchronous LangChain embedding calls to a thread pool
    so they don't block the event loop.

    Attributes:
        dimension: The fixed output dimension (1536 for text-embedding-3-small).
    """

    def __init__(self, api_key: str, model: str = "text-embedding-3-small") -> None:
        """Initialise the embedder with an OpenAI API key and model.

        Args:
            api_key: OpenAI API key.
            model: Embedding model identifier. Defaults to text-embedding-3-small.
        """
        self._embeddings = OpenAIEmbeddings(
            openai_api_key=api_key,
            model=model,
            dimensions=1536,  # explicitly set for text-embedding-3-small
        )

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query text.

        Args:
            text: The query string to embed.

        Returns:
            A list of 1536 floating-point embedding values.
        """
        return await asyncio.to_thread(self._embeddings.embed_query, text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple document chunks.

        Args:
            texts: A list of document chunk strings to embed.

        Returns:
            A list of embedding vectors, each a list of 1536 floats.
        """
        return await asyncio.to_thread(self._embeddings.embed_documents, texts)

    @property
    def dimension(self) -> int:
        """Return the fixed embedding dimension."""
        return 1536
