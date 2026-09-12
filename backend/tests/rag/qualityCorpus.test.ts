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

    it("evaluates Recall and MRR at benchmark candidate depth (10) independent of individual case displayTopK", () => {
        // Construct 49 normal cases and 1 test case with displayTopK = 3 where the target is at rank 5 (index 4)
        const cases = Array.from({ length: 49 }, (_, index) => caseAt(index));
        cases.push({
            queryId: "q-deep-candidate",
            expectedChunkIds: ["chunk-rank-5"],
            expectedSourceIds: ["source-rank-5"],
            language: "vi",
            scope: { workspaceId: "ws-1", roomId: "room-rag" },
            mode: "hybrid",
            displayTopK: 3,
            retrievedIds: ["c-0", "c-1", "c-2", "c-3", "chunk-rank-5", "c-5", "c-6", "c-7", "c-8", "c-9"],
        } as any);

        const report = evaluateQualityCorpus({
            cases,
            citations: [{ sourceId: "source", documentId: "document", chunkId: "chunk" }],
            baseline: { recallAtK: 1, mrrAtK: 0.9, retrievalErrorRate: 0.01, p95RetrievalLatencyMs: 100 },
            observed: { retrievalErrorRate: 0.01, p95RetrievalLatencyMs: 100 },
        });

        expect(report.caseCount).toBe(50);
        // If candidate depth were truncated to displayTopK=3, chunk-rank-5 would NOT be found,
        // making recall < 1.0. With benchmark depth 10, chunk-rank-5 is retrieved at rank 5.
        expect(report.recallAtK).toBe(1);
        // Case 50 has 1/5 = 0.2 MRR, others have 1.0. Total MRR = (49*1 + 0.2)/50 = 49.2/50 = 0.984
        expect(report.mrrAtK).toBeCloseTo(0.984, 3);
        expect(report.passed).toBe(true);
    });
});
