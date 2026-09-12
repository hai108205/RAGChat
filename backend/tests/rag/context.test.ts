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

    it("subtracts promptReservationTokens from the available token budget", () => {
        const candidates = [
            { title: "Doc 1", snippet: "A".repeat(400), pageUrl: "https://doc1", relevance: 0.9, metadata: { chunkId: "1" } },
            { title: "Doc 2", snippet: "B".repeat(400), pageUrl: "https://doc2", relevance: 0.8, metadata: { chunkId: "2" } },
        ];
        // Without reservation (token budget 200)
        const fullContext = buildRagContext(candidates, 200);
        // With reservation of 120 tokens, remaining retrieval budget is 80 tokens
        const reservedContext = buildRagContext(candidates, 200, { promptReservationTokens: 120 });

        expect(reservedContext.estimatedTokens).toBeLessThanOrEqual(80);
        expect(reservedContext.estimatedTokens).toBeLessThan(fullContext.estimatedTokens);
    });

    it("resolves pronoun follow-ups using the latest user turn", () => {
        expect(rewriteConversationalQuery("Who is he?", [
            { role: "user", content: "Tell me about the project owner." },
        ])).toContain("project owner");
    });

    it("resolves Vietnamese ambiguous follow-ups without 12-word cap", () => {
        const query = "Bạn có thể giải thích chi tiết hơn xem nó được cấu hình và hoạt động như thế nào không?";
        expect(query.split(/\s+/).length).toBeGreaterThan(12);

        const rewritten = rewriteConversationalQuery(query, [
            { role: "user", content: "Hệ thống thanh toán hoạt động ra sao?" },
        ]);
        expect(rewritten).toContain("Hệ thống thanh toán");
        expect(rewritten).toContain(query);
    });
});
