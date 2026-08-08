"""RAG Pipeline orchestrator — coordinates embedding, retrieval, synthesis, and generation."""

import time
from typing import Optional

from src.config import settings
from src.rag.embedding.embedder import Embedder
from src.rag.llm.adapter import LLMAdapter
from src.rag.prompt.builder import PromptBuilder
from src.storage.vectorstore import VectorStore
from src.services.chat_service.chat_history import ChatHistory
from src.services.chat_service.ctx_strategy import (
    BaseSynthesisStrategy,
    get_ctx_synthesis_strategy,
)
from src.services.chat_service.conversation_handler import (
    refine_question,
    answer_with_context,
)
from src.services.ingest_documents_service.document import Document
from src.monitoring import (
    rag_requests_total,
    rag_request_duration_seconds,
    llm_calls_total,
    llm_call_duration_seconds,
    embedding_requests_total,
    vector_search_duration_seconds,
)


class RAGPipeline:
    """Orchestrates the full RAG flow: refine → embed → retrieve → synthesize → generate."""

    def __init__(
        self,
        embedder: Embedder,
        vector_store: VectorStore,
        llm: LLMAdapter,
        top_k: int = 5,
        synthesis_strategy: str = "tree-summarization",
    ):
        self._embedder = embedder
        self._vector_store = vector_store
        self._llm = llm
        self._top_k = top_k
        self._synthesis_strategy_name = synthesis_strategy
        self._prompt_builder = PromptBuilder()

        # Create synthesis strategy
        self._synthesis_strategy: BaseSynthesisStrategy = get_ctx_synthesis_strategy(
            synthesis_strategy,
            llm=llm,
            prompt_builder=self._prompt_builder,
        )

    async def ask(
        self,
        query: str,
        history: Optional[list[dict]] = None,
        chat_history: Optional[ChatHistory] = None,
    ) -> dict:
        """Answer a question using RAG with conversation-aware refinement.

        Args:
            query: User's question.
            history: Optional conversation history [{role, content}, ...].
            chat_history: Optional server-side ChatHistory ring buffer.

        Returns:
            Dict with 'answer', 'sources', and 'model' keys.
        """
        start = time.monotonic()
        try:
            # 1. Refine question (conversation-aware standalone reformulation)
            refined_query = query
            if chat_history and len(chat_history) > 0:
                refined_query = await refine_question(
                    llm=self._llm,
                    question=query,
                    chat_history=chat_history,
                    prompt_builder=self._prompt_builder,
                )

            # 2. Embed refined query
            query_embedding = await self._embedder.embed_query(refined_query)
            embedding_requests_total.labels(
                model=getattr(self._embedder, "model_name", "unknown")
            ).inc()

            # 3. Retrieve relevant chunks
            t1 = time.monotonic()
            results = await self._vector_store.search(
                query_embedding,
                top_k=self._top_k,
            )
            vector_search_duration_seconds.observe(time.monotonic() - t1)

            # 4. Convert to Document objects for synthesis
            retrieved_docs = []
            for doc in results:
                retrieved_docs.append(
                    Document(
                        page_content=doc["content"],
                        metadata={
                            "filename": doc.get("filename", "Unknown"),
                            "page": doc.get("page"),
                            "document_id": doc.get("document_id", ""),
                            "relevance": doc.get("relevance", 0.0),
                        },
                    )
                )

            # 5. Synthesize answer using chosen strategy
            llm_start = time.monotonic()
            answer, fmt_prompts = await answer_with_context(
                llm=self._llm,
                ctx_synthesis_strategy=self._synthesis_strategy,
                question=refined_query,
                chat_history=chat_history or ChatHistory(),
                retrieved_contents=retrieved_docs,
                prompt_builder=self._prompt_builder,
            )
            llm_call_duration_seconds.labels(
                provider=getattr(self._llm, "provider", "unknown"),
                model=getattr(self._llm, "model_name", "unknown"),
            ).observe(time.monotonic() - llm_start)
            llm_calls_total.labels(
                provider=getattr(self._llm, "provider", "unknown"),
                model=getattr(self._llm, "model_name", "unknown"),
            ).inc()

            # 6. Format sources
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

            # 7. Update chat history
            if chat_history is not None:
                chat_history.append(f"Q: {query}\nA: {answer}")

            rag_requests_total.labels(endpoint="chat", status="success").inc()
            return {
                "answer": answer,
                "sources": sources,
                "model": getattr(self._llm, "model_name", "unknown"),
            }
        except Exception:
            rag_requests_total.labels(endpoint="chat", status="error").inc()
            raise
        finally:
            rag_request_duration_seconds.labels(endpoint="chat").observe(
                time.monotonic() - start
            )

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
        user_message = self._prompt_builder.build_summarize_prompt(text)
        return await self._llm.generate(
            system_prompt="You are a professional text summarizer.",
            user_message=user_message,
        )

    async def explain(self, concept: str) -> str:
        """Explain a concept using the LLM."""
        user_message = self._prompt_builder.build_explain_prompt(concept)
        return await self._llm.generate(
            system_prompt="You are a knowledgeable and patient teacher.",
            user_message=user_message,
        )

    async def translate(self, text: str, target_lang: str = "vi") -> str:
        """Translate text using the LLM."""
        user_message = self._prompt_builder.build_translate_prompt(text, target_lang)
        return await self._llm.generate(
            system_prompt="You are a professional translator. Only output the translation.",
            user_message=user_message,
        )