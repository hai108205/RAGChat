import prisma from "./prismaClient.js";
import {
    buildRocketChatScopeKey,
    buildRocketChatChatName,
    buildChatSourceScopeWhere,
    normalizeWorkspaceId,
    normalizeRoomId,
    normalizeThreadId,
    parseRocketChatDocumentationUrl,
} from "./rocketchatScope.js";

export {
    buildRocketChatScopeKey,
    buildRocketChatChatName,
    buildChatSourceScopeWhere,
    parseRocketChatDocumentationUrl,
};

/**
 * Normalizes Rocket.Chat identity identifiers to a predictable internal username.
 */
export function normalizeRocketChatUsername(workspaceId?: string | null, rocketUserId?: string | null): string {
    const ws = (workspaceId || "default").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    const uid = (rocketUserId || "unknown").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    return `rc_${ws}_${uid}`;
}

export interface GetOrCreateRocketChatUserInput {
    workspaceId?: string | null;
    rocketUserId?: string | null;
}

/**
 * Finds or creates an internal service identity for a Rocket.Chat user.
 * This is not a login account and should not receive a password.
 */
export async function getOrCreateRocketChatUser({ workspaceId, rocketUserId }: GetOrCreateRocketChatUserInput) {
    const username = normalizeRocketChatUsername(workspaceId, rocketUserId);
    const email = `${username}@rocketchat.local`;

    let user = await prisma.user.findFirst({
        where: {
            OR: [{ username }, { email }],
        },
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                username,
                email,
                fullname: `Rocket.Chat User ${rocketUserId || "unknown"}`,
                isVerified: true,
                isAdmin: false,
            },
        });
    }

    return user;
}

export interface GetOrCreateRocketChatChatInput {
    userId: string;
    roomId: string;
    threadId?: string | null;
    workspaceId?: string | null;
}

/**
 * Finds or creates an internal Chat record corresponding to a Rocket.Chat room and thread.
 * Uses concurrency-safe upsert on rocketchatScopeKey.
 */
export async function getOrCreateRocketChatChat({
    userId,
    roomId,
    threadId,
    workspaceId,
}: GetOrCreateRocketChatChatInput) {
    const ws = normalizeWorkspaceId(workspaceId);
    const rm = normalizeRoomId(roomId);
    const th = normalizeThreadId(threadId);
    const scopeKey = buildRocketChatScopeKey({
        userId,
        workspaceId: ws,
        roomId: rm,
        threadId: th,
    });
    const chatName = buildRocketChatChatName({
        workspaceId: ws,
        roomId: rm,
        threadId: th,
    });

    let chat: any;
    if (typeof (prisma.chat as any)?.upsert === "function") {
        chat = await prisma.chat.upsert({
            where: {
                rocketchatScopeKey: scopeKey,
            },
            create: {
                userId,
                name: chatName,
                status: "READY",
                rocketchatScopeKey: scopeKey,
                rocketchatWorkspaceId: ws,
                rocketchatRoomId: rm,
                rocketchatThreadId: th,
            },
            update: {
                deletedAt: null,
                rocketchatWorkspaceId: ws,
                rocketchatRoomId: rm,
                rocketchatThreadId: th,
            },
            include: {
                chatSources: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });
    } else {
        chat = await prisma.chat.findFirst({
            where: {
                userId,
                name: chatName,
            },
            include: {
                chatSources: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });
        if (!chat) {
            chat = await prisma.chat.create({
                data: {
                    userId,
                    name: chatName,
                    status: "READY",
                    rocketchatScopeKey: scopeKey,
                    rocketchatWorkspaceId: ws,
                    rocketchatRoomId: rm,
                    rocketchatThreadId: th,
                },
                include: {
                    chatSources: true,
                },
            });
        }
    }

    const scopeWhere = buildChatSourceScopeWhere({
        workspaceId: ws,
        roomId: rm,
        threadId: th,
        mode: "room",
    });

    const roomSources = (await prisma.chatSource.findMany({
        where: scopeWhere,
        select: { id: true },
    })) || [];

    if (roomSources && roomSources.length > 0) {
        const existingSourceIds = new Set((chat.chatSources || []).map((s: any) => s.id));
        const toConnect = roomSources.filter((s) => !existingSourceIds.has(s.id));

        if (toConnect.length > 0) {
            chat = await prisma.chat.update({
                where: { id: chat.id },
                data: {
                    chatSources: {
                        connect: toConnect.map((source) => ({ id: source.id })),
                    },
                },
                include: {
                    chatSources: {
                        orderBy: { createdAt: "asc" },
                    },
                },
            });
        }
    }

    return chat;
}

export interface CitationSource {
    title: string;
    snippet: string;
    pageUrl: string;
    relevance: number;
}

/**
 * Normalizes backend RAG citation points or ScopedSearchResults to Rocket.Chat app CitationSource format.
 */
export function formatRocketChatCitations(sources?: any[] | null): CitationSource[] {
    if (!Array.isArray(sources)) return [];

    return sources.map((source) => {
        const payload = source.payload || source;
        const rawScore = typeof source.relevance === "number"
            ? source.relevance
            : typeof source.score === "number"
                ? source.score
                : 0;
        // Normalize relevance: if score > 1, assume 0-100 scale and divide by 100
        const relevance = rawScore > 1 ? rawScore / 100 : rawScore;

        return {
            title: payload.title || payload.heading || "Source Document",
            snippet: payload.snippet || payload.body || payload.chunkText || payload.content || "",
            pageUrl: payload.pageUrl || payload.url || "",
            relevance: Math.round(relevance * 100) / 100,
        };
    });
}
