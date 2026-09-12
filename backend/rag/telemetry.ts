import logger from "../utils/logger.js";
import client from "prom-client";
import { prometheusRegistry } from "../utils/prometheusRegistry.js";
import type { RagStage } from "./types.js";

// RAG labels are deliberately bounded: no query text, IDs, document names, or model values.
const ragStageDuration = new client.Histogram<"stage" | "outcome">({
    name: "rag_stage_duration_seconds",
    help: "Duration of a RAG pipeline stage in seconds",
    labelNames: ["stage", "outcome"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
    registers: [prometheusRegistry],
});

export function recordRagStageDuration(
    stage: RagStage,
    outcome: "success" | "error",
    durationInSeconds: number,
): void {
    if (!Number.isFinite(durationInSeconds) || durationInSeconds < 0) return;
    ragStageDuration.observe({ stage, outcome }, durationInSeconds);
}

// 1. Histogram for retrieval duration per search mode
const ragRetrievalDuration = new client.Histogram<"mode">({
    name: "rag_retrieval_duration_seconds",
    help: "Duration of RAG retrieval by search mode in seconds",
    labelNames: ["mode"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registers: [prometheusRegistry],
});

export function recordRagRetrievalDuration(
    mode: "semantic" | "keyword" | "hybrid",
    durationInSeconds: number,
): void {
    if (!Number.isFinite(durationInSeconds) || durationInSeconds < 0) return;
    ragRetrievalDuration.observe({ mode }, durationInSeconds);
}

// 2. Counter for retrieval outcomes by search mode and result status
const ragRetrievalOutcomes = new client.Counter<"mode" | "result_status">({
    name: "rag_retrieval_outcomes_total",
    help: "Total count of RAG retrieval outcomes by mode and result status",
    labelNames: ["mode", "result_status"],
    registers: [prometheusRegistry],
});

export function recordRagRetrievalOutcome(
    mode: "semantic" | "keyword" | "hybrid",
    status: "has_results" | "no_results" | "error",
): void {
    ragRetrievalOutcomes.inc({ mode, result_status: status });
}

// 3. Gauge for lexical coverage ratio across active knowledge sources
const ragLexicalCoverageRatio = new client.Gauge({
    name: "rag_lexical_coverage_ratio",
    help: "Ratio of active sources with complete lexical chunk coverage",
    registers: [prometheusRegistry],
});

export function recordRagLexicalCoverage(coverageRatio: number): void {
    if (!Number.isFinite(coverageRatio)) return;
    ragLexicalCoverageRatio.set(Math.max(0, Math.min(1, coverageRatio)));
}

const SENSITIVE_KEY_PATTERN = /^(prompt|query|message|content|text|chunk|chunks|body|snippet|document|documents|systemprompt|roominstructions|answer|citation|citations|context|excerpts)$/i;

export function sanitizeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
        const lowerKey = key.toLowerCase();
        if (
            SENSITIVE_KEY_PATTERN.test(lowerKey) ||
            (lowerKey.endsWith("text") && lowerKey !== "context") ||
            lowerKey.endsWith("prompt") ||
            lowerKey.endsWith("content") ||
            lowerKey.endsWith("body") ||
            lowerKey.endsWith("message")
        ) {
            continue;
        }
        if (Array.isArray(value)) {
            const sample = value[0];
            if (sample && typeof sample === "object") {
                continue;
            }
        }
        sanitized[key] = value;
    }
    return sanitized;
}

export interface RagTrace {
    stage<T>(name: RagStage, operation: () => Promise<T>): Promise<T>;
    finish(fields?: Record<string, unknown>): void;
}

export function startRagTrace(fields: Record<string, unknown>): RagTrace {
    const sanitizedInitial = sanitizeLogFields(fields);
    const startedAt = Date.now();
    const stageLatencies: Record<string, number> = {};
    return {
        async stage<T>(name: RagStage, operation: () => Promise<T>) {
            const started = Date.now();
            let outcome: "success" | "error" = "success";
            try {
                return await operation();
            } catch (error) {
                outcome = "error";
                throw error;
            } finally {
                stageLatencies[name] = Date.now() - started;
                recordRagStageDuration(name, outcome, stageLatencies[name] / 1000);
                logger.debug?.({ ...sanitizedInitial, stage: name, latencyMs: stageLatencies[name] }, "RAG stage completed");
            }
        },
        finish(extra = {}) {
            const sanitizedExtra = sanitizeLogFields(extra);
            logger.info?.({ ...sanitizedInitial, ...sanitizedExtra, latencyMs: Date.now() - startedAt, stageLatencies }, "RAG trace completed");
        },
    };
}
