import { Queue, type Job } from "bullmq";
import redis from "./redis.js";
import prisma from "./prismaClient.js";
import logger from "./logger.js";

export type RocketChatJobType = "chat" | "ingestion";
export type RocketChatJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface RocketChatChatJobPayload {
    workspaceId: string;
    rocketUserId: string;
    roomId: string;
    threadId?: string | null;
    placeholderId?: string | null;
    query: string;
    history?: any[];
    model?: string;
    temperature?: number;
    embeddingModel?: string;
    provider?: string;
    callbackUrl?: string | null;
    requestId: string;
}

export interface RocketChatIngestionJobPayload {
    workspaceId: string;
    rocketUserId: string;
    roomId: string;
    threadId?: string | null;
    filename: string;
    contentBase64: string;
    contentType?: string | null;
    embeddingModel?: string;
    callbackUrl?: string | null;
    requestId: string;
}

export type RocketChatJobData =
    | { type: "chat"; payload: RocketChatChatJobPayload }
    | { type: "ingestion"; payload: RocketChatIngestionJobPayload };

export interface EnqueueResult {
    jobId: string;
    dbJobId: string;
    isDuplicate: boolean;
    status: string;
}

export const ROCKETCHAT_QUEUE_NAME = "rocketchatIntegration";

export function getRocketChatJobId(workspaceId: string, requestId: string, type: RocketChatJobType): string {
    const ws = workspaceId || "default";
    return `rc-job-${ws}-${type}-${requestId}`;
}

let rocketchatQueue: Queue | null = null;

export function getRocketChatQueue(): Queue {
    if (!rocketchatQueue) {
        rocketchatQueue = new Queue(ROCKETCHAT_QUEUE_NAME, {
            connection: redis as any,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                removeOnComplete: {
                    age: 86400,
                    count: 1000,
                },
                removeOnFail: {
                    age: 86400 * 7,
                },
            },
        });
    }
    return rocketchatQueue;
}

export async function closeRocketChatQueue(): Promise<void> {
    if (rocketchatQueue) {
        await rocketchatQueue.close();
        rocketchatQueue = null;
    }
}

export async function enqueueRocketChatJob(
    type: RocketChatJobType,
    payload: RocketChatChatJobPayload | RocketChatIngestionJobPayload,
): Promise<EnqueueResult> {
    const workspaceId = payload.workspaceId || "default";
    const requestId = payload.requestId;
    const roomId = payload.roomId;
    const threadId = payload.threadId || null;
    const jobId = getRocketChatJobId(workspaceId, requestId, type);

    // 1. Check or insert in Prisma database (durable record)
    let dbJob: any;
    let isDuplicate = false;

    try {
        dbJob = await (prisma as any).rocketChatIntegrationJob.create({
            data: {
                type,
                workspaceId,
                roomId,
                threadId,
                requestId,
                status: "PENDING",
                payload: payload as any,
                attempts: 0,
            },
        });
    } catch (err: any) {
        // Unique constraint violation (Prisma P2002 or duplicate key error)
        if (err?.code === "P2002" || err?.message?.includes("Unique constraint") || err?.message?.includes("duplicate key")) {
            dbJob = await (prisma as any).rocketChatIntegrationJob.findUnique({
                where: {
                    workspaceId_requestId_type: {
                        workspaceId,
                        requestId,
                        type,
                    },
                },
            });
            isDuplicate = true;
        } else {
            throw err;
        }
    }

    if (isDuplicate && dbJob) {
        logger.info(
            { workspaceId, requestId, type, status: dbJob.status },
            "Duplicate Rocket.Chat integration job detected",
        );
        return {
            jobId,
            dbJobId: dbJob.id,
            isDuplicate: true,
            status: dbJob.status,
        };
    }

    // 2. Enqueue to BullMQ
    const queue = getRocketChatQueue();
    await queue.add(
        type,
        { type, payload },
        {
            jobId,
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000,
            },
            removeOnComplete: {
                age: 86400,
                count: 1000,
            },
            removeOnFail: {
                age: 86400 * 7,
            },
        },
    );

    return {
        jobId,
        dbJobId: dbJob ? dbJob.id : jobId,
        isDuplicate: false,
        status: "PENDING",
    };
}

// Alias used by index.ts for graceful shutdown compatibility
export { closeRocketChatQueue as closeQdrantCleanupQueue };
