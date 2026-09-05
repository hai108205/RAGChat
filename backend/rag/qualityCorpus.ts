import {
    evaluateRagQualityGates,
    type QualityGateReport,
    type RetrievalQualityCase,
} from "./qualityGate.js";

export interface LabelledQualityCorpus {
    cases: readonly RetrievalQualityCase[];
    citations: readonly { sourceId?: unknown; documentId?: unknown; chunkId?: unknown }[];
    baseline: { recallAtK: number; mrrAtK: number };
    maxMrrRegression?: number;
    scopeLeaks?: number;
}

export interface QualityCorpusReport extends QualityGateReport {
    caseCount: number;
}

/**
 * CI-facing gate for a human-labelled corpus. It never fabricates relevance labels:
 * callers must supply the retrieval results and citations collected from the target environment.
 */
export function evaluateQualityCorpus(
    corpus: LabelledQualityCorpus,
    minimumCaseCount = 50,
): QualityCorpusReport {
    if (corpus.cases.length < minimumCaseCount) {
        throw new Error(`RAG quality corpus requires at least ${minimumCaseCount} labelled cases; received ${corpus.cases.length}`);
    }
    return {
        ...evaluateRagQualityGates(corpus),
        caseCount: corpus.cases.length,
    };
}
