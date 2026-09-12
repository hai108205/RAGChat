import prisma from "../utils/prismaClient.js";
import {
    buildStatsScopeWhere,
    type RocketChatScopeFilter,
} from "../utils/rocketchatScope.js";

export interface RocketChatStatsDocument {
    id: string;
    filename: string;
    chunks_count: number;
    created_at?: string;
}

export interface RocketChatStatsResult {
    documents: RocketChatStatsDocument[];
    chats: any[];
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
}

/**
 * Retrieves knowledge base documents and usage statistics strictly scoped to
 * the caller's workspace, room, and thread.
 */
export async function getRocketChatStats(
    filter: RocketChatScopeFilter,
): Promise<RocketChatStatsResult> {
    const { sourceWhere, chatWhere } = buildStatsScopeWhere(filter);

    if (sourceWhere.id === "__NO_MATCH__" && chatWhere.id === "__NO_MATCH__") {
        return {
            documents: [],
            chats: [],
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            },
        };
    }

    const [sources, usageAggregate] = await Promise.all([
        prisma.chatSource.findMany({
            where: sourceWhere,
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                id: true,
                heading: true,
                documentationUrl: true,
                totalPages: true,
                createdAt: true,
                lastIndexedAt: true,
                _count: {
                    select: { pagesIndexed: true },
                },
            },
        }),
        prisma.usageEvents.aggregate({
            where: {
                chat: chatWhere,
            },
            _sum: {
                inputTokens: true,
                outputTokens: true,
            },
        }),
    ]);

    const documents: RocketChatStatsDocument[] = sources.map((s) => ({
        id: s.id,
        filename: s.heading || s.documentationUrl || "Document",
        chunks_count: s._count?.pagesIndexed || s.totalPages || 0,
        created_at: s.createdAt ? s.createdAt.toISOString() : undefined,
    }));

    const inputTokens = usageAggregate._sum?.inputTokens || 0;
    const outputTokens = usageAggregate._sum?.outputTokens || 0;

    return {
        documents,
        chats: [],
        usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
        },
    };
}
