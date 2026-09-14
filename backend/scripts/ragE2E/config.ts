import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationThresholds } from "./types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface EvaluatorConfig extends EvaluationThresholds {
    baseUrl: string;
    token: string;
    documentPath: string;
    rocketUserId: string;
    cases: number;
    provider: string;
    model?: string;
    judgeModel?: string;
    embeddingModel?: string;
    pollTimeoutMs: number;
    pollInitialMs: number;
    pollMaxMs: number;
    requestTimeoutMs: number;
    concurrency: number;
    workerAttempts: number;
    outputDir: string;
    cleanup: boolean;
}

function text(env: Record<string, string | undefined>, key: string, fallback?: string): string {
    const value = env[key] ?? fallback;
    if (!value?.trim()) throw new Error(`${key} is required`);
    return value.trim();
}

function integer(env: Record<string, string | undefined>, key: string, fallback: number, min: number, max: number): number {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
    return value;
}

function decimal(env: Record<string, string | undefined>, key: string, fallback: number, min: number, max: number): number {
    const value = Number(env[key] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be a number from ${min} to ${max}`);
    return value;
}

function booleanValue(env: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
    const raw = (env[key] ?? String(fallback)).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(raw)) return true;
    if (["false", "0", "no", "off"].includes(raw)) return false;
    throw new Error(`${key} must be boolean`);
}

export function parseEvaluatorConfig(input: Record<string, string | undefined> = process.env): EvaluatorConfig {
    const baseUrl = text(input, "RAG_E2E_BASE_URL", "http://localhost:8000");
    try {
        const parsed = new URL(baseUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
        throw new Error("RAG_E2E_BASE_URL (base URL) must be a valid http(s) URL");
    }
    const documentPath = path.resolve(text(input, "RAG_E2E_DOCUMENT_PATH", path.join(repoRoot, "tests", "DOC_RAG.txt")));
    if (!fs.existsSync(documentPath) || !fs.statSync(documentPath).isFile()) throw new Error(`RAG_E2E_DOCUMENT_PATH is not readable: ${documentPath}`);
    const token = text(input, "RAG_E2E_TOKEN", input.ROCKETCHAT_INTEGRATION_TOKEN);
    const rocketUserId = text(input, "RAG_E2E_ROCKET_USER_ID", "rag-e2e-user");
    return {
        baseUrl: baseUrl.replace(/\/$/, ""),
        token,
        documentPath,
        rocketUserId,
        cases: integer(input, "RAG_E2E_CASES", 50, 1, 100),
        provider: text(input, "RAG_E2E_PROVIDER", "DEFAULT"),
        model: input.RAG_E2E_MODEL?.trim() || undefined,
        judgeModel: input.RAG_E2E_JUDGE_MODEL?.trim() || undefined,
        embeddingModel: input.RAG_E2E_EMBEDDING_MODEL?.trim() || undefined,
        pollTimeoutMs: integer(input, "RAG_E2E_POLL_TIMEOUT_MS", 180000, 1000, 3600000),
        pollInitialMs: integer(input, "RAG_E2E_POLL_INITIAL_MS", 500, 10, 60000),
        pollMaxMs: integer(input, "RAG_E2E_POLL_MAX_MS", 5000, 10, 120000),
        requestTimeoutMs: integer(input, "RAG_E2E_REQUEST_TIMEOUT_MS", 30000, 1000, 300000),
        concurrency: integer(input, "RAG_E2E_CONCURRENCY", 1, 1, 10),
        workerAttempts: integer(input, "RAG_E2E_WORKER_ATTEMPTS", 3, 1, 10),
        outputDir: path.resolve(text(input, "RAG_E2E_OUTPUT_DIR", path.join(repoRoot, "artifacts", "rag-e2e"))),
        cleanup: booleanValue(input, "RAG_E2E_CLEANUP", false),
        enforce: booleanValue(input, "RAG_E2E_ENFORCE_THRESHOLDS", false),
        minCorrectness: decimal(input, "RAG_E2E_MIN_CORRECTNESS", 0.7, 0, 1),
        minGroundedness: decimal(input, "RAG_E2E_MIN_GROUNDEDNESS", 0.7, 0, 1),
        minCitationSupport: decimal(input, "RAG_E2E_MIN_CITATION_SUPPORT", 0.7, 0, 1),
        minRefusal: decimal(input, "RAG_E2E_MIN_REFUSAL", 0.8, 0, 1),
        maxErrorRate: decimal(input, "RAG_E2E_MAX_ERROR_RATE", 0, 0, 1),
    };
}
