import { describe, expect, it } from "vitest";
import { createRagScope } from "../../rag/types.js";
import { buildRagPoints, type RagChunkCandidate } from "../../rag/ingestion.js";

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
});
