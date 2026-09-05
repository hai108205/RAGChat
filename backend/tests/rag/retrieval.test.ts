import { describe, expect, it } from "vitest";
import { buildRagScopeFilter, searchRagV1 } from "../../rag/retrieval.js";
import { createRagScope } from "../../rag/types.js";

describe("RAG v1 retrieval", () => {
    it("builds a fail-closed room/thread filter", () => {
        expect(buildRagScopeFilter(createRagScope({ kind: "rocketchat", workspaceId: "ws", roomId: "room", threadId: "thread" }))).toEqual({
            must: [
                { key: "workspaceId", match: { value: "ws" } },
                { key: "roomId", match: { value: "room" } },
            ],
            should: [
                { key: "threadId", match: { value: "thread" } },
                { key: "threadId", match: { value: "" } },
            ],
        });
    });

    it("filters points to active manifests and preserves citation metadata", async () => {
        const result = await searchRagV1({
            query: "question",
            scope: createRagScope({ kind: "web", chatId: "chat" }),
            indexVersion: "v1",
            embeddingModel: "model",
            dimensions: 2,
            limit: 3,
        }, {
            prisma: { ragDocument: { findMany: async () => [{
                id: "doc-1", chatSourceId: "source-1", collectionName: "rag_chunks_v1_model_2",
                embeddingModel: "model", embeddingDimensions: 2, versionHash: "version-1",
                chatSource: { heading: "Doc", documentationUrl: "https://doc" },
            }] } },
            embed: async () => [1, 0],
            qdrant: { query: async (_collection, request) => {
                expect(request.filter).toBeTruthy();
                return { points: [
                    { id: "chunk-1", score: 0.9, payload: { documentId: "doc-1", body: "answer", chunkId: "chunk-1", sourceUrl: "https://doc#1" } },
                    { id: "foreign", score: 0.99, payload: { documentId: "other", body: "foreign" } },
                ] };
            } },
        });
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ snippet: "answer", pageUrl: "https://doc#1", relevance: 0.9 });
        expect(result[0].metadata).toMatchObject({ documentId: "doc-1", chunkId: "chunk-1", retrievalMode: "rag_v1" });
    });
});
