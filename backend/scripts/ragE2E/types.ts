export type QuestionCategory = "fact" | "date" | "responsibility" | "multi_hop" | "negative";

export interface GeneratedQuestion {
    caseId: string;
    question: string;
    referenceAnswer: string;
    evidence: string;
    category: QuestionCategory;
    answerable: boolean;
}

export interface JudgeScore {
    correctness: number;
    groundedness: number;
    citationSupport: number;
    refusal: number;
    rationale: string;
}

export interface PersistedCitation {
    label: number;
    sourceId?: string | null;
    documentId?: string | null;
    chunkId?: string | null;
    title?: string | null;
    snippet?: string | null;
    pageUrl?: string | null;
    relevance?: number | null;
}

export interface CaseOutcome {
    caseId: string;
    requestId: string;
    status: "completed" | "failed" | "timeout";
    answer?: string;
    citations?: PersistedCitation[];
    latencyMs?: number;
    judge?: JudgeScore;
    judgeError?: string;
    error?: string;
}

export interface RunScope {
    runId: string;
    workspaceId: string;
    roomId: string;
    rocketUserId: string;
}

export interface EvaluationThresholds {
    enforce: boolean;
    minCorrectness: number;
    minGroundedness: number;
    minCitationSupport: number;
    minRefusal: number;
    maxErrorRate: number;
}

export interface AggregateMetrics {
    generatedCount: number;
    completedCount: number;
    failedCount: number;
    judgeErrorCount: number;
    scoreEligibleCount: number;
    emptyCitationCount: number;
    errorRate: number;
    emptyCitationRate: number;
    averageScores: {
        correctness: number | null;
        groundedness: number | null;
        citationSupport: number | null;
        refusal: number | null;
    };
    latencyMs: { p50: number | null; p95: number | null };
    thresholds: {
        correctness: boolean;
        groundedness: boolean;
        citationSupport: boolean;
        refusal: boolean;
        errorRate: boolean;
    };
    passed: boolean;
}
