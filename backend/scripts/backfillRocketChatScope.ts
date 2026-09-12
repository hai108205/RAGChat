import { fileURLToPath } from "node:url";
import prisma from "../utils/prismaClient.js";
import logger from "../utils/logger.js";
import {
    buildRocketChatScopeKey,
    parseRocketChatDocumentationUrl,
    normalizeWorkspaceId,
    normalizeRoomId,
    normalizeThreadId,
} from "../utils/rocketchatScope.js";

export interface BackfillSummary {
    chatsProcessed: number;
    chatsUpdated: number;
    duplicateChatsReconciled: number;
    unparsedChats: number;
    sourcesProcessed: number;
    sourcesUpdated: number;
    webSourcesUpdated: number;
}

/**
 * Parses Rocket.Chat naming conventions:
 * e.g., RC_default_Room_GENERAL or RC_ws1_Room_room1_Thread_t123
 */
export function parseRocketChatChatName(name: string): {
    workspaceId: string;
    roomId: string;
    threadId: string | null;
} | null {
    if (!name || !name.startsWith("RC_")) return null;

    const match = /^RC_(.+?)_Room_([^_]+)(?:_Thread_(.+))?$/.exec(name);
    if (!match) {
        // Fallback for room names with underscores
        const altMatch = /^RC_(.+?)_Room_(.+)$/.exec(name);
        if (!altMatch) return null;
        const [_, ws, rest] = altMatch;
        const threadIndex = rest.indexOf("_Thread_");
        if (threadIndex !== -1) {
            return {
                workspaceId: ws,
                roomId: rest.slice(0, threadIndex),
                threadId: rest.slice(threadIndex + 8) || null,
            };
        }
        return {
            workspaceId: ws,
            roomId: rest,
            threadId: null,
        };
    }

    const [_, ws, room, thread] = match;
    return {
        workspaceId: ws,
        roomId: room,
        threadId: thread || null,
    };
}

/**
 * Reconciles duplicate chats and backfills rocketchat scope keys and source metadata.
 */
export async function runBackfillRocketChatScope(client: any = prisma): Promise<BackfillSummary> {
    logger.info("Starting Rocket.Chat scope backfill and reconciliation...");

    const summary: BackfillSummary = {
        chatsProcessed: 0,
        chatsUpdated: 0,
        duplicateChatsReconciled: 0,
        unparsedChats: 0,
        sourcesProcessed: 0,
        sourcesUpdated: 0,
        webSourcesUpdated: 0,
    };

    // 1. Process and reconcile Chats
    const allChats = await client.chat.findMany({
        include: {
            chatSources: { select: { id: true } },
        },
        orderBy: { createdAt: "asc" },
    });

    const chatsByScopeKey = new Map<string, any[]>();
    const unparsedChats: any[] = [];

    for (const chat of allChats) {
        summary.chatsProcessed++;

        // If chat already has explicit scope fields
        let ws = chat.rocketchatWorkspaceId;
        let rm = chat.rocketchatRoomId;
        let th = chat.rocketchatThreadId;

        if (!ws || !rm) {
            const parsed = parseRocketChatChatName(chat.name);
            if (parsed) {
                ws = parsed.workspaceId;
                rm = parsed.roomId;
                th = parsed.threadId;
            }
        }

        if (ws && rm) {
            const scopeKey = buildRocketChatScopeKey({
                userId: chat.userId,
                workspaceId: ws,
                roomId: rm,
                threadId: th,
            });

            if (!chatsByScopeKey.has(scopeKey)) {
                chatsByScopeKey.set(scopeKey, []);
            }
            chatsByScopeKey.get(scopeKey)!.push({
                chat,
                workspaceId: normalizeWorkspaceId(ws),
                roomId: normalizeRoomId(rm),
                threadId: normalizeThreadId(th),
            });
        } else {
            unparsedChats.push(chat);
            summary.unparsedChats++;
        }
    }

    // Reconcile duplicate chats and set scope key
    for (const [scopeKey, entries] of chatsByScopeKey.entries()) {
        // Sort oldest first
        entries.sort(
            (a, b) =>
                new Date(a.chat.createdAt).getTime() -
                new Date(b.chat.createdAt).getTime(),
        );

        const canonical = entries[0];
        const duplicates = entries.slice(1);

        if (duplicates.length > 0) {
            logger.info(
                { scopeKey, duplicateCount: duplicates.length, canonicalId: canonical.chat.id },
                "Reconciling duplicate chat records",
            );

            for (const dup of duplicates) {
                const dupId = dup.chat.id;

                // Relink ChatMessage
                await client.chatMessage.updateMany({
                    where: { chatId: dupId },
                    data: { chatId: canonical.chat.id },
                });

                // Relink UsageEvents
                await client.usageEvents.updateMany({
                    where: { chatId: dupId },
                    data: { chatId: canonical.chat.id },
                });

                // Relink AuditEvent
                await client.auditEvent.updateMany({
                    where: { chatId: dupId },
                    data: { chatId: canonical.chat.id },
                });

                // Relink IngestionRun
                await client.ingestionRun.updateMany({
                    where: { chatId: dupId },
                    data: { chatId: canonical.chat.id },
                });

                // Connect any chat sources from dup to canonical
                if (dup.chat.chatSources && dup.chat.chatSources.length > 0) {
                    const existingSourceIds = new Set(
                        (canonical.chat.chatSources || []).map((s: any) => s.id),
                    );
                    const toConnect = dup.chat.chatSources
                        .filter((s: any) => !existingSourceIds.has(s.id))
                        .map((s: any) => ({ id: s.id }));

                    if (toConnect.length > 0) {
                        await client.chat.update({
                            where: { id: canonical.chat.id },
                            data: {
                                chatSources: { connect: toConnect },
                            },
                        });
                    }
                }

                // Delete duplicate chat row
                await client.chat.delete({
                    where: { id: dupId },
                });

                summary.duplicateChatsReconciled++;
            }
        }

        // Update canonical chat with unique scope key and scope columns
        await client.chat.update({
            where: { id: canonical.chat.id },
            data: {
                rocketchatScopeKey: scopeKey,
                rocketchatWorkspaceId: canonical.workspaceId,
                rocketchatRoomId: canonical.roomId,
                rocketchatThreadId: canonical.threadId,
            },
        });
        summary.chatsUpdated++;
    }

    // 2. Backfill ChatSource metadata
    const allSources = await client.chatSource.findMany();

    for (const source of allSources) {
        summary.sourcesProcessed++;

        if (source.documentationUrl && source.documentationUrl.startsWith("rocketchat://")) {
            const parsed = parseRocketChatDocumentationUrl(source.documentationUrl);
            if (parsed) {
                const needsUpdate =
                    !source.rocketchatWorkspaceId ||
                    !source.rocketchatRoomId ||
                    (parsed.threadId && !source.rocketchatThreadId);

                if (needsUpdate) {
                    await client.chatSource.update({
                        where: { id: source.id },
                        data: {
                            rocketchatWorkspaceId: source.rocketchatWorkspaceId || parsed.workspaceId,
                            rocketchatRoomId: source.rocketchatRoomId || parsed.roomId,
                            rocketchatThreadId: source.rocketchatThreadId || parsed.threadId,
                        },
                    });
                    summary.sourcesUpdated++;
                }
            }
        } else if (source.documentationUrl && !source.dedupeKey) {
            // Web source: set dedupeKey if missing
            const dedupeKey = `${source.documentationUrl}::${source.isVectorLess}`;
            try {
                await client.chatSource.update({
                    where: { id: source.id },
                    data: { dedupeKey },
                });
                summary.webSourcesUpdated++;
            } catch (err: any) {
                logger.warn(
                    { sourceId: source.id, dedupeKey, err: err.message },
                    "Could not set dedupeKey on web ChatSource (possibly duplicate legacy row)",
                );
            }
        }
    }

    logger.info(summary, "Rocket.Chat scope backfill complete");
    return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runBackfillRocketChatScope()
        .then((res) => {
            console.log("Backfill result:", res);
            process.exit(0);
        })
        .catch((err) => {
            console.error("Backfill failed:", err);
            process.exit(1);
        });
}
