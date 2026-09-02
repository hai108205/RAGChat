import prisma from "../utils/prismaClient.js";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import { deleteQdrantCollectionSafe } from "../utils/qdrantCleanup.js";
import { getOrCreateRocketChatUser } from "../utils/rocketchatIdentity.js";
import {
    verifySourceDeletionScope,
    normalizeWorkspaceId,
    normalizeRoomId,
} from "../utils/rocketchatScope.js";
import { getQdrantCleanupQueue } from "../utils/rocketchatQueue.js";

export interface DeleteSourceInput {
    sourceId: string;
    workspaceId?: string;
    roomId?: string;
    mode?: "room" | "global";
    allowGlobal?: boolean;
    actorRocketUserId?: string;
    canManageSources?: boolean | string;
    requestId?: string;
}

export interface DeleteSourceResult {
    id: string;
    deleted: boolean;
    vectorsRemoved: boolean;
    cleanupStatus: "pending" | "none" | "completed";
    qdrant: {
        deleted: boolean;
        status?: string;
    };
}

/**
 * Handles source deletion with actor authorization, scope verification,
 * and transactional creation of a durable QdrantCleanupOutbox entry.
 */
export async function deleteSourceWithCleanup(
    input: DeleteSourceInput,
): Promise<DeleteSourceResult> {
    const {
        sourceId,
        workspaceId = "default",
        roomId,
        mode = "room",
        allowGlobal = false,
        actorRocketUserId,
        canManageSources,
        requestId,
    } = input;

    if (!sourceId) {
        throw new ApiError(400, "Source ID is required");
    }

    const ws = normalizeWorkspaceId(workspaceId);
    const rm = normalizeRoomId(roomId);

    if (mode === "global") {
        if (!allowGlobal) {
            throw new ApiError(403, "Global mode is restricted");
        }
    } else {
        if (!rm) {
            throw new ApiError(
                400,
                "workspaceId and roomId are required for room-scoped source deletion",
            );
        }
    }

    const source = await prisma.chatSource.findUnique({
        where: { id: sourceId },
    });

    if (!source) {
        throw new ApiError(404, "Source not found");
    }

    // 1. Verify Scope
    verifySourceDeletionScope(source, {
        workspaceId: ws,
        roomId: rm,
        mode,
        allowGlobal,
    });

    // 2. Verify Actor Authorization
    const isCanManage = canManageSources === true || canManageSources === "true";
    const isUploader = Boolean(
        source.uploadedByRocketUserId &&
            actorRocketUserId &&
            source.uploadedByRocketUserId === actorRocketUserId,
    );
    const isLegacyOrUnattributed = !source.uploadedByRocketUserId;

    if (!isUploader && !isCanManage && !isLegacyOrUnattributed) {
        throw new ApiError(
            403,
            "Forbidden: only the uploader or a user with canManageSources capability can delete this source",
        );
    }

    // 3. Single DB transaction: check other sources, record outbox, delete ChatSource, audit
    let outboxCreated = false;
    let outboxRecord: any = null;

    await prisma.$transaction(async (tx) => {
        let cleanupNeeded = false;
        if (source.collectionName) {
            const otherSourcesCount = await tx.chatSource.count({
                where: {
                    collectionName: source.collectionName,
                    id: { not: source.id },
                },
            });

            if (otherSourcesCount === 0) {
                cleanupNeeded = true;
            }
        }

        if (cleanupNeeded && source.collectionName) {
            const existingOutbox = await tx.qdrantCleanupOutbox.findFirst({
                where: {
                    collectionName: source.collectionName,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });

            if (!existingOutbox) {
                outboxRecord = await tx.qdrantCleanupOutbox.create({
                    data: {
                        collectionName: source.collectionName,
                        sourceId: source.id,
                        status: "PENDING",
                    },
                });
                outboxCreated = true;
            } else {
                outboxRecord = existingOutbox;
            }
        }

        await tx.chatSource.delete({
            where: { id: source.id },
        });

        const user = actorRocketUserId
            ? await getOrCreateRocketChatUser({
                  workspaceId: ws,
                  rocketUserId: actorRocketUserId,
              })
            : null;

        await tx.auditEvent.create({
            data: {
                type: "rocketchat.source.deleted",
                userId: user?.id || null,
                metadata: {
                    sourceId: source.id,
                    filename: source.heading,
                    documentationUrl: source.documentationUrl,
                    collectionName: source.collectionName,
                    workspaceId: ws,
                    roomId: rm,
                    actorRocketUserId,
                    canManageSources: isCanManage,
                    cleanupScheduled: cleanupNeeded,
                    requestId,
                },
            },
        });
    });

    // 4. Enqueue BullMQ job after transaction commits
    if (outboxCreated && outboxRecord) {
        try {
            const queue = getQdrantCleanupQueue();
            await queue.add(
                "cleanupQdrantCollection",
                {
                    outboxId: outboxRecord.id,
                    collectionName: outboxRecord.collectionName,
                },
                {
                    jobId: `qdrant-clean-${outboxRecord.id}`,
                    attempts: 5,
                    backoff: {
                        type: "exponential",
                        delay: 1000,
                    },
                    removeOnComplete: true,
                },
            );
        } catch (err: any) {
            logger.warn(
                { err: err.message, outboxId: outboxRecord.id },
                "Failed to enqueue Qdrant cleanup job into BullMQ; outbox worker will process it via polling fallback",
            );
        }
    }

    return {
        id: source.id,
        deleted: true,
        vectorsRemoved: false,
        cleanupStatus: outboxRecord ? "pending" : "none",
        qdrant: {
            deleted: false,
            status: outboxRecord ? "pending" : "none",
        },
    };
}

/**
 * Processes a single QdrantCleanupOutbox record idempotently.
 */
export async function processOutboxEntry(outboxId: string): Promise<boolean> {
    const outbox = await prisma.qdrantCleanupOutbox.findUnique({
        where: { id: outboxId },
    });

    if (!outbox || outbox.status === "COMPLETED") {
        return true;
    }

    await prisma.qdrantCleanupOutbox.update({
        where: { id: outboxId },
        data: {
            status: "PROCESSING",
            attempts: { increment: 1 },
        },
    });

    const cleanupRes = await deleteQdrantCollectionSafe(outbox.collectionName);

    if (cleanupRes.deleted) {
        await prisma.qdrantCleanupOutbox.update({
            where: { id: outboxId },
            data: {
                status: "COMPLETED",
                lastError: null,
                processedAt: new Date(),
            },
        });
        return true;
    }

    const nextAttempts = outbox.attempts + 1;
    const isDead = nextAttempts >= outbox.maxAttempts;

    await prisma.qdrantCleanupOutbox.update({
        where: { id: outboxId },
        data: {
            status: isDead ? "DEAD" : "FAILED",
            lastError: cleanupRes.reason || "Qdrant collection deletion failed",
            processedAt: isDead ? new Date() : undefined,
        },
    });

    throw new Error(
        `Failed to clean up Qdrant collection "${outbox.collectionName}": ${cleanupRes.reason}`,
    );
}

/**
 * Processes pending or failed outbox entries (e.g. for periodic fallback).
 */
export async function processPendingOutboxEntries(limit = 10): Promise<number> {
    const pendingEntries = await prisma.qdrantCleanupOutbox.findMany({
        where: {
            status: { in: ["PENDING", "FAILED"] },
            attempts: { lt: 5 },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
    });

    let processedCount = 0;
    for (const entry of pendingEntries) {
        try {
            await processOutboxEntry(entry.id);
            processedCount++;
        } catch (err: any) {
            logger.warn(
                { err: err.message, outboxId: entry.id },
                "Error processing outbox entry in fallback loop",
            );
        }
    }
    return processedCount;
}
