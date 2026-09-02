import { Worker, type Job } from "bullmq";
import redis from "../utils/redis.js";
import prisma from "../utils/prismaClient.js";
import logger from "../utils/logger.js";
import { dispatchAlert } from "../utils/notificationDispatcher.js";
import { ROCKETCHAT_QUEUE_NAME, type RocketChatJobData } from "../utils/rocketchatQueue.js";
import { processRocketChatChat } from "../services/rocketchatChat.service.js";
import { processRocketChatIngestion } from "../services/rocketchatIngestion.service.js";

let workerInstance: Worker<RocketChatJobData> | null = null;

export function getRocketChatWorkerConcurrency(): number {
    const parsed = Number.parseInt(process.env.ROCKETCHAT_WORKER_CONCURRENCY || "5", 10);
    return Number.isNaN(parsed) || parsed < 1 ? 5 : parsed;
}

export async function processRocketChatJob(job: Job<RocketChatJobData>): Promise<any> {
    const { type, payload } = job.data;
    const workspaceId = payload.workspaceId || "default";
    const requestId = payload.requestId;

    logger.info(
        { jobId: job.id, type, workspaceId, requestId, attempt: (job.attemptsMade || 0) + 1 },
        "Processing Rocket.Chat integration job",
    );

    // Update DB status to PROCESSING and increment attempts
    try {
        await (prisma as any).rocketChatIntegrationJob.updateMany({
            where: {
                workspaceId,
                requestId,
                type,
            },
            data: {
                status: "PROCESSING",
                attempts: { increment: 1 },
            },
        });
    } catch (err: any) {
        logger.warn({ err: err.message, requestId }, "Could not mark integration job as PROCESSING");
    }

    try {
        let result: any;
        if (type === "chat") {
            result = await processRocketChatChat(payload as any);
        } else if (type === "ingestion") {
            result = await processRocketChatIngestion(payload as any);
        } else {
            throw new Error(`Unknown job type: ${type}`);
        }

        // Update DB status to COMPLETED
        try {
            await (prisma as any).rocketChatIntegrationJob.updateMany({
                where: {
                    workspaceId,
                    requestId,
                    type,
                },
                data: {
                    status: "COMPLETED",
                    error: null,
                },
            });
        } catch (err: any) {
            logger.warn({ err: err.message, requestId }, "Could not mark integration job as COMPLETED");
        }

        return result;
    } catch (err: any) {
        logger.error(
            { jobId: job.id, type, workspaceId, requestId, err: err.message },
            "Error processing Rocket.Chat integration job",
        );

        // Update DB status to FAILED
        try {
            await (prisma as any).rocketChatIntegrationJob.updateMany({
                where: {
                    workspaceId,
                    requestId,
                    type,
                },
                data: {
                    status: "FAILED",
                    error: err.message || "Unknown error",
                },
            });
        } catch (dbErr: any) {
            logger.warn({ err: dbErr.message, requestId }, "Could not mark integration job as FAILED");
        }

        throw err;
    }
}

export function startRocketChatWorker(): Worker<RocketChatJobData> {
    if (workerInstance) {
        return workerInstance;
    }

    const concurrency = getRocketChatWorkerConcurrency();

    workerInstance = new Worker<RocketChatJobData>(
        ROCKETCHAT_QUEUE_NAME,
        async (job: Job<RocketChatJobData>) => {
            return await processRocketChatJob(job);
        },
        {
            connection: redis as any,
            concurrency,
        },
    );

    workerInstance.on("completed", (job: Job) => {
        logger.info({ jobId: job.id, name: job.name }, "Rocket.Chat integration job completed");
    });

    workerInstance.on("failed", async (job: Job | undefined, err: Error) => {
        logger.error({ jobId: job?.id, err: err.message }, "Rocket.Chat integration job failed");

        if (job && typeof job.attemptsMade === "number" && job.opts?.attempts && job.attemptsMade >= job.opts.attempts) {
            await dispatchAlert({
                type: "rocketchat_integration_failure",
                title: "Rocket.Chat Job Permanently Failed",
                message: `Job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts. Error: ${err.message}`,
                severity: "critical",
                source: "rocketchatIntegrationWorker",
            });
        }
    });

    workerInstance.on("stalled", (jobId: string) => {
        logger.warn({ jobId }, "Rocket.Chat integration job stalled");
    });

    return workerInstance;
}

export async function closeRocketChatWorker(): Promise<void> {
    if (workerInstance) {
        await workerInstance.close();
        workerInstance = null;
    }
}

const isMain =
    process.argv[1]?.replace(/\\/g, "/").endsWith("rocketchatIntegrationWorker.ts") ||
    process.argv[1]?.replace(/\\/g, "/").endsWith("rocketchatIntegrationWorker.js");

if (isMain) {
    logger.info("Starting standalone Rocket.Chat integration worker process...");
    startRocketChatWorker();

    async function shutdownWorker() {
        logger.info("Shutting down Rocket.Chat integration worker...");
        await closeRocketChatWorker();
        await redis.quit().catch(() => {});
        await prisma.$disconnect().catch(() => {});
        process.exit(0);
    }

    process.on("SIGINT", shutdownWorker);
    process.on("SIGTERM", shutdownWorker);
}
