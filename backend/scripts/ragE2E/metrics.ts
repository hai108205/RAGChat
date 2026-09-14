import crypto from "node:crypto";
import type {
    AggregateMetrics,
    CaseOutcome,
    EvaluationThresholds,
    RunScope,
} from "./types.js";

export function createRunScope(idFactory: () => string = crypto.randomUUID, rocketUserId = "rag-e2e-user"): RunScope {
    const runId = idFactory();
    return {
        runId,
        workspaceId: `rag-e2e-${runId}`,
        roomId: `rag-e2e-room-${runId}`,
        rocketUserId,
    };
}

function percentile(values: number[], percentage: number): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const rank = Math.max(1, Math.ceil(sorted.length * percentage));
    return sorted[rank - 1];
}

function normalizedAverage(outcomes: CaseOutcome[], field: keyof NonNullable<CaseOutcome["judge"]>): number | null {
    const eligible = outcomes.filter((outcome) => outcome.judge && !outcome.judgeError);
    if (!eligible.length) return null;
    const total = eligible.reduce((sum, outcome) => sum + Number(outcome.judge?.[field] ?? 0), 0);
    return total / eligible.length / 2;
}

export function aggregateMetrics(outcomes: readonly CaseOutcome[], thresholds: EvaluationThresholds): AggregateMetrics {
    const generatedCount = outcomes.length;
    const completed = outcomes.filter((outcome) => outcome.status === "completed");
    const failedCount = outcomes.filter((outcome) => outcome.status !== "completed").length;
    const judgeErrorCount = outcomes.filter((outcome) => Boolean(outcome.judgeError)).length;
    const scoreEligibleCount = outcomes.filter((outcome) => outcome.judge && !outcome.judgeError).length;
    const emptyCitationCount = completed.filter((outcome) => !(outcome.citations?.length)).length;
    const averageScores = {
        correctness: normalizedAverage([...outcomes], "correctness"),
        groundedness: normalizedAverage([...outcomes], "groundedness"),
        citationSupport: normalizedAverage([...outcomes], "citationSupport"),
        refusal: normalizedAverage([...outcomes], "refusal"),
    };
    const latencies = completed.flatMap((outcome) => typeof outcome.latencyMs === "number" ? [outcome.latencyMs] : []);
    const errorRate = generatedCount ? failedCount / generatedCount : 0;
    const emptyCitationRate = generatedCount ? emptyCitationCount / generatedCount : 0;
    const scorePass = (value: number | null, minimum: number) => value !== null && value >= minimum;
    const thresholdResults = {
        correctness: scorePass(averageScores.correctness, thresholds.minCorrectness),
        groundedness: scorePass(averageScores.groundedness, thresholds.minGroundedness),
        citationSupport: scorePass(averageScores.citationSupport, thresholds.minCitationSupport),
        refusal: scorePass(averageScores.refusal, thresholds.minRefusal),
        errorRate: errorRate <= thresholds.maxErrorRate,
    };

    return {
        generatedCount,
        completedCount: completed.length,
        failedCount,
        judgeErrorCount,
        scoreEligibleCount,
        emptyCitationCount,
        errorRate,
        emptyCitationRate,
        averageScores,
        latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
        thresholds: thresholdResults,
        passed: !thresholds.enforce || (scoreEligibleCount > 0 && Object.values(thresholdResults).every(Boolean)),
    };
}
