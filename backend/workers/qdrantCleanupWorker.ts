import { Worker, Job } from "bullmq";
import redis from "../utils/redis.js";
import logger from "../utils/logger.js";
import { processOutboxEntry } from "../services/qdrantCleanupOutbox.service.js";

let qdrantCleanupWorkerInstance: Worker | null = null;

export async function processQdrantCleanupJob(job: Job): Promise<boolean> {
    const { outboxId, collectionName } = job.data;
    logger.info(
        { jobId: job.id, outboxId, collectionName, attempt: job.attemptsMade + 1 },
        "Processing Qdrant cleanup job",
    );

    if (!outboxId) {
        throw new Error("Missing outboxId in Qdrant cleanup job");
    }

    return await processOutboxEntry(outboxId);
}

export function startQdrantCleanupWorker(): Worker {
    if (!qdrantCleanupWorkerInstance) {
        qdrantCleanupWorkerInstance = new Worker(
            "qdrantCleanup",
            async (job: Job) => {
                return await processQdrantCleanupJob(job);
            },
            {
                connection: redis as any,
                concurrency: 2,
            },
        );

        qdrantCleanupWorkerInstance.on("completed", (job: Job) => {
            logger.info(
                { jobId: job.id, outboxId: job.data?.outboxId },
                "Qdrant cleanup job completed successfully",
            );
        });

        qdrantCleanupWorkerInstance.on("failed", (job: Job | undefined, err: Error) => {
            logger.error(
                {
                    jobId: job?.id,
                    outboxId: job?.data?.outboxId,
                    attemptsMade: job?.attemptsMade,
                    err: err.message,
                },
                "Qdrant cleanup job failed",
            );
        });

        logger.info("Qdrant cleanup worker started");
    }

    return qdrantCleanupWorkerInstance;
}

export async function stopQdrantCleanupWorker(): Promise<void> {
    if (qdrantCleanupWorkerInstance) {
        await qdrantCleanupWorkerInstance.close();
        qdrantCleanupWorkerInstance = null;
        logger.info("Qdrant cleanup worker stopped");
    }
}
