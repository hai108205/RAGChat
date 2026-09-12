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

    it("falls back to the original query with TRANSPORT_ERROR when transport fails", async () => {
        await expect(rewriteQueryWithStructuredOutput({
            query: "Who is he?",
            history: [{ role: "user", content: "Tell me about Ada." }],
            invoke: async () => { throw new Error("network timeout"); },
        })).resolves.toEqual({ query: "Who is he?", rewritten: false, fallbackReason: "TRANSPORT_ERROR" });
    });

    it("falls back to the original query with MALFORMED_OUTPUT when schema validation fails", async () => {
        await expect(rewriteQueryWithStructuredOutput({
            query: "Who is he?",
            history: [{ role: "user", content: "Tell me about Ada." }],
            invoke: async () => ({ invalid_key: "not matching schema" }),
        })).resolves.toEqual({ query: "Who is he?", rewritten: false, fallbackReason: "MALFORMED_OUTPUT" });
    });

    it("falls back to the original query with MALFORMED_OUTPUT when StructuredOutputParsingError occurs", async () => {
        const error = new Error("Failed to parse JSON");
        error.name = "StructuredOutputParsingError";
        await expect(rewriteQueryWithStructuredOutput({
            query: "Who is he?",
            history: [{ role: "user", content: "Tell me about Ada." }],
            invoke: async () => { throw error; },
        })).resolves.toEqual({ query: "Who is he?", rewritten: false, fallbackReason: "MALFORMED_OUTPUT" });
    });

    it("triggers rewrite for Vietnamese ambiguous follow-ups", async () => {
        const invoke = vi.fn().mockResolvedValue({ retrievalQuery: "Dịch vụ thanh toán hoạt động như thế nào?", shouldRewrite: true });
        await expect(rewriteQueryWithStructuredOutput({
            query: "Nó hoạt động như thế nào?",
            history: [{ role: "user", content: "Cho tôi biết về dịch vụ thanh toán." }],
            invoke,
        })).resolves.toEqual({ query: "Dịch vụ thanh toán hoạt động như thế nào?", rewritten: true });
        expect(invoke).toHaveBeenCalled();
    });

    it("triggers rewrite for ambiguous queries longer than 12 words without a word-count cap", async () => {
        const longQuery = "Could you please explain in much greater detail how it functions within our internal architecture and deployment pipeline?";
        expect(longQuery.split(/\s+/).length).toBeGreaterThan(12);

        const invoke = vi.fn().mockResolvedValue({ retrievalQuery: "How the payment service functions within our internal architecture and deployment pipeline?", shouldRewrite: true });
        await expect(rewriteQueryWithStructuredOutput({
            query: longQuery,
            history: [{ role: "user", content: "We are discussing the payment service." }],
            invoke,
        })).resolves.toEqual({ query: "How the payment service functions within our internal architecture and deployment pipeline?", rewritten: true });
        expect(invoke).toHaveBeenCalled();
    });
});
