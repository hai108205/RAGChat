import prisma from "./prismaClient.js";

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
 * Finds or creates an internal User record corresponding to a Rocket.Chat user.
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
 */
export async function getOrCreateRocketChatChat({
    userId,
    roomId,
    threadId,
    workspaceId,
}: GetOrCreateRocketChatChatInput) {
    const chatName = `RC_${workspaceId || "default"}_Room_${roomId}${threadId ? `_Thread_${threadId}` : ""}`;

    let chat = await prisma.chat.findFirst({
        where: {
            userId,
            name: chatName,
            deletedAt: null,
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
            },
            include: {
                chatSources: true,
            },
        });
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
 * Normalizes backend RAG citation points to Rocket.Chat app CitationSource format.
 */
export function formatRocketChatCitations(sources?: any[] | null): CitationSource[] {
    if (!Array.isArray(sources)) return [];

    return sources.map((source) => {
        const payload = source.payload || source;
        const score = typeof source.score === "number" ? source.score : 0;
        // Normalize relevance: if score > 1, assume 0-100 scale and divide by 100
        const relevance = score > 1 ? score / 100 : score;

        return {
            title: payload.title || payload.heading || "Source Document",
            snippet: payload.body || payload.chunkText || payload.content || "",
            pageUrl: payload.url || payload.pageUrl || "",
            relevance: Math.round(relevance * 100) / 100,
        };
    });
}
