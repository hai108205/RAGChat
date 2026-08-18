"""RAG Pipeline orchestrator — coordinates embedding, retrieval, synthesis, and generation."""

import time

from langchain_core.documents import Document
from langchain_core.language_models.chat_models import BaseChatModel

from src.config import settings
from src.monitoring import (
    embedding_requests_total,
    llm_call_duration_seconds,
    llm_calls_total,
    rag_request_duration_seconds,
    rag_requests_total,
    vector_search_duration_seconds,
)
from src.rag.embedding.embedder import Embedder
from src.rag.llm.runtime import ainvoke
from src.rag.prompt.builder import PromptBuilder
from src.services.chat_service.chat_history import ChatHistory
from src.services.chat_service.conversation_handler import (
    answer_with_context,
    refine_question,
)
from src.services.chat_service.ctx_strategy import (
    BaseSynthesisStrategy,
    get_ctx_synthesis_strategy,
)
from src.storage.vectorstore import VectorStore


class RAGPipeline:
    """Orchestrates the full RAG flow: refine → embed → retrieve → synthesize → generate."""

    def __init__(
        self,
        embedder: Embedder,
        vector_store: VectorStore,
        llm: BaseChatModel,
        top_k: int = 5,
        synthesis_strategy: str = "tree-summarization",
        provider: str = "unknown",
    ):
        self._embedder = embedder
        self._vector_store = vector_store
        self._llm = llm
        self._provider = provider
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
        history: list[dict] | None = None,
        chat_history: ChatHistory | None = None,
        room_id: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        """Answer a question using RAG with conversation-aware refinement.

        Args:
            query: User's question.
            history: Optional conversation history [{role, content}, ...].
            chat_history: Optional server-side ChatHistory ring buffer.
            room_id: Optional room scope — restricts retrieval to this room's documents.
            user_id: Optional user scope — restricts retrieval to this user's documents.

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

            # 2. Build access-control filters (scoped by room when enforced)
            filters = self._build_access_filters(room_id=room_id, user_id=user_id)

            # 3. Query expansion — generate N paraphrases to widen recall
            queries = [refined_query]
            if settings.use_query_expansion:
                queries = await self._expand_queries(refined_query)
                queries.append(refined_query)

            # 4. Retrieve relevant chunks (dense / hybrid) across all query variants
            t1 = time.monotonic()
            results = await self._retrieve_multi(
                queries=queries,
                top_k=self._top_k,
                filters=filters,
            )
            vector_search_duration_seconds.observe(time.monotonic() - t1)

            # 5. Strict relevance filter (context compression) — avoid lost-in-middle
            results = self._filter_results(results, top_k=self._top_k)

            # 6. Convert to Document objects for synthesis
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

            # 7. Synthesize answer using chosen strategy
            llm_start = time.monotonic()
            answer, _fmt_prompts = await answer_with_context(
                llm=self._llm,
                ctx_synthesis_strategy=self._synthesis_strategy,
                question=refined_query,
                chat_history=chat_history or ChatHistory(),
                retrieved_contents=retrieved_docs,
                prompt_builder=self._prompt_builder,
            )
            llm_call_duration_seconds.labels(
                provider=self._provider,
                model=getattr(self._llm, "model_name", "unknown"),
            ).observe(time.monotonic() - llm_start)
            llm_calls_total.labels(
                provider=self._provider,
                model=getattr(self._llm, "model_name", "unknown"),
            ).inc()

            # 8. Format sources
            sources = []
            seen = set()
            for doc in results:
                filename = doc["filename"]
                if filename not in seen:
                    seen.add(filename)
                    sources.append(
                        {
                            "title": filename,
                            "snippet": doc["content"][:200].strip(),
                            "page": doc.get("page"),
                            "relevance": doc.get("relevance", 0.0),
                        }
                    )

            # 9. Update chat history
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
            rag_request_duration_seconds.labels(endpoint="chat").observe(time.monotonic() - start)

    @staticmethod
    def _build_access_filters(
        room_id: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        """Build metadata-scope filters for data access control.

        When ``settings.enforce_room_isolation`` is true, retrieval is restricted
        to the requesting room (and user) so one room cannot read another's docs.
        """
        if not settings.enforce_room_isolation:
            return {}
        filters: dict = {}
        if room_id:
            filters["room_id"] = room_id
        if user_id:
            filters["user_id"] = user_id
        return filters

    async def _expand_queries(self, query: str) -> list[str]:
        """Generate paraphrased variants of ``query`` to widen retrieval recall.

        Uses the LLM to produce up to ``settings.query_expansion_count`` alternative
        phrasings. Returns the variants (may be empty on failure).
        """
        n = max(1, settings.query_expansion_count)
        prompt = self._prompt_builder.build_query_expansion_prompt(query, n)
        raw = await ainvoke(
            self._llm,
            system_prompt="You are a query reformulation assistant.",
            user_message=prompt,
            max_tokens=256,
        )
        variants = []
        for line in raw.splitlines():
            line = line.strip().lstrip("0123456789.-) ").strip()
            if line and line != query and line not in variants:
                variants.append(line)
            if len(variants) >= n:
                break
        return variants

    async def _retrieve_multi(
        self,
        queries: list[str],
        top_k: int,
        filters: dict | None,
    ) -> list[dict]:
        """Retrieve chunks for multiple query variants and merge (dedup) results.

        Runs one vector/hybrid search per query embedding; dedups by chunk
        ``id``/content and aggregates the max relevance across variants.
        """
        mode = "hybrid" if settings.use_hybrid_search else "dense"
        per_query_top_k = top_k

        async def _search_one(q: str) -> list[dict]:
            embedding = await self._embedder.embed_query(q)
            embedding_requests_total.labels(model=getattr(self._embedder, "model_name", "unknown")).inc()
            return await self._vector_store.search(
                embedding,
                top_k=per_query_top_k,
                filters=filters,
                similarity_threshold=settings.similarity_threshold,
                query_text=q,
                mode=mode,
            )

        # Sequential is fine for a handful of variants; avoids clobbering embedder rate limits.
        merged: dict[str, dict] = {}
        for q in queries:
            results = await _search_one(q)
            for doc in results:
                key = doc.get("id") or f"{doc['document_id']}:{doc['content'][:80]}"
                if key not in merged:
                    merged[key] = doc
                else:
                    # Keep the max relevance across query variants.
                    merged[key]["relevance"] = max(
                        merged[key].get("relevance", 0.0),
                        doc.get("relevance", 0.0),
                    )
        return list(merged.values())

    @staticmethod
    def _filter_results(results: list[dict], top_k: int) -> list[dict]:
        """Strict relevance filter + truncation to avoid lost-in-the-middle.

        Drops chunks already rejected by the vector store threshold, sorts by
        relevance descending, and caps the number fed into synthesis at ``top_k``.
        """
        relevant = [r for r in results if r.get("relevance", 0.0) >= settings.similarity_threshold]
        relevant.sort(key=lambda r: r.get("relevance", 0.0), reverse=True)
        return relevant[:top_k]

    async def search(
        self,
        query: str,
        top_k: int = 5,
        room_id: str | None = None,
        user_id: str | None = None,
    ) -> list[dict]:
        """Search documents by semantic similarity (optionally scoped by room/user).

        Args:
            query: Search query.
            top_k: Number of results to return.
            room_id: Optional room scope for access control.
            user_id: Optional user scope for access control.

        Returns:
            List of search result dicts.
        """
        filters = self._build_access_filters(room_id=room_id, user_id=user_id)
        mode = "hybrid" if settings.use_hybrid_search else "dense"
        query_embedding = await self._embedder.embed_query(query)
        embedding_requests_total.labels(model=getattr(self._embedder, "model_name", "unknown")).inc()
        results = await self._vector_store.search(
            query_embedding,
            top_k=top_k,
            filters=filters,
            similarity_threshold=settings.similarity_threshold,
            query_text=query,
            mode=mode,
        )

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
        return await ainvoke(
            self._llm,
            system_prompt="You are a professional text summarizer.",
            user_message=user_message,
        )

    async def explain(self, concept: str) -> str:
        """Explain a concept using the LLM."""
        user_message = self._prompt_builder.build_explain_prompt(concept)
        return await ainvoke(
            self._llm,
            system_prompt="You are a knowledgeable and patient teacher.",
            user_message=user_message,
        )

    async def translate(self, text: str, target_lang: str = "vi") -> str:
        """Translate text using the LLM."""
        user_message = self._prompt_builder.build_translate_prompt(text, target_lang)
        return await ainvoke(
            self._llm,
            system_prompt="You are a professional translator. Only output the translation.",
            user_message=user_message,
        )

    async def generate_reply(self, text: str, sender_name: str = "") -> str:
        """Generate a suggested reply to a chat message."""
        context = f"The message was sent by {sender_name}.\n\n" if sender_name else ""
        user_message = (
            f"{context}Write a short, helpful reply to the following message. "
            f"Reply only with the reply text, no preamble.\n\nMessage:\n{text}"
        )
        return await ainvoke(
            self._llm,
            system_prompt="You are a helpful colleague drafting chat replies.",
            user_message=user_message,
        )
