import { describe, expect, it } from "vitest";
import { evaluateQualityCorpus } from "../../rag/qualityCorpus.js";

const caseAt = (index: number) => ({
    queryId: `q-${index}`,
    relevantIds: [`chunk-${index}`],
    retrievedIds: [`chunk-${index}`],
});

describe("labelled RAG quality corpus", () => {
    it("requires an adequately sized corpus before a CI quality gate can pass", () => {
        expect(() => evaluateQualityCorpus({
            cases: Array.from({ length: 49 }, (_, index) => caseAt(index)),
            citations: [{ sourceId: "source", documentId: "document", chunkId: "chunk" }],
            baseline: { recallAtK: 1, mrrAtK: 1 },
        })).toThrow(/at least 50 labelled cases/i);
    });

    it("reports a passing real-corpus gate only when retrieval, citations, and isolation pass", () => {
        const report = evaluateQualityCorpus({
            cases: Array.from({ length: 50 }, (_, index) => caseAt(index)),
            citations: [{ sourceId: "source", documentId: "document", chunkId: "chunk" }],
            baseline: { recallAtK: 1, mrrAtK: 1, retrievalErrorRate: 0.01, p95RetrievalLatencyMs: 100 },
            observed: { retrievalErrorRate: 0.01, p95RetrievalLatencyMs: 100 },
        });

        expect(report.caseCount).toBe(50);
        expect(report.passed).toBe(true);
    });

    it("fails closed when the corpus omits operational cutover measurements", () => {
        expect(() => evaluateQualityCorpus({
            cases: Array.from({ length: 50 }, (_, index) => caseAt(index)),
            citations: [{ sourceId: "source", documentId: "document", chunkId: "chunk" }],
            baseline: { recallAtK: 1, mrrAtK: 1 },
        })).toThrow(/operational metrics/i);
    });
});
