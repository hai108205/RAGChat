import {
    evaluateRagQualityGates,
    type QualityGateReport,
    type RetrievalQualityCase,
} from "./qualityGate.js";

export interface QualityCorpusCase {
    queryId: string;
    retrievedIds: string[];
    relevantIds?: string[];
    expectedChunkIds?: string[];
    expectedSourceIds?: string[];
    language?: string;
    scope?: { workspaceId?: string; roomId?: string };
    mode?: "semantic" | "keyword" | "hybrid";
    displayTopK?: number;
}

export interface LabelledQualityCorpus {
    cases: readonly (RetrievalQualityCase | QualityCorpusCase)[];
    citations: readonly { sourceId?: unknown; documentId?: unknown; chunkId?: unknown }[];
    baseline: { recallAtK: number; mrrAtK: number; retrievalErrorRate?: number; p95RetrievalLatencyMs?: number };
    observed?: { retrievalErrorRate: number; p95RetrievalLatencyMs: number };
    maxMrrRegression?: number;
    scopeLeaks?: number;
    benchmarkDepth?: number;
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

    // Benchmark candidate depth defaults to 10 and remains decoupled from individual case displayTopK
    const benchmarkDepth = corpus.benchmarkDepth ?? 10;
    const normalizedCases: RetrievalQualityCase[] = corpus.cases.map((c) => {
        const anyCase = c as QualityCorpusCase;
        const relevant = anyCase.expectedChunkIds?.length
            ? anyCase.expectedChunkIds
            : anyCase.expectedSourceIds?.length
                ? anyCase.expectedSourceIds
                : anyCase.relevantIds ?? [];
        return {
            queryId: c.queryId,
            relevantIds: relevant,
            retrievedIds: c.retrievedIds,
        };
    });

    return {
        ...evaluateRagQualityGates({
            ...corpus,
            cases: normalizedCases,
            benchmarkDepth,
        }),
        caseCount: corpus.cases.length,
    };
}
