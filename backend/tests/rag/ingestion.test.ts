import { describe, expect, it, vi } from "vitest";
import { createRagScope } from "../../rag/types.js";
import { buildRagPoints, indexRagDocumentV1, type RagChunkCandidate } from "../../rag/ingestion.js";

describe("RAG ingestion point builder", () => {
    const scope = createRagScope({ kind: "rocketchat", workspaceId: "ws", roomId: "room", threadId: "thread" });
    const chunks: RagChunkCandidate[] = [
        { content: "  Hello\r\nworld  ", locator: "page:1", metadata: { heading: "Intro" } },
        { content: "Second chunk", locator: "page:2", metadata: { page: 2 } },
    ];

    it("creates deterministic IDs and traceable payload metadata", () => {
        const first = buildRagPoints({
            sourceId: "source-1",
            sourceUrl: "https://example.test/doc",
            filename: "doc.md",
            documentType: "markdown",
            content: "Hello\nworld\n\nSecond chunk",
            embeddingModel: "text-embedding-3-small",
            dimensions: 3,
            indexVersion: "v1",
            scope,
            chunks,
            embeddings: [[1, 0, 0], [0, 1, 0]],
        });
        const second = buildRagPoints({
            sourceId: "source-1",
            sourceUrl: "https://example.test/doc",
            filename: "doc.md",
            documentType: "markdown",
            content: "Hello\nworld\n\nSecond chunk",
            embeddingModel: "text-embedding-3-small",
            dimensions: 3,
            indexVersion: "v1",
            scope,
            chunks,
            embeddings: [[1, 0, 0], [0, 1, 0]],
        });

        expect(first).toEqual(second);
        expect(first).toHaveLength(2);
        expect(first[0].id).toMatch(/^[a-f0-9]{64}$/);
        expect(first[0].payload).toMatchObject({
            sourceId: "source-1",
            documentType: "markdown",
            filename: "doc.md",
            workspaceId: "ws",
            roomId: "room",
            threadId: "thread",
            body: "Hello\nworld",
            heading: "Intro",
            chunkIndex: 0,
            locator: "page:1",
        });
    });

    it("rejects mismatched or invalid embeddings", () => {
        expect(() => buildRagPoints({
            sourceId: "source-1",
            sourceUrl: "url",
            filename: "doc",
            documentType: "text",
            content: "text",
            embeddingModel: "model",
            dimensions: 2,
            indexVersion: "v1",
            scope,
            chunks: [{ content: "text", locator: "document" }],
            embeddings: [[1]],
        })).toThrow(/dimensions/);
    });

    it("persists lexical chunks alongside vector points during v1 indexing", async () => {
        const upsertMock = vi.fn().mockResolvedValue({ id: "lex-1" });
        const createDocumentMock = vi.fn().mockResolvedValue({ id: "doc-1", collectionName: "rag_v1_model_2", versionHash: "vh" });
        const updateDocumentMock = vi.fn().mockResolvedValue({});
        const createManyChunkMock = vi.fn().mockResolvedValue({ count: 2 });
        const findUniqueMock = vi.fn().mockResolvedValue(null);

        const deps = {
            prisma: {
                ragDocument: {
                    findUnique: findUniqueMock,
                    create: createDocumentMock,
                    update: updateDocumentMock,
                },
                ragChunk: {
                    createMany: createManyChunkMock,
                },
                ragLexicalChunk: {
                    upsert: upsertMock,
                },
            },
            qdrant: {
                getCollection: vi.fn().mockResolvedValue({}),
                createCollection: vi.fn().mockResolvedValue({}),
                createPayloadIndex: vi.fn().mockResolvedValue({}),
                upsert: vi.fn().mockResolvedValue({}),
            },
        };

        const res = await indexRagDocumentV1({
            sourceId: "src-1",
            sourceUrl: "https://src",
            filename: "file.md",
            documentType: "markdown",
            content: "First line.\n\nSecond line.",
            embeddingModel: "model",
            dimensions: 2,
            indexVersion: "v1",
            scope,
            chunks: [
                { content: "First line.", locator: "line:1" },
                { content: "Second line.", locator: "line:2" },
            ],
            embeddings: [[1, 0], [0, 1]],
        }, deps);

        expect(res.alreadyIndexed).toBe(false);
        expect(upsertMock).toHaveBeenCalledTimes(2);
        expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                chatSourceId_chunkId: expect.objectContaining({
                    chatSourceId: "src-1",
                }),
            }),
            create: expect.objectContaining({
                content: "First line.",
                chatSourceId: "src-1",
            }),
        }));
    });
});
