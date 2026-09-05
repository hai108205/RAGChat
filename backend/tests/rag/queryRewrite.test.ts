import { describe, expect, it, vi } from "vitest";
import { rewriteQueryWithStructuredOutput } from "../../rag/queryRewrite.js";

describe("structured query rewrite", () => {
    it("does not call a model for a standalone question", async () => {
        const invoke = vi.fn();
        await expect(rewriteQueryWithStructuredOutput({
            query: "What is the retention policy?",
            history: [],
            invoke,
        })).resolves.toEqual({ query: "What is the retention policy?", rewritten: false });
        expect(invoke).not.toHaveBeenCalled();
    });

    it("uses a typed model result for an ambiguous follow-up", async () => {
        await expect(rewriteQueryWithStructuredOutput({
            query: "Who owns it?",
            history: [{ role: "user", content: "Tell me about the payments service." }],
            invoke: async () => ({ retrievalQuery: "Who owns the payments service?", shouldRewrite: true }),
        })).resolves.toEqual({ query: "Who owns the payments service?", rewritten: true });
    });

    it("falls back to the original query when structured output fails", async () => {
        await expect(rewriteQueryWithStructuredOutput({
            query: "Who is he?",
            history: [{ role: "user", content: "Tell me about Ada." }],
            invoke: async () => { throw new Error("invalid structured output"); },
        })).resolves.toEqual({ query: "Who is he?", rewritten: false, fallbackReason: "QUERY_REWRITE_FAILURE" });
    });
});
