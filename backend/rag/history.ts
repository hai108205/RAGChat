import { AIMessage, HumanMessage, SystemMessage, trimMessages, type BaseMessage } from "@langchain/core/messages";

export interface ConversationHistoryMessage {
    role?: string;
    content?: string;
}

export interface ChatCompletionMessagePayload {
    role: "system" | "user" | "assistant";
    content: string;
}

function extractMessageContent(message: BaseMessage): string {
    if (typeof message.content === "string") {
        return message.content;
    }
    if (Array.isArray(message.content)) {
        return message.content
            .map((part) => {
                if (typeof part === "string") return part;
                if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
                    return (part as { text: string }).text;
                }
                return "";
            })
            .filter(Boolean)
            .join(" ");
    }
    return "";
}

/**
 * Standardized heuristic token estimation function consistent with LangChain specification:
 * - Supports BaseMessage[], a single BaseMessage, or raw string.
 * - Parses text from nested content structures (e.g., multimodal blocks).
 * - Implements the ~4 characters per token heuristic for fast, offline, dependency-free estimation.
 */
export function countTokensApproximately(messageOrText: BaseMessage | BaseMessage[] | string): number {
    if (typeof messageOrText === "string") {
        const text = messageOrText.trim();
        if (!text) return 0;
        return Math.max(1, Math.ceil(text.length / 4));
    }
    if (Array.isArray(messageOrText)) {
        return messageOrText.reduce((total, msg) => total + countTokensApproximately(msg), 0);
    }
    const text = extractMessageContent(messageOrText).trim();
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}

// Backward-compatible alias
export const countApproximateTokens = countTokensApproximately;

/** Preserves complete recent turns without passing raw unbounded history to the model. */
export async function trimHistoryForGeneration(
    history: readonly ConversationHistoryMessage[],
    maxTokens: number,
): Promise<BaseMessage[]> {
    const messages: BaseMessage[] = [];
    for (const message of history) {
        const content = message.content?.trim();
        if (!content) continue;
        if (message.role === "user") messages.push(new HumanMessage(content));
        if (message.role === "assistant") messages.push(new AIMessage(content));
    }
    return trimMessages(messages, {
        maxTokens,
        tokenCounter: countTokensApproximately,
        strategy: "last",
        startOn: "human",
    });
}

/**
 * Standard mapper converting a LangChain BaseMessage into an OpenAI Chat Completion message object.
 */
export function baseMessageToOpenAI(message: BaseMessage): ChatCompletionMessagePayload {
    const type = message.getType();
    const role: ChatCompletionMessagePayload["role"] =
        type === "system" ? "system" : type === "human" ? "user" : "assistant";
    const content = extractMessageContent(message);
    return { role, content };
}

/**
 * Standard mapper converting an array of LangChain BaseMessages into OpenAI Chat Completion payloads.
 */
export function baseMessagesToOpenAI(messages: readonly BaseMessage[]): ChatCompletionMessagePayload[] {
    return messages.map(baseMessageToOpenAI);
}

export interface BuildChatPromptInput {
    systemPrompt: string;
    history?: readonly BaseMessage[];
    query: string;
}

/**
 * Assembles a unified LangChain BaseMessage[] representation of system prompt, conversation history, and user turn.
 */
export function buildChatPromptMessages({
    systemPrompt,
    history = [],
    query,
}: BuildChatPromptInput): BaseMessage[] {
    return [
        new SystemMessage(systemPrompt),
        ...history,
        new HumanMessage(query),
    ];
}
