import { describe, expect, it } from "vitest";

import {
    aggregateMetrics,
    createRunScope,
    type CaseOutcome,
} from "../../scripts/ragE2E/metrics.js";

describe("Rocket.Chat RAG E2E evaluator metrics", () => {
    it("creates an isolated run scope with distinct workspace, room, and request namespace", () => {
        const first = createRunScope(() => "run-one");
        const second = createRunScope(() => "run-two");

        expect(first).toEqual({
            runId: "run-one",
            workspaceId: "rag-e2e-run-one",
            roomId: "rag-e2e-room-run-one",
            rocketUserId: "rag-e2e-user",
        });
        expect(second.workspaceId).not.toBe(first.workspaceId);
        expect(second.roomId).not.toBe(first.roomId);
    });

    it("aggregates score, error, evidence, and latency metrics using defined denominators", () => {
        const outcomes: CaseOutcome[] = [
            {
                caseId: "q1",
                requestId: "req-1",
                status: "completed",
                answer: "answer",
                citations: [{ label: 1, snippet: "evidence" }],
                latencyMs: 100,
                judge: { correctness: 2, groundedness: 2, citationSupport: 2, refusal: 2, rationale: "good" },
            },
            {
                caseId: "q2",
                requestId: "req-2",
                status: "completed",
                answer: "answer",
                citations: [],
                latencyMs: 300,
                judge: { correctness: 1, groundedness: 0, citationSupport: 1, refusal: 0, rationale: "partial" },
            },
            { caseId: "q3", requestId: "req-3", status: "failed", error: "worker failed" },
            { caseId: "q4", requestId: "req-4", status: "timeout", error: "poll timeout" },
            {
                caseId: "q5",
                requestId: "req-5",
                status: "completed",
                answer: "answer",
                citations: [{ label: 1, snippet: "evidence" }],
                latencyMs: 200,
                judgeError: "invalid judge JSON",
            },
        ];

        const report = aggregateMetrics(outcomes, {
            enforce: true,
            minCorrectness: 0.7,
            minGroundedness: 0.4,
            minCitationSupport: 0.7,
            minRefusal: 0.4,
            maxErrorRate: 0.5,
        });

        expect(report).toMatchObject({
            generatedCount: 5,
            completedCount: 3,
            failedCount: 2,
            judgeErrorCount: 1,
            emptyCitationCount: 1,
            errorRate: 0.4,
            scoreEligibleCount: 2,
            averageScores: {
                correctness: 0.75,
                groundedness: 0.5,
                citationSupport: 0.75,
                refusal: 0.5,
            },
            latencyMs: { p50: 200, p95: 300 },
            passed: true,
        });
    });

    it("fails enforced thresholds when no completed case is eligible for scoring", () => {
        const report = aggregateMetrics(
            [{ caseId: "q1", requestId: "req-1", status: "failed", error: "failed" }],
            {
                enforce: true,
                minCorrectness: 0.7,
                minGroundedness: 0.7,
                minCitationSupport: 0.7,
                minRefusal: 0.8,
                maxErrorRate: 0,
            },
        );

        expect(report.averageScores).toEqual({
            correctness: null,
            groundedness: null,
            citationSupport: null,
            refusal: null,
        });
        expect(report.passed).toBe(false);
    });
});
