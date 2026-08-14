"""Prompt builder — builds prompts for all RAGChat use cases using LangChain templates.

Replaces the hand-written ``.format()`` string templating with
:class:`langchain_core.prompts.ChatPromptTemplate`, while keeping the existing
``(system_prompt, user_message) -> tuple[str, str]`` interface so callers
(synthesis strategies, conversation handler, pipeline) stay unchanged.
"""

from langchain_core.prompts import ChatPromptTemplate, PromptTemplate

# ---------------------------------------------------------------------------
# Prompt templates (adapted from rag-chat123)
# ---------------------------------------------------------------------------

SYSTEM_TEMPLATE = """You are a helpful, respectful and honest assistant."""

QA_PROMPT_TEMPLATE = """Answer the question below:
{question}"""

# Context-aware Q&A
CTX_PROMPT_TEMPLATE = """Context information is below.
---------------------
{context}
---------------------
Given the context information and not prior knowledge, answer the question below:
{question}"""

# Refine existing answer with new context
REFINED_CTX_PROMPT_TEMPLATE = """The original query is as follows: {question}
We have provided an existing answer: {existing_answer}
We have the opportunity to refine the existing answer
(only if needed) with some more context below.
---------------------
{context}
---------------------
Given the new context, refine the original answer to better answer the query.
If the context isn't useful, return the original answer.
Refined Answer:"""

# Conversation-aware question refinement
REFINED_QUESTION_CONVERSATION_AWARENESS_PROMPT_TEMPLATE = """Chat History:
---------------------
{chat_history}
---------------------
Follow Up Question: {question}
Given the above conversation and a follow up question, rephrase the follow up question to be a standalone question.
Standalone question:"""

# Conversation-aware answer
REFINED_ANSWER_CONVERSATION_AWARENESS_PROMPT_TEMPLATE = """
You are engaging in a conversation with a human participant who is unaware that they might be
interacting with a machine.
Your goal is to respond in a way that convincingly simulates human-like intelligence and behavior.
The conversation should be natural, coherent, and contextually relevant.
Chat History:
---------------------
{chat_history}
---------------------
Follow Up Question: {question}

Given the context provided in the Chat History and the follow up question, please answer the follow up question above.
If the follow up question isn't correlated to the context provided in the Chat History, please just answer the follow up
question, ignoring the context provided in the Chat History.
Please also don't reformulate the follow up question, and write just a concise answer."""

# RAG Chat system prompt
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


# ---------------------------------------------------------------------------
# Prompt builder class
# ---------------------------------------------------------------------------

class PromptBuilder:
    """Build prompts for all RAGChat use cases.

    Each builder method returns a ``(system_prompt, user_message)`` tuple built
    from a LangChain ``ChatPromptTemplate``. Supports RAG Q&A, context-aware
    synthesis, conversation-aware question refinement, direct Q&A, and the
    summarize / explain / translate utilities.
    """

    # ------------------------------------------------------------------
    # RAG / Context prompts
    # ------------------------------------------------------------------

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
        context_parts = []
        for i, doc in enumerate(context_docs, 1):
            source = doc.get("filename", "Unknown")
            page = doc.get("page")
            page_info = f" (Page {page})" if page else ""
            context_parts.append(f"[Document {i}: {source}{page_info}]\n{doc['content']}")

        context_text = "\n\n".join(context_parts) if context_parts else "No relevant documents found."

        history_text = ""
        if history:
            history_lines = []
            for msg in history[-6:]:  # Last 6 messages max
                role_label = "User" if msg.get("role") == "user" else "Assistant"
                history_lines.append(f"{role_label}: {msg.get('content', '')}")
            history_text = "Conversation history:\n" + "\n".join(history_lines) + "\n\n"

        system = PromptTemplate.from_template(RAG_SYSTEM_PROMPT)
        user = PromptTemplate.from_template(RAG_USER_PROMPT)
        return (
            system.format_prompt(context=context_text).to_string().strip(),
            user.format_prompt(history=history_text, query=query).to_string().strip(),
        )

    @staticmethod
    def build_ctx_prompt(question: str, context: str = "") -> tuple[str, str]:
        """Build a context-aware Q&A prompt (for synthesis strategies).

        Returns:
            Tuple of (system_prompt, user_message).
        """
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_TEMPLATE),
                ("user", CTX_PROMPT_TEMPLATE),
            ]
        )
        messages = prompt.format_messages(context=context, question=question)
        return messages[0].content, messages[1].content

    @staticmethod
    def build_refined_ctx_prompt(
        question: str,
        existing_answer: str,
        context: str = "",
    ) -> tuple[str, str]:
        """Build a refined context prompt for sequential refinement.

        Returns:
            Tuple of (system_prompt, user_message).
        """
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_TEMPLATE),
                ("user", REFINED_CTX_PROMPT_TEMPLATE),
            ]
        )
        messages = prompt.format_messages(
            context=context,
            existing_answer=existing_answer,
            question=question,
        )
        return messages[0].content, messages[1].content

    # ------------------------------------------------------------------
    # Conversation-aware prompts
    # ------------------------------------------------------------------

    @staticmethod
    def build_refined_question_prompt(question: str, chat_history: str) -> tuple[str, str]:
        """Build a prompt to refine a follow-up question into a standalone question.

        Returns:
            Tuple of (system_prompt, user_message).
        """
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_TEMPLATE),
                ("user", REFINED_QUESTION_CONVERSATION_AWARENESS_PROMPT_TEMPLATE),
            ]
        )
        messages = prompt.format_messages(chat_history=chat_history, question=question)
        return messages[0].content, messages[1].content

    @staticmethod
    def build_conversation_answer_prompt(question: str, chat_history: str) -> tuple[str, str]:
        """Build a prompt to answer a question with conversation history awareness.

        Returns:
            Tuple of (system_prompt, user_message).
        """
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_TEMPLATE),
                ("user", REFINED_ANSWER_CONVERSATION_AWARENESS_PROMPT_TEMPLATE),
            ]
        )
        messages = prompt.format_messages(chat_history=chat_history, question=question)
        return messages[0].content, messages[1].content

    @staticmethod
    def build_qa_prompt(question: str) -> tuple[str, str]:
        """Build a simple Q&A prompt (no context, no history).

        Returns:
            Tuple of (system_prompt, user_message).
        """
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_TEMPLATE),
                ("user", QA_PROMPT_TEMPLATE),
            ]
        )
        messages = prompt.format_messages(question=question)
        return messages[0].content, messages[1].content

    # ------------------------------------------------------------------
    # Utility prompts
    # ------------------------------------------------------------------

    @staticmethod
    def build_summarize_prompt(text: str) -> str:
        return PromptTemplate.from_template(SUMMARIZE_PROMPT).format_prompt(
            text=text
        ).to_string().strip()

    @staticmethod
    def build_explain_prompt(concept: str) -> str:
        return PromptTemplate.from_template(EXPLAIN_PROMPT).format_prompt(
            concept=concept
        ).to_string().strip()

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
        return PromptTemplate.from_template(TRANSLATE_PROMPT).format_prompt(
            text=text, target_lang=lang_name
        ).to_string().strip()