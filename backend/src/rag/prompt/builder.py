"""Prompt builder — constructs prompts with context, history, and query."""


RAG_SYSTEM_PROMPT = """You are RAGChat, an AI assistant that answers questions based on the provided documents.
Follow these rules strictly:
1. Answer ONLY based on the provided context documents.
2. If the context does not contain enough information to answer, say "I don't have enough information to answer this question based on the available documents."
3. Always cite the source documents you used in your answer.
4. Be concise and direct. Use bullet points for lists.
5. If multiple documents provide conflicting information, note the discrepancy.

{context}"""

RAG_USER_PROMPT = """{history}User question: {query}

Please provide a clear, accurate answer based on the context above. Include citations for each claim."""


SUMMARIZE_PROMPT = """You are a professional text summarizer. Summarize the following text in a clear, concise way.
Preserve all key information, facts, and figures. Use bullet points where appropriate.

Text to summarize:
{text}

Summary:"""


EXPLAIN_PROMPT = """You are a knowledgeable teacher. Explain the following concept in simple, easy-to-understand terms.
Use analogies and examples where helpful. Assume the reader has no prior knowledge.

Concept to explain: {concept}

Explanation:"""


TRANSLATE_PROMPT = """Translate the following text to {target_lang}. Preserve the original meaning, tone, and formatting.
Only output the translation, nothing else.

Text to translate:
{text}

Translation:"""


class PromptBuilder:
    """Build prompts for different RAGChat use cases."""

    @staticmethod
    def build_rag_prompt(
        query: str,
        context_docs: list[dict],
        history: list[dict] | None = None,
    ) -> tuple[str, str]:
        """Build system and user prompts for RAG Q&A.

        Args:
            query: User's question.
            context_docs: Retrieved document chunks with 'content' and 'filename'.
            history: Optional conversation history [{role, content}, ...].

        Returns:
            Tuple of (system_prompt, user_message).
        """
        # Format context
        context_parts = []
        for i, doc in enumerate(context_docs, 1):
            source = doc.get("filename", "Unknown")
            page = doc.get("page")
            page_info = f" (Page {page})" if page else ""
            context_parts.append(f"[Document {i}: {source}{page_info}]\n{doc['content']}")

        context_text = "\n\n".join(context_parts)

        if not context_text:
            context_text = "No relevant documents found."

        # Format history
        history_text = ""
        if history:
            history_lines = []
            for msg in history[-6:]:  # Last 6 messages max
                role_label = "User" if msg.get("role") == "user" else "Assistant"
                history_lines.append(f"{role_label}: {msg.get('content', '')}")
            history_text = "Conversation history:\n" + "\n".join(history_lines) + "\n\n"

        system_prompt = RAG_SYSTEM_PROMPT.format(context=context_text)
        user_message = RAG_USER_PROMPT.format(history=history_text, query=query)

        return system_prompt, user_message

    @staticmethod
    def build_summarize_prompt(text: str) -> str:
        return SUMMARIZE_PROMPT.format(text=text)

    @staticmethod
    def build_explain_prompt(concept: str) -> str:
        return EXPLAIN_PROMPT.format(concept=concept)

    @staticmethod
    def build_translate_prompt(text: str, target_lang: str) -> str:
        lang_name = {
            "vi": "Vietnamese",
            "en": "English",
            "fr": "French",
            "ja": "Japanese",
            "ko": "Korean",
            "zh": "Chinese",
            "de": "German",
            "es": "Spanish",
        }.get(target_lang, target_lang)
        return TRANSLATE_PROMPT.format(text=text, target_lang=lang_name)
