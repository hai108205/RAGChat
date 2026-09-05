import logger from "../utils/logger.js";
import type { RagStage } from "./types.js";

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
            try {
                return await operation();
            } finally {
                stageLatencies[name] = Date.now() - started;
                logger.debug?.({ ...fields, stage: name, latencyMs: stageLatencies[name] }, "RAG stage completed");
            }
        },
        finish(extra = {}) {
            logger.info?.({ ...fields, ...extra, latencyMs: Date.now() - startedAt, stageLatencies }, "RAG trace completed");
        },
    };
}
