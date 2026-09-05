export interface RetrievalQualityCase {
    queryId: string;
    relevantIds: string[];
    retrievedIds: string[];
}

export interface QualityGateReport {
    recallAtK: number;
    mrrAtK: number;
    citationProvenance: number;
    scopeLeaks: number;
    passed: boolean;
}

export function evaluateRetrievalQuality(cases: readonly RetrievalQualityCase[], k = 10): { recallAtK: number; mrrAtK: number } {
    if (!cases.length) return { recallAtK: 0, mrrAtK: 0 };
    let recall = 0;
    let mrr = 0;
    for (const item of cases) {
        const expected = new Set(item.relevantIds);
        const retrieved = item.retrievedIds.slice(0, k);
        recall += expected.size ? retrieved.filter((id) => expected.has(id)).length / expected.size : 1;
        const rank = retrieved.findIndex((id) => expected.has(id));
        if (rank >= 0) mrr += 1 / (rank + 1);
    }
    return { recallAtK: recall / cases.length, mrrAtK: mrr / cases.length };
}

export function evaluateRagQualityGates(input: {
    cases: readonly RetrievalQualityCase[];
    citations: readonly { sourceId?: unknown; documentId?: unknown; chunkId?: unknown }[];
    baseline: { recallAtK: number; mrrAtK: number };
    maxMrrRegression?: number;
    scopeLeaks?: number;
}): QualityGateReport {
    const metrics = evaluateRetrievalQuality(input.cases);
    const citationProvenance = input.citations.length
        ? input.citations.filter((citation) => citation.sourceId && citation.documentId && citation.chunkId).length / input.citations.length
        : 1;
    const scopeLeaks = input.scopeLeaks ?? 0;
    const passed = metrics.recallAtK >= input.baseline.recallAtK
        && metrics.mrrAtK >= input.baseline.mrrAtK * (1 - (input.maxMrrRegression ?? 0.05))
        && citationProvenance === 1
        && scopeLeaks === 0;
    return { ...metrics, citationProvenance, scopeLeaks, passed };
}
