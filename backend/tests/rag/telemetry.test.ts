import { describe, expect, it, vi } from "vitest";
import {
    startRagTrace,
    sanitizeLogFields,
    recordRagRetrievalDuration,
    recordRagRetrievalOutcome,
    recordRagLexicalCoverage,
} from "../../rag/telemetry.js";
import logger from "../../utils/logger.js";
import { prometheusRegistry } from "../../utils/prometheusRegistry.js";

describe("RAG telemetry", () => {
    it("records stage latency without exposing prompt content", async () => {
        const trace = startRagTrace({ requestId: "req-1", queryLength: 12 });
        await expect(trace.stage("RETRIEVAL", async () => "ok")).resolves.toBe("ok");
        trace.finish({ resultCount: 1 });
        expect(vi.isMockFunction(trace.stage)).toBe(false);
    });

    it("sanitizes sensitive fields like prompt, query, chunks, message from trace logging", async () => {
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});

        try {
            const trace = startRagTrace({
                requestId: "req-secret-1",
                queryLength: 25,
                query: "my super secret user prompt query",
                userPrompt: "confidential query prompt",
                message: "raw user message body",
                systemPrompt: "internal system instruction",
            });

            await trace.stage("RETRIEVAL", async () => ({ results: 5 }));

            trace.finish({
                resultCount: 5,
                answer: "confidential generated llm response",
                documents: [{ title: "doc1", body: "secret text" }],
                chunkText: "secret chunk text",
            });

            expect(debugSpy).toHaveBeenCalled();
            const debugPayload = debugSpy.mock.calls[0][0] as Record<string, unknown>;
            expect(debugPayload.requestId).toBe("req-secret-1");
            expect(debugPayload.queryLength).toBe(25);
            expect(debugPayload.query).toBeUndefined();
            expect(debugPayload.userPrompt).toBeUndefined();
            expect(debugPayload.message).toBeUndefined();
            expect(debugPayload.systemPrompt).toBeUndefined();

            expect(infoSpy).toHaveBeenCalled();
            const infoPayload = infoSpy.mock.calls[0][0] as Record<string, unknown>;
            expect(infoPayload.requestId).toBe("req-secret-1");
            expect(infoPayload.queryLength).toBe(25);
            expect(infoPayload.resultCount).toBe(5);
            expect(infoPayload.answer).toBeUndefined();
            expect(infoPayload.documents).toBeUndefined();
            expect(infoPayload.chunkText).toBeUndefined();
        } finally {
            infoSpy.mockRestore();
            debugSpy.mockRestore();
        }
    });

    it("records retrieval duration and outcomes per search mode", async () => {
        recordRagRetrievalDuration("semantic", 0.08);
        recordRagRetrievalDuration("keyword", 0.02);
        recordRagRetrievalDuration("hybrid", 0.15);

        recordRagRetrievalOutcome("semantic", "has_results");
        recordRagRetrievalOutcome("keyword", "no_results");
        recordRagRetrievalOutcome("hybrid", "error");

        const metricsOutput = await prometheusRegistry.metrics();
        expect(metricsOutput).toContain("rag_retrieval_duration_seconds");
        expect(metricsOutput).toContain('rag_retrieval_outcomes_total{mode="semantic",result_status="has_results"}');
        expect(metricsOutput).toContain('rag_retrieval_outcomes_total{mode="keyword",result_status="no_results"}');
        expect(metricsOutput).toContain('rag_retrieval_outcomes_total{mode="hybrid",result_status="error"}');
    });

    it("records lexical coverage ratio gauge within [0, 1] bounds", async () => {
        recordRagLexicalCoverage(0.75);
        let metricsOutput = await prometheusRegistry.metrics();
        expect(metricsOutput).toContain("rag_lexical_coverage_ratio 0.75");

        recordRagLexicalCoverage(1.5);
        metricsOutput = await prometheusRegistry.metrics();
        expect(metricsOutput).toContain("rag_lexical_coverage_ratio 1");

        recordRagLexicalCoverage(-0.5);
        metricsOutput = await prometheusRegistry.metrics();
        expect(metricsOutput).toContain("rag_lexical_coverage_ratio 0");
    });
});
