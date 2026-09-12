/** Canonical model identifiers offered by the room RAG settings modal. */
export const SUPPORTED_CHAT_MODELS = [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3-5-sonnet-20241022",
    "gemini-1.5-pro",
    "llama-3.1-70b",
] as const;

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
