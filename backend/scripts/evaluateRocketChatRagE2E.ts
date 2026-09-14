import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import prisma from "../utils/prismaClient.js";
import { parseEvaluatorConfig, type EvaluatorConfig } from "./ragE2E/config.js";
import {
    getNextPollDelay,
    isJobTerminal,
    isSourceReady,
    pollUntil,
    requestJson,
} from "./ragE2E/http.js";
import {
    createEvaluatorLlmClient,
    generateQuestions,
    judgeAnswer,
} from "./ragE2E/llm.js";
import { aggregateMetrics, createRunScope } from "./ragE2E/metrics.js";
import { redactSensitive, renderMarkdownReport } from "./ragE2E/report.js";
import type { CaseOutcome, EvaluatorReport, GeneratedQuestion, PersistedCitation } from "./ragE2E/types.js";

const PROMPT_VERSIONS = { generator: "rocket-chat-e2e-generator-v1", judge: "rocket-chat-e2e-judge-v1" };

function elapsed(startedAt: number): number {
    return Date.now() - startedAt;
}

function queryPath(route: string, params: Record<string, string>): string {
    return `${route}?${new URLSearchParams(params).toString()}`;
}

function sourceListPath(config: EvaluatorConfig, scope: ReturnType<typeof createRunScope>): string {
    return queryPath("/api/v1/integrations/rocketchat/sources", {
        workspaceId: scope.workspaceId,
        roomId: scope.roomId,
        mode: "room",
        limit: "100",
    });
}

async function pollSource(config: EvaluatorConfig, scope: ReturnType<typeof createRunScope>, filename: string) {
    const requestId = `${scope.runId}-source-list`;
    const result = await pollUntil(
        async () => (await requestJson<{ sources?: unknown[] }>({
            baseUrl: config.baseUrl,
            token: config.token,
            path: sourceListPath(config, scope),
            method: "GET",
            requestId,
            timeoutMs: config.requestTimeoutMs,
        })).data,
        (data) => Boolean(isSourceReady(data, filename)),
        { timeoutMs: config.pollTimeoutMs, initialMs: config.pollInitialMs, maxMs: config.pollMaxMs },
    );
    return isSourceReady(result.value, filename)!;
}

async function readJob(workspaceId: string, requestId: string, type: "chat" | "ingestion") {
    return prisma.rocketChatIntegrationJob.findUnique({
        where: { workspaceId_requestId_type: { workspaceId, requestId, type } },
        select: { status: true, attempts: true, error: true, updatedAt: true },
    });
}

async function waitForJob(config: EvaluatorConfig, workspaceId: string, requestId: string, type: "chat" | "ingestion") {
    const result = await pollUntil(
        () => readJob(workspaceId, requestId, type),
        (job) => Boolean(job && isJobTerminal(job, config.workerAttempts)),
        { timeoutMs: config.pollTimeoutMs, initialMs: config.pollInitialMs, maxMs: config.pollMaxMs },
    );
    return result.value!;
}

async function readPersistedMessage(scope: ReturnType<typeof createRunScope>, question: string, submittedAt: Date) {
    return prisma.chatMessage.findFirst({
        where: {
            userPrompt: question,
            createdAt: { gte: submittedAt },
            chat: { rocketchatWorkspaceId: scope.workspaceId, rocketchatRoomId: scope.roomId },
        },
        orderBy: { createdAt: "desc" },
        include: { sourceChunks: true },
    });
}

async function waitForPersistedMessage(config: EvaluatorConfig, scope: ReturnType<typeof createRunScope>, question: string, submittedAt: Date) {
    const result = await pollUntil(
        () => readPersistedMessage(scope, question, submittedAt),
        (message) => Boolean(message),
        { timeoutMs: config.pollTimeoutMs, initialMs: config.pollInitialMs, maxMs: config.pollMaxMs },
    );
    return result.value!;
}

function mapCitations(sourceChunks: any[]): PersistedCitation[] {
    return sourceChunks.map((source, index) => ({
        label: index + 1,
        sourceId: source.sourceId,
        documentId: source.documentId,
        chunkId: source.chunkId,
        title: source.heading,
        snippet: source.chunkText,
        pageUrl: source.pageUrl,
        relevance: typeof source.score === "number" ? source.score / 100 : null,
    }));
}

async function evaluateCase(
    config: EvaluatorConfig,
    scope: ReturnType<typeof createRunScope>,
    question: GeneratedQuestion,
    llm: ReturnType<typeof createEvaluatorLlmClient>,
): Promise<CaseOutcome> {
    const requestId = `${scope.runId}-${question.caseId}-${crypto.randomUUID().slice(0, 8)}`;
    const submittedAt = new Date();
    const startedAt = Date.now();
    try {
        await requestJson({
            baseUrl: config.baseUrl,
            token: config.token,
            path: "/api/v1/integrations/rocketchat/messages/async",
            method: "POST",
            requestId,
            body: {
                workspaceId: scope.workspaceId,
                rocketUserId: scope.rocketUserId,
                roomId: scope.roomId,
                requestId,
                query: question.question,
                provider: config.provider,
                model: config.model,
                embeddingModel: config.embeddingModel,
            },
            timeoutMs: config.requestTimeoutMs,
        });
        const job = await waitForJob(config, scope.workspaceId, requestId, "chat");
        if (job?.status !== "COMPLETED") return { caseId: question.caseId, requestId, status: "failed", error: job?.error || `Worker status: ${job?.status || "unknown"}` };
        const message = await waitForPersistedMessage(config, scope, question.question, submittedAt);
        const citations = mapCitations(message.sourceChunks || []);
        const answer = message.llmResponse || "";
        let judge: any;
        let judgeError: string | undefined;
        try {
            judge = await judgeAnswer(llm.client, config.judgeModel || llm.model, { question, answer, citations });
        } catch (error) {
            judgeError = error instanceof Error ? error.message : String(error);
        }
        return { caseId: question.caseId, requestId, status: "completed", answer, citations, latencyMs: elapsed(startedAt), judge, judgeError };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { caseId: question.caseId, requestId, status: /timed out/i.test(message) ? "timeout" : "failed", latencyMs: elapsed(startedAt), error: message };
    }
}

function sanitizedConfig(config: EvaluatorConfig): Record<string, unknown> {
    const { token: _token, ...safe } = config;
    return safe;
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    async function worker(): Promise<void> {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    return results;
}

async function run(): Promise<void> {
    const config = parseEvaluatorConfig();
    const scope = createRunScope(crypto.randomUUID, config.rocketUserId);
    const document = await readFile(config.documentPath, "utf8");
    const documentSha256 = crypto.createHash("sha256").update(document).digest("hex");
    const filename = path.basename(config.documentPath);
    const startedAt = Date.now();
    let sourceId: string | undefined;
    let report: EvaluatorReport | undefined;
    let fatalError: string | undefined;
    let ingestion: EvaluatorReport["ingestion"] = { status: "NOT_STARTED" };
    let questions: GeneratedQuestion[] = [];
    let outcomes: CaseOutcome[] = [];
    let evaluatorModel = config.model || "not-started";
    let evaluatorProvider = config.provider;
    try {
        const ingestionRequestId = `${scope.runId}-ingestion`;
        const ingestionStartedAt = Date.now();
        await requestJson({
            baseUrl: config.baseUrl,
            token: config.token,
            path: "/api/v1/integrations/rocketchat/sources/base64",
            method: "POST",
            requestId: ingestionRequestId,
            body: {
                workspaceId: scope.workspaceId,
                rocketUserId: scope.rocketUserId,
                roomId: scope.roomId,
                requestId: ingestionRequestId,
                filename,
                contentType: "text/plain",
                contentBase64: Buffer.from(document, "utf8").toString("base64"),
                embeddingModel: config.embeddingModel,
            },
            timeoutMs: config.requestTimeoutMs,
        });
        const ingestionJob = await waitForJob(config, scope.workspaceId, ingestionRequestId, "ingestion");
        if (ingestionJob.status !== "COMPLETED") {
            ingestion = { status: "FAILED", error: ingestionJob.error || `Worker status: ${ingestionJob.status}` };
            throw new Error(ingestion.error);
        }
        const source = await pollSource(config, scope, filename);
        sourceId = source.id;
        ingestion = { status: "COMPLETED", sourceId, chunksCount: Number(source.chunksCount), durationMs: elapsed(ingestionStartedAt) };
        const llm = createEvaluatorLlmClient(undefined, config.llmTimeoutMs);
        evaluatorModel = llm.model;
        evaluatorProvider = llm.provider;
        questions = await generateQuestions(llm.client, llm.model, document, config.cases);
        outcomes = await mapWithConcurrency(questions, config.concurrency, (question) => evaluateCase(config, scope, question, llm));
        const aggregate = aggregateMetrics(outcomes, config);
        report = {
            schemaVersion: 1,
            run: {
                runId: scope.runId,
                workspaceId: scope.workspaceId,
                roomId: scope.roomId,
                rocketUserId: scope.rocketUserId,
                documentPath: config.documentPath,
                documentSha256,
                evaluatorModel: llm.model,
                judgeModel: config.judgeModel || llm.model,
                provider: evaluatorProvider,
                baseUrl: config.baseUrl,
                promptVersions: PROMPT_VERSIONS,
                configuration: sanitizedConfig(config),
            },
            ingestion,
            cases: questions.map((question) => ({ ...question, ...(outcomes.find((item) => item.caseId === question.caseId) || { caseId: question.caseId, requestId: "not-submitted", status: "failed" as const, error: "Case was not evaluated" }) })),
            aggregate,
        };
    } catch (error) {
        fatalError = error instanceof Error ? error.message : String(error);
        console.error(`RAG E2E fatal error: ${fatalError}`);
        report = {
            schemaVersion: 1,
            run: {
                runId: scope.runId,
                workspaceId: scope.workspaceId,
                roomId: scope.roomId,
                rocketUserId: scope.rocketUserId,
                documentPath: config.documentPath,
                documentSha256,
                evaluatorModel,
                judgeModel: config.judgeModel || evaluatorModel,
                provider: evaluatorProvider,
                baseUrl: config.baseUrl,
                promptVersions: PROMPT_VERSIONS,
                configuration: sanitizedConfig(config),
            },
            ingestion,
            cases: questions.map((question) => ({ ...question, ...(outcomes.find((item) => item.caseId === question.caseId) || { caseId: question.caseId, requestId: "not-submitted", status: "failed" as const, error: "Case was not evaluated" }) })),
            aggregate: { ...aggregateMetrics(outcomes, config), passed: false },
        };
    } finally {
        if (config.cleanup && sourceId) {
            await requestJson({
                baseUrl: config.baseUrl,
                token: config.token,
                path: queryPath(`/api/v1/integrations/rocketchat/sources/${sourceId}`, {
                    workspaceId: scope.workspaceId,
                    roomId: scope.roomId,
                    mode: "room",
                    actorRocketUserId: scope.rocketUserId,
                }),
                method: "DELETE",
                requestId: `${scope.runId}-cleanup`,
                timeoutMs: config.requestTimeoutMs,
            }).catch((error) => console.error(`RAG E2E cleanup failed: ${error instanceof Error ? error.message : String(error)}`));
        }
        await prisma.$disconnect();
    }
    if (!report) throw new Error("RAG E2E run did not produce a report");
    await mkdir(config.outputDir, { recursive: true });
    const jsonPath = path.join(config.outputDir, `rag-e2e-${scope.runId}.json`);
    const markdownPath = path.join(config.outputDir, `rag-e2e-${scope.runId}.md`);
    const safeReport = redactSensitive(report, [
        config.token,
        process.env.OPENAI_API_KEY || "",
        process.env.OPENROUTER_LLM_API_KEY || "",
    ]) as EvaluatorReport;
    await writeFile(jsonPath, `${JSON.stringify(safeReport, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderMarkdownReport(safeReport)}\n`, "utf8");
    console.log(JSON.stringify({ runId: scope.runId, jsonPath, markdownPath, durationMs: elapsed(startedAt), aggregate: report.aggregate }));
    if (fatalError || !report.aggregate.passed) process.exitCode = 1;
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
