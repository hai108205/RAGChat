"""RAG Pipeline orchestrator — coordinates embedding, retrieval, and generation."""

from typing import Optional
from src.rag.embedding.embedder import Embedder
from src.rag.llm.adapter import LLMAdapter
from src.rag.prompt.builder import PromptBuilder
from src.storage.vectorstore import VectorStore


class RAGPipeline:
    """Orchestrates the full RAG flow: embed → retrieve → prompt → generate."""

    def __init__(
        self,
        embedder: Embedder,
        vector_store: VectorStore,
        llm: LLMAdapter,
        top_k: int = 5,
    ):
        self._embedder = embedder
        self._vector_store = vector_store
        self._llm = llm
        self._top_k = top_k

    async def ask(
        self,
        query: str,
        history: Optional[list[dict]] = None,
    ) -> dict:
        """Answer a question using RAG.

        Args:
            query: User's question.
            history: Optional conversation history.

        Returns:
            Dict with 'answer', 'sources', and 'model' keys.
        """
        # 1. Embed query
        query_embedding = await self._embedder.embed_query(query)

        # 2. Retrieve relevant chunks
        results = await self._vector_store.search(
            query_embedding,
            top_k=self._top_k,
        )

        # 3. Build prompt
        system_prompt, user_message = PromptBuilder.build_rag_prompt(
            query=query,
            context_docs=results,
            history=history,
        )

        # 4. Generate answer
        answer = await self._llm.generate(system_prompt, user_message)

        # 5. Format sources
        sources = []
        seen = set()
        for doc in results:
            filename = doc["filename"]
            if filename not in seen:
                seen.add(filename)
                sources.append({
                    "title": filename,
                    "snippet": doc["content"][:200].strip(),
                    "page": doc.get("page"),
                    "relevance": doc.get("relevance", 0.0),
                })

        return {
            "answer": answer,
            "sources": sources,
            "model": getattr(self._llm, "model_name", "unknown"),
        }

    async def search(self, query: str, top_k: int = 5) -> list[dict]:
        """Search documents by semantic similarity.

        Args:
            query: Search query.
            top_k: Number of results to return.

        Returns:
            List of search result dicts.
        """
        query_embedding = await self._embedder.embed_query(query)
        results = await self._vector_store.search(query_embedding, top_k=top_k)

        return [
            {
                "title": doc["filename"],
                "snippet": doc["content"][:300].strip(),
                "relevance": doc.get("relevance", 0.0),
                "metadata": {
                    "document_id": doc["document_id"],
                    "page": doc.get("page"),
                    **doc.get("metadata", {}),
                },
            }
            for doc in results
        ]

    async def summarize(self, text: str) -> str:
        """Summarize text using the LLM."""
        user_message = PromptBuilder.build_summarize_prompt(text)
        return await self._llm.generate(
            system_prompt="You are a professional text summarizer.",
            user_message=user_message,
        )

    async def explain(self, concept: str) -> str:
        """Explain a concept using the LLM."""
        user_message = PromptBuilder.build_explain_prompt(concept)
        return await self._llm.generate(
            system_prompt="You are a knowledgeable and patient teacher.",
            user_message=user_message,
        )

    async def translate(self, text: str, target_lang: str = "vi") -> str:
        """Translate text using the LLM."""
        user_message = PromptBuilder.build_translate_prompt(text, target_lang)
        return await self._llm.generate(
            system_prompt="You are a professional translator. Only output the translation.",
            user_message=user_message,
        )
