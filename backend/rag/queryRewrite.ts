import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { config } from "../config/runtime.js";

export const QueryRewriteSchema = z.object({
    retrievalQuery: z.string().min(1).describe("Standalone search query resolved from conversation context."),
    shouldRewrite: z.boolean().describe("Whether the current message was an ambiguous follow-up."),
});

type HistoryMessage = { role?: string; content?: string };
type StructuredInvoker = (prompt: string) => Promise<unknown>;

export const AMBIGUOUS_SIGNALS_REGEX = /(?:\b|^)(it|they|them|he|she|that|those|this|these|there|above|previous|earlier|former|latter|nó|chúng|chúng\s+nó|họ|đó|này|kia|đấy|ở\s+trên|trước\s+đó|cái\s+đó|cái\s+này|điều\s+đó|điều\s+này|việc\s+đó|việc\s+này|thế\s+nào|sao|ra\s+sao)(?:\b|$)/iu;

export function requiresRewrite(query: string, history: readonly HistoryMessage[]): boolean {
    return Boolean(history.length) && AMBIGUOUS_SIGNALS_REGEX.test(query.trim());
}

function createStructuredInvoker(): StructuredInvoker | null {
    if (config.environment === "test") return null;
    const usingOpenAI = Boolean(config.llm.openAiApiKey);
    const apiKey = config.llm.openAiApiKey || config.llm.openRouterLlmApiKey;
    if (!apiKey) return null;
    const model = new ChatOpenAI({
        // OpenRouter accepts its provider-qualified model identifier; OpenAI does not.
        model: usingOpenAI ? config.llm.defaultModel.replace(/^openai\//, "") : config.llm.defaultModel,
        temperature: 0,
        apiKey,
        configuration: { baseURL: usingOpenAI ? config.llm.openAiBaseUrl : config.llm.openRouterBaseUrl },
    });
    const structuredModel = model.withStructuredOutput(QueryRewriteSchema, {
        name: "rag_query_rewrite",
        strict: true,
    });
    return (prompt) => structuredModel.invoke(prompt);
}

export async function rewriteQueryWithStructuredOutput(input: {
    query: string;
    history: readonly HistoryMessage[];
    invoke?: StructuredInvoker;
}): Promise<{ query: string; rewritten: boolean; fallbackReason?: "QUERY_REWRITE_FAILURE" }> {
    const query = input.query.trim();
    if (!requiresRewrite(query, input.history)) return { query, rewritten: false };
    const invoke = input.invoke ?? createStructuredInvoker();
    if (!invoke) return { query, rewritten: false, fallbackReason: "QUERY_REWRITE_FAILURE" };

    const history = input.history.slice(-6)
        .filter((message) => message.role && message.content?.trim())
        .map((message) => `${message.role}: ${message.content!.trim()}`)
        .join("\n");
    try {
        const result = QueryRewriteSchema.parse(await invoke([
            "Rewrite an ambiguous follow-up into one standalone retrieval query.",
            "Do not answer the user. Preserve intent and named entities from history.",
            `Conversation:\n${history}`,
            `Current message: ${query}`,
        ].join("\n\n")));
        return result.shouldRewrite
            ? { query: result.retrievalQuery.trim(), rewritten: true }
            : { query, rewritten: false };
    } catch {
        return { query, rewritten: false, fallbackReason: "QUERY_REWRITE_FAILURE" };
    }
}
