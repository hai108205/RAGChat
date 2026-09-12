export interface LexicalChunkInput {
    readonly chatSourceId: string;
    readonly chunkId: string;
    readonly chunkIndex: number;
    readonly content: string;
    readonly contentHash?: string;
    readonly locator?: string;
    readonly heading?: string;
    readonly pageUrl?: string;
    readonly documentId?: string;
    readonly versionHash?: string;
    readonly metadata?: Record<string, unknown>;
}

export interface LexicalChunksDependencies {
    readonly prisma: {
        readonly ragLexicalChunk: {
            readonly upsert?: (args: any) => Promise<any>;
            readonly deleteMany?: (args: any) => Promise<{ count: number }>;
            readonly count?: (args: any) => Promise<number>;
        };
    };
}

export async function upsertLexicalChunks(
    chunks: readonly LexicalChunkInput[],
    deps: LexicalChunksDependencies,
): Promise<{ count: number }> {
    if (typeof deps.prisma.ragLexicalChunk.upsert !== "function") {
        throw new Error("prisma.ragLexicalChunk.upsert is required for upsertLexicalChunks");
    }
    for (const chunk of chunks) {
        if (!chunk.chatSourceId?.trim()) {
            throw new Error("chatSourceId is required for lexical chunk");
        }
        if (!chunk.chunkId?.trim()) {
            throw new Error("chunkId is required for lexical chunk");
        }
        if (!chunk.content?.trim()) {
            throw new Error("content cannot be empty for lexical chunk");
        }
    }

    let written = 0;
    for (const chunk of chunks) {
        const chatSourceId = chunk.chatSourceId.trim();
        const chunkId = chunk.chunkId.trim();
        const content = chunk.content.trim();
        const contentHash = chunk.contentHash?.trim() || "";
        const locator = chunk.locator?.trim() || "";
        const heading = chunk.heading?.trim() || null;
        const pageUrl = chunk.pageUrl?.trim() || null;
        const documentId = chunk.documentId?.trim() || null;
        const versionHash = chunk.versionHash?.trim() || null;
        const metadata = chunk.metadata ?? {};

        await deps.prisma.ragLexicalChunk.upsert({
            where: {
                chatSourceId_chunkId: {
                    chatSourceId,
                    chunkId,
                },
            },
            create: {
                chatSourceId,
                chunkId,
                chunkIndex: chunk.chunkIndex,
                content,
                contentHash,
                locator,
                heading,
                pageUrl,
                documentId,
                versionHash,
                metadata,
            },
            update: {
                chunkIndex: chunk.chunkIndex,
                content,
                contentHash,
                locator,
                heading,
                pageUrl,
                documentId,
                versionHash,
                metadata,
            },
        });
        written++;
    }

    return { count: written };
}

export async function deleteLexicalChunksForSource(
    chatSourceId: string,
    deps: LexicalChunksDependencies,
): Promise<{ count: number }> {
    const id = chatSourceId.trim();
    if (!id) {
        return { count: 0 };
    }
    if (deps.prisma.ragLexicalChunk.deleteMany) {
        return deps.prisma.ragLexicalChunk.deleteMany({
            where: { chatSourceId: id },
        });
    }
    return { count: 0 };
}
