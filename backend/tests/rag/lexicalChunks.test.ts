import { describe, expect, it, vi } from "vitest";
import {
    upsertLexicalChunks,
    deleteLexicalChunksForSource,
    type LexicalChunkInput,
} from "../../rag/lexicalChunks.js";

describe("Lexical Chunks Persistence", () => {
    it("validates that required chunk fields are non-empty", async () => {
        const prisma = {
            ragLexicalChunk: {
                upsert: vi.fn(),
            },
        };

        await expect(
            upsertLexicalChunks([
                {
                    chatSourceId: "",
                    chunkId: "c1",
                    chunkIndex: 0,
                    content: "hello",
                },
            ], { prisma }),
        ).rejects.toThrow(/chatSourceId/i);

        await expect(
            upsertLexicalChunks([
                {
                    chatSourceId: "s1",
                    chunkId: "",
                    chunkIndex: 0,
                    content: "hello",
                },
            ], { prisma }),
        ).rejects.toThrow(/chunkId/i);

        await expect(
            upsertLexicalChunks([
                {
                    chatSourceId: "s1",
                    chunkId: "c1",
                    chunkIndex: 0,
                    content: "   ",
                },
            ], { prisma }),
        ).rejects.toThrow(/content/i);
    });

    it("idempotently upserts chunks keyed by source and chunkId", async () => {
        const upsertMock = vi.fn().mockResolvedValue({ id: "rec-1" });
        const prisma = {
            ragLexicalChunk: {
                upsert: upsertMock,
            },
        };

        const chunks: LexicalChunkInput[] = [
            {
                chatSourceId: "source-1",
                chunkId: "chunk-101",
                chunkIndex: 0,
                content: "Rocket.Chat workspace configuration details",
                contentHash: "hash-101",
                locator: "page:1#para:0",
                heading: "Workspace Setup",
                pageUrl: "https://docs.rocket.chat/setup",
                documentId: "doc-v1",
                versionHash: "ver-1",
                metadata: { section: "admin" },
            },
        ];

        const result = await upsertLexicalChunks(chunks, { prisma });
        expect(result.count).toBe(1);
        expect(upsertMock).toHaveBeenCalledWith({
            where: {
                chatSourceId_chunkId: {
                    chatSourceId: "source-1",
                    chunkId: "chunk-101",
                },
            },
            create: expect.objectContaining({
                chatSourceId: "source-1",
                chunkId: "chunk-101",
                content: "Rocket.Chat workspace configuration details",
                locator: "page:1#para:0",
            }),
            update: expect.objectContaining({
                content: "Rocket.Chat workspace configuration details",
                locator: "page:1#para:0",
            }),
        });
    });

    it("supports deleting all lexical chunks for a given chatSourceId", async () => {
        const deleteManyMock = vi.fn().mockResolvedValue({ count: 5 });
        const prisma = {
            ragLexicalChunk: {
                deleteMany: deleteManyMock,
            },
        };

        const res = await deleteLexicalChunksForSource("source-123", { prisma });
        expect(res.count).toBe(5);
        expect(deleteManyMock).toHaveBeenCalledWith({
            where: { chatSourceId: "source-123" },
        });
    });
});
