import { describe, expect, it } from "vitest";
import { evaluateRagQualityGates, evaluateRetrievalQuality } from "../../rag/qualityGate.js";

describe("RAG quality gates", () => {
    it("calculates Recall@10 and MRR@10", () => {
        expect(evaluateRetrievalQuality([{ queryId: "q1", relevantIds: ["a"], retrievedIds: ["x", "a"] }])).toEqual({ recallAtK: 1, mrrAtK: 0.5 });
    });

    it("fails when provenance or scope isolation is incomplete", () => {
        const report = evaluateRagQualityGates({
            cases: [{ queryId: "q1", relevantIds: ["a"], retrievedIds: ["a"] }],
            citations: [{ sourceId: "s", documentId: "d" }],
            baseline: { recallAtK: 1, mrrAtK: 1 },
            scopeLeaks: 1,
        });
        expect(report.passed).toBe(false);
        expect(report.citationProvenance).toBe(0);
    });
});
