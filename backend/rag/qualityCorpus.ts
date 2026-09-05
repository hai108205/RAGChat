import {
    evaluateRagQualityGates,
    type QualityGateReport,
    type RetrievalQualityCase,
} from "./qualityGate.js";

export interface LabelledQualityCorpus {
    cases: readonly RetrievalQualityCase[];
    citations: readonly { sourceId?: unknown; documentId?: unknown; chunkId?: unknown }[];
    baseline: { recallAtK: number; mrrAtK: number; retrievalErrorRate?: number; p95RetrievalLatencyMs?: number };
    observed?: { retrievalErrorRate: number; p95RetrievalLatencyMs: number };
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
    if (corpus.baseline.retrievalErrorRate === undefined
        || corpus.baseline.p95RetrievalLatencyMs === undefined
        || corpus.observed === undefined) {
        throw new Error("RAG quality corpus requires operational metrics for baseline error rate, baseline p95 latency, and observed measurements");
    }
    return {
        ...evaluateRagQualityGates(corpus),
        caseCount: corpus.cases.length,
    };
}
