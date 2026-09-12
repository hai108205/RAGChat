import { ApiError } from "./ApiError.js";

export interface RocketChatScope {
    workspaceId: string;
    roomId: string;
    threadId?: string | null;
}

export interface RocketChatScopeFilter {
    workspaceId?: string | null;
    roomId?: string | null;
    threadId?: string | null;
    mode?: "room" | "global";
    allowGlobal?: boolean;
}

/**
 * Normalizes Rocket.Chat workspace ID (default: "default").
 */
export function normalizeWorkspaceId(workspaceId?: string | null): string {
    const trimmed = (workspaceId || "").trim();
    return trimmed.length > 0 ? trimmed : "default";
}

/**
 * Normalizes Rocket.Chat room ID.
 */
export function normalizeRoomId(roomId?: string | null): string {
    return (roomId || "").trim();
}

/**
 * Normalizes Rocket.Chat thread ID (empty string becomes null).
 */
export function normalizeThreadId(threadId?: string | null): string | null {
    const trimmed = (threadId || "").trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds canonical unique concurrency-safe scope key for Chat model.
 */
export function buildRocketChatScopeKey(params: {
    userId: string;
    workspaceId?: string | null;
    roomId: string;
    threadId?: string | null;
}): string {
    const ws = normalizeWorkspaceId(params.workspaceId);
    const rm = normalizeRoomId(params.roomId);
    const th = normalizeThreadId(params.threadId) || "";
    return `rc_scope:${params.userId}:${ws}:${rm}:${th}`;
}

/**
 * Builds standard display name for Rocket.Chat Chat entity.
 */
export function buildRocketChatChatName(params: {
    workspaceId?: string | null;
    roomId: string;
    threadId?: string | null;
}): string {
    const ws = normalizeWorkspaceId(params.workspaceId);
    const rm = normalizeRoomId(params.roomId);
    const th = normalizeThreadId(params.threadId);
    return `RC_${ws}_Room_${rm}${th ? `_Thread_${th}` : ""}`;
}

/**
 * Builds standard canonical rocketchat:// documentation URL for ChatSource.
 * Format: rocketchat://<workspace>/<room>/<thread-or-_room>/<sourceId>/<filename>
 */
export function buildRocketChatDocumentationUrl(params: {
    workspaceId?: string | null;
    roomId: string;
    threadId?: string | null;
    sourceId: string;
    filename: string;
}): string {
    const ws = encodeURIComponent(normalizeWorkspaceId(params.workspaceId));
    const rm = encodeURIComponent(normalizeRoomId(params.roomId));
    const th = params.threadId
        ? encodeURIComponent(normalizeThreadId(params.threadId)!)
        : "_room";
    const srcId = encodeURIComponent(params.sourceId);
    const fn = encodeURIComponent(params.filename);
    return `rocketchat://${ws}/${rm}/${th}/${srcId}/${fn}`;
}

export interface ParsedRocketChatUrl {
    workspaceId: string;
    roomId: string;
    threadId: string | null;
    sourceId?: string | null;
    filename: string;
    isLegacy: boolean;
}

/**
 * Parses both modern and legacy rocketchat:// URIs.
 * - Modern: rocketchat://<workspace>/<room>/<thread-or-_room>/<sourceId>/<filename>
 * - Legacy: rocketchat://<workspace>/<room>/<filename>
 * - Legacy: rocketchat://<workspace>/<room>/<thread>/<filename>
 */
export function parseRocketChatDocumentationUrl(
    url?: string | null,
): ParsedRocketChatUrl | null {
    if (!url || typeof url !== "string" || !url.startsWith("rocketchat://")) {
        return null;
    }

    const raw = url.slice("rocketchat://".length);
    const parts = raw.split("/").map((p) => {
        try {
            return decodeURIComponent(p);
        } catch {
            return p;
        }
    });

    if (parts.length < 3) {
        return null;
    }

    // Modern format: 5 or more parts: [ws, room, threadPart, sourceId, ...fileParts]
    if (parts.length >= 5) {
        const [ws, room, threadPart, sourceId, ...fileParts] = parts;
        const threadId =
            threadPart === "_room" || !threadPart || threadPart.trim().length === 0
                ? null
                : threadPart;
        return {
            workspaceId: ws,
            roomId: room,
            threadId,
            sourceId,
            filename: fileParts.join("/"),
            isLegacy: false,
        };
    }

    // Legacy with 4 parts: [ws, room, threadPart, filePart]
    if (parts.length === 4) {
        const [ws, room, threadPart, filePart] = parts;
        const threadId =
            threadPart === "_room" || !threadPart || threadPart.trim().length === 0
                ? null
                : threadPart;
        return {
            workspaceId: ws,
            roomId: room,
            threadId,
            sourceId: null,
            filename: filePart,
            isLegacy: true,
        };
    }

    // Legacy with 3 parts: [ws, room, filename]
    if (parts.length === 3) {
        const [ws, room, ...fileParts] = parts;
        return {
            workspaceId: ws,
            roomId: room,
            threadId: null,
            sourceId: null,
            filename: fileParts.join("/"),
            isLegacy: true,
        };
    }

    return null;
}

/**
 * Builds Prisma where clause for ChatSource queries matching scope rules.
 * - In room mode (default), roomId is required.
 * - When threadId is provided: matches room-level sources (threadId = null) + sources for that specific thread.
 * - When threadId is null/omitted: matches ONLY room-level sources (threadId = null).
 * - Global mode requires explicit allowGlobal=true.
 */
export function buildChatSourceScopeWhere(filter: RocketChatScopeFilter): any {
    const {
        workspaceId,
        roomId,
        threadId,
        mode = "room",
        allowGlobal = false,
    } = filter;

    if (mode === "global") {
        if (!allowGlobal) {
            throw new ApiError(403, "Global mode is restricted and not permitted");
        }
        const ws = workspaceId ? normalizeWorkspaceId(workspaceId) : undefined;
        if (ws) {
            return {
                OR: [
                    { rocketchatWorkspaceId: ws },
                    {
                        documentationUrl: {
                            startsWith: `rocketchat://${ws}/`,
                        },
                    },
                ],
            };
        }
        return {};
    }

    // Room mode (default)
    const ws = normalizeWorkspaceId(workspaceId);
    const rm = normalizeRoomId(roomId);
    if (!rm) {
        throw new ApiError(
            400,
            "roomId is required for room-scoped source operations",
        );
    }

    const th = normalizeThreadId(threadId);

    if (th) {
        // Thread scope: room-level sources (null) + thread sources
        return {
            OR: [
                {
                    rocketchatWorkspaceId: ws,
                    rocketchatRoomId: rm,
                    OR: [
                        { rocketchatThreadId: th },
                        { rocketchatThreadId: null },
                    ],
                },
                {
                    rocketchatRoomId: null,
                    documentationUrl: {
                        startsWith: `rocketchat://${ws}/${rm}/`,
                    },
                    OR: [
                        { rocketchatThreadId: th },
                        { rocketchatThreadId: null },
                    ],
                },
            ],
        };
    }

    // Room root scope: only room-level sources (threadId = null)
    return {
        OR: [
            {
                rocketchatWorkspaceId: ws,
                rocketchatRoomId: rm,
                rocketchatThreadId: null,
            },
            {
                rocketchatRoomId: null,
                rocketchatThreadId: null,
                documentationUrl: {
                    startsWith: `rocketchat://${ws}/${rm}/`,
                },
            },
        ],
    };
}

/**
 * Builds Prisma where clauses for Stats endpoint (sources and chats).
 */
export function buildStatsScopeWhere(filter: RocketChatScopeFilter): {
    sourceWhere: any;
    chatWhere: any;
} {
    const ws = normalizeWorkspaceId(filter.workspaceId);
    const rm = normalizeRoomId(filter.roomId);
    const th = normalizeThreadId(filter.threadId);

    if (rm) {
        const sourceWhere = buildChatSourceScopeWhere({
            workspaceId: ws,
            roomId: rm,
            threadId: th,
            mode: "room",
        });

        const chatWhere = {
            OR: [
                {
                    rocketchatWorkspaceId: ws,
                    rocketchatRoomId: rm,
                    ...(th
                        ? {
                              OR: [
                                  { rocketchatThreadId: th },
                                  { rocketchatThreadId: null },
                              ],
                          }
                        : { rocketchatThreadId: null }),
                },
                {
                    name: {
                        startsWith: `RC_${ws}_Room_${rm}`,
                    },
                },
            ],
        };

        return { sourceWhere, chatWhere };
    }

    const sourceWhere = filter.workspaceId
        ? {
              OR: [
                  { rocketchatWorkspaceId: ws },
                  { documentationUrl: { startsWith: `rocketchat://${ws}/` } },
              ],
          }
        : {};

    const chatWhere = filter.workspaceId
        ? {
              OR: [
                  { rocketchatWorkspaceId: ws },
                  { name: { startsWith: `RC_${ws}_` } },
              ],
          }
        : {};

    return { sourceWhere, chatWhere };
}

/**
 * Verifies that a source belongs to the authorized room/workspace before deletion.
 */
export function verifySourceDeletionScope(
    source: {
        rocketchatWorkspaceId?: string | null;
        rocketchatRoomId?: string | null;
        documentationUrl?: string | null;
    },
    params: {
        workspaceId?: string | null;
        roomId?: string | null;
        mode?: "room" | "global";
        allowGlobal?: boolean;
    },
): void {
    const mode = params.mode || "room";
    if (mode === "global") {
        if (!params.allowGlobal) {
            throw new ApiError(403, "Global mode is restricted");
        }
        return;
    }

    const ws = normalizeWorkspaceId(params.workspaceId);
    const rm = normalizeRoomId(params.roomId);

    if (!rm) {
        throw new ApiError(
            400,
            "workspaceId and roomId are required for room-scoped source deletion",
        );
    }

    const matchesExplicit =
        source.rocketchatRoomId === rm &&
        (source.rocketchatWorkspaceId === ws ||
            (!source.rocketchatWorkspaceId && ws === "default"));

    const matchesLegacy =
        !source.rocketchatRoomId &&
        Boolean(
            source.documentationUrl &&
                source.documentationUrl.startsWith(`rocketchat://${ws}/${rm}/`),
        );

    if (!matchesExplicit && !matchesLegacy) {
        throw new ApiError(
            403,
            "Source does not belong to the specified workspace and room",
        );
    }
}

/**
 * Verifies that a ChatMessage belongs to the authorized workspace and room.
 */
export function verifyFeedbackScope(
    chat: {
        rocketchatWorkspaceId?: string | null;
        rocketchatRoomId?: string | null;
        name?: string | null;
    } | null,
    params: {
        workspaceId?: string | null;
        roomId?: string | null;
    },
): void {
    if (!chat) return;

    const ws = normalizeWorkspaceId(params.workspaceId);
    const rm = normalizeRoomId(params.roomId);

    if (!rm) return;

    if (chat.rocketchatRoomId && chat.rocketchatRoomId !== rm) {
        throw new ApiError(
            403,
            "ChatMessage does not belong to the specified room",
        );
    }

    if (chat.rocketchatWorkspaceId && chat.rocketchatWorkspaceId !== ws) {
        throw new ApiError(
            403,
            "ChatMessage does not belong to the specified workspace",
        );
    }

    // Check name fallback if explicit columns are null
    if (!chat.rocketchatRoomId && chat.name) {
        const expectedPrefix = `RC_${ws}_Room_${rm}`;
        if (!chat.name.startsWith(expectedPrefix)) {
            throw new ApiError(
                403,
                "ChatMessage does not belong to the specified workspace and room",
            );
        }
    }
}
