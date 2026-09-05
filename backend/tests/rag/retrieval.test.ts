import { describe, expect, it } from "vitest";
import { buildRagScopeFilter, resolveLegacyReadDecision, searchRagV1 } from "../../rag/retrieval.js";
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

    it("excludes superseded active manifests for the same source during a re-index", async () => {
        const result = await searchRagV1({
            query: "question",
            scope: createRagScope({ kind: "web", chatId: "chat" }),
            indexVersion: "v1",
            embeddingModel: "model",
            dimensions: 2,
            limit: 3,
        }, {
            // The query contract orders newest activations first.
            prisma: { ragDocument: { findMany: async () => [
                { id: "new", chatSourceId: "source-1", collectionName: "collection", embeddingModel: "model", embeddingDimensions: 2, versionHash: "new", chatSource: { heading: "New", documentationUrl: "https://new" } },
                { id: "old", chatSourceId: "source-1", collectionName: "collection", embeddingModel: "model", embeddingDimensions: 2, versionHash: "old", chatSource: { heading: "Old", documentationUrl: "https://old" } },
            ] } },
            embed: async () => [1, 0],
            qdrant: { query: async () => ({ points: [
                { id: "old-chunk", score: 0.99, payload: { documentId: "old", body: "obsolete" } },
                { id: "new-chunk", score: 0.8, payload: { documentId: "new", body: "current" } },
            ] }) },
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ snippet: "current", metadata: { documentId: "new", versionHash: "new" } });
    });

    it("allows a legacy read only for explicit migration policies", () => {
        expect(resolveLegacyReadDecision({ v1ResultCount: 2, dualReadEnabled: true, allowAvailabilityFallback: false }))
            .toEqual({ shouldReadLegacy: true, reason: "DUAL_READ" });
        expect(resolveLegacyReadDecision({ v1ResultCount: 0, dualReadEnabled: false, allowAvailabilityFallback: true }))
            .toEqual({ shouldReadLegacy: true, reason: "V1_COVERAGE_GAP" });
        expect(resolveLegacyReadDecision({ v1ResultCount: 0, dualReadEnabled: false, allowAvailabilityFallback: false }))
            .toEqual({ shouldReadLegacy: false });
    });
});
