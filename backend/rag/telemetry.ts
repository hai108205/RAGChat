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

export interface RagTrace {
    stage<T>(name: RagStage, operation: () => Promise<T>): Promise<T>;
    finish(fields?: Record<string, unknown>): void;
}

export function startRagTrace(fields: Record<string, unknown>): RagTrace {
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
                logger.debug?.({ ...fields, stage: name, latencyMs: stageLatencies[name] }, "RAG stage completed");
            }
        },
        finish(extra = {}) {
            logger.info?.({ ...fields, ...extra, latencyMs: Date.now() - startedAt, stageLatencies }, "RAG trace completed");
        },
    };
}
