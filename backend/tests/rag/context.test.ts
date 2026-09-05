import { describe, expect, it } from "vitest";
import { buildRagContext, rewriteConversationalQuery } from "../../rag/context.js";

describe("RAG context", () => {
    it("deduplicates chunks, preserves source labels and enforces a token budget", () => {
        const context = buildRagContext([
            { title: "Doc", snippet: "same text", pageUrl: "https://doc", relevance: 0.9, metadata: { chunkId: "a" } },
            { title: "Doc", snippet: "same text", pageUrl: "https://doc", relevance: 0.8, metadata: { chunkId: "a" } },
            { title: "Other", snippet: "other text", pageUrl: "https://other", relevance: 0.7, metadata: { chunkId: "b" } },
        ], 30);
        expect(context.sources).toHaveLength(2);
        expect(context.text).toContain("[1] Doc (https://doc)");
        expect(context.text).toContain("[2] Other (https://other)");
        expect(context.estimatedTokens).toBeLessThanOrEqual(30);
    });

    it("resolves pronoun follow-ups using the latest user turn", () => {
        expect(rewriteConversationalQuery("Who is he?", [
            { role: "user", content: "Tell me about the project owner." },
        ])).toContain("project owner");
    });
});
