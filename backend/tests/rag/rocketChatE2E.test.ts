import { describe, expect, it, vi } from "vitest";

import {
    aggregateMetrics,
    createRunScope,
} from "../../scripts/ragE2E/metrics.js";
import type { CaseOutcome } from "../../scripts/ragE2E/types.js";
import {
    getNextPollDelay,
    isJobTerminal,
    isSourceReady,
    parseApiEnvelope,
    pollUntil,
    requestJson,
} from "../../scripts/ragE2E/http.js";
import {
    normalizeGeneratedQuestions,
    normalizeJudgeResponse,
} from "../../scripts/ragE2E/llm.js";
import { parseEvaluatorConfig } from "../../scripts/ragE2E/config.js";
import { renderMarkdownReport } from "../../scripts/ragE2E/report.js";

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

    it("parses successful API envelopes and rejects failed responses with bounded errors", () => {
        expect(parseApiEnvelope(202, { success: true, data: { jobId: "job-1" }, message: "accepted" }, "req-1")).toEqual({
            data: { jobId: "job-1" },
            message: "accepted",
        });

        expect(() => parseApiEnvelope(500, { success: false, message: "backend failed" }, "req-1"))
            .toThrow("backend failed (request req-1)");
    });

    it("recognizes only the scoped active source with indexed chunks", () => {
        expect(isSourceReady({ sources: [
            { filename: "other.txt", status: "ACTIVE", chunksCount: 3 },
            { filename: "DOC_RAG.txt", status: "ACTIVE", chunksCount: 4 },
        ] }, "DOC_RAG.txt")).toMatchObject({ filename: "DOC_RAG.txt", chunksCount: 4 });
        expect(isSourceReady({ sources: [{ filename: "DOC_RAG.txt", status: "EMPTY", chunksCount: 0 }] }, "DOC_RAG.txt"))
            .toBeUndefined();
    });

    it("waits through intermediate worker failures and caps exponential polling delay", () => {
        expect(isJobTerminal({ status: "FAILED", attempts: 1 }, 3)).toBe(false);
        expect(isJobTerminal({ status: "FAILED", attempts: 3 }, 3)).toBe(true);
        expect(isJobTerminal({ status: "COMPLETED", attempts: 1 }, 3)).toBe(true);
        expect(getNextPollDelay(500, 5000, 0)).toBe(500);
        expect(getNextPollDelay(500, 5000, 3)).toBe(4000);
        expect(getNextPollDelay(500, 5000, 8)).toBe(5000);
    });

    it("sends the canonical request ID and bearer token through the integration transport", async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            status: 202,
            headers: { get: (name: string) => name.toLowerCase() === "x-request-id" ? "req-1" : null },
            text: async () => JSON.stringify({ success: true, data: { accepted: true }, message: "ok" }),
        });

        await expect(requestJson({
            baseUrl: "http://localhost:8000",
            token: "secret-token",
            path: "/api/v1/integrations/rocketchat/messages/async",
            method: "POST",
            requestId: "req-1",
            body: { requestId: "req-1" },
            timeoutMs: 1000,
            fetchImpl,
        })).resolves.toMatchObject({ data: { accepted: true }, requestId: "req-1" });

        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8000/api/v1/integrations/rocketchat/messages/async",
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer secret-token",
                    "X-Request-Id": "req-1",
                }),
            }),
        );
    });

    it("polls until a predicate succeeds without sleeping in the test", async () => {
        const read = vi.fn<() => Promise<{ ready: boolean }>>()
            .mockResolvedValueOnce({ ready: false })
            .mockResolvedValueOnce({ ready: true });
        const sleep = vi.fn().mockResolvedValue(undefined);

        await expect(pollUntil(read, (value) => value.ready, {
            timeoutMs: 1000,
            initialMs: 10,
            maxMs: 20,
            sleep,
        })).resolves.toMatchObject({ value: { ready: true }, attempts: 2 });
        expect(sleep).toHaveBeenCalledWith(10);
    });

    it("normalizes a fenced generated question set and rejects duplicate or incomplete cases", () => {
        const raw = "```json\n{" +
            "\"questions\":[{" +
            "\"caseId\":\"q1\",\"question\":\"Khi nào diễn ra?\",\"referenceAnswer\":\"27/08/2026\",\"evidence\":\"27/08/2026\",\"category\":\"date\",\"answerable\":true" +
            "}]}\n```";

        expect(normalizeGeneratedQuestions(raw, 1)).toEqual([expect.objectContaining({
            caseId: "q1",
            category: "date",
            answerable: true,
        })]);
        expect(() => normalizeGeneratedQuestions(JSON.stringify({
            questions: [
                { caseId: "q1", question: "same", referenceAnswer: "a", evidence: "a", category: "fact", answerable: true },
                { caseId: "q1", question: "same", referenceAnswer: "a", evidence: "a", category: "fact", answerable: true },
            ],
        }), 2)).toThrow(/distinct|duplicate/i);
    });

    it("extracts a judge object from surrounding prose and validates its 0-to-2 rubric", () => {
        expect(normalizeJudgeResponse("Here is the result: {\"correctness\":2,\"groundedness\":1,\"citationSupport\":2,\"refusal\":0,\"rationale\":\"supported\"}"))
            .toEqual({ correctness: 2, groundedness: 1, citationSupport: 2, refusal: 0, rationale: "supported" });
        expect(() => normalizeJudgeResponse(JSON.stringify({
            correctness: 3,
            groundedness: 1,
            citationSupport: 1,
            refusal: 1,
            rationale: "bad score",
        }))).toThrow(/0.*2|score/i);
    });

    it("validates evaluator configuration while preserving safe defaults", () => {
        expect(parseEvaluatorConfig({
            RAG_E2E_DOCUMENT_PATH: "package.json",
            RAG_E2E_TOKEN: "token",
            RAG_E2E_ROCKET_USER_ID: "user",
        })).toMatchObject({
            baseUrl: "http://localhost:8000",
            cases: 50,
            provider: "DEFAULT",
            workerAttempts: 3,
            rocketUserId: "user",
        });
        expect(() => parseEvaluatorConfig({ RAG_E2E_BASE_URL: "not-a-url", RAG_E2E_DOCUMENT_PATH: "x", RAG_E2E_TOKEN: "t", RAG_E2E_ROCKET_USER_ID: "u" }))
            .toThrow(/base URL/i);
        expect(() => parseEvaluatorConfig({ RAG_E2E_DOCUMENT_PATH: "package.json", RAG_E2E_ROCKET_USER_ID: "u" }))
            .toThrow(/token/i);
        expect(() => parseEvaluatorConfig({ RAG_E2E_DOCUMENT_PATH: "package.json", RAG_E2E_TOKEN: "t", RAG_E2E_ROCKET_USER_ID: "" }))
            .toThrow(/rocket.*user/i);
        expect(() => parseEvaluatorConfig({ RAG_E2E_DOCUMENT_PATH: "package.json", RAG_E2E_TOKEN: "t", RAG_E2E_ROCKET_USER_ID: "u", RAG_E2E_CASES: "0" }))
            .toThrow(/cases/i);
    });

    it("renders a redacted Markdown report with synthetic-label warning", () => {
        const markdown = renderMarkdownReport({
            schemaVersion: 1,
            run: { runId: "run-1", workspaceId: "ws", roomId: "room", rocketUserId: "user", documentPath: "DOC_RAG.txt", documentSha256: "hash", evaluatorModel: "model", judgeModel: "judge", promptVersions: { generator: "v1", judge: "v1" }, configuration: { token: "secret-token" } },
            ingestion: { status: "COMPLETED", sourceId: "source-1", chunksCount: 4, durationMs: 20 },
            cases: [],
            aggregate: { generatedCount: 0, completedCount: 0, failedCount: 0, judgeErrorCount: 0, scoreEligibleCount: 0, emptyCitationCount: 0, errorRate: 0, emptyCitationRate: 0, averageScores: { correctness: null, groundedness: null, citationSupport: null, refusal: null }, latencyMs: { p50: null, p95: null }, thresholds: { correctness: false, groundedness: false, citationSupport: false, refusal: false, errorRate: true }, passed: false },
        } as any);

        expect(markdown).toContain("synthetic");
        expect(markdown).toContain("run-1");
        expect(markdown).not.toContain("secret-token");
    });
});
