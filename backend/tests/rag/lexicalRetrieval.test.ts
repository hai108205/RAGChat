import { describe, expect, it, vi } from "vitest";
import {
    searchLexical,
    fuseRankingsRrf,
    extractExcerpt,
} from "../../rag/lexicalRetrieval.js";
import { createRagScope } from "../../rag/types.js";

describe("Lexical Retrieval Service", () => {
    describe("extractExcerpt", () => {
        it("extracts a bounded excerpt around query terms", () => {
            const content = "Introduction. Rocket.Chat supports federated matrix bridging for secure chat. Conclusion.";
            const excerpt = extractExcerpt(content, "matrix bridging", 40);
            expect(excerpt.toLowerCase()).toContain("matrix bridging");
            expect(excerpt.length).toBeLessThanOrEqual(50); // with potential ellipsis
        });

        it("falls back to the beginning of content when terms are not found", () => {
            const content = "Short content.";
            const excerpt = extractExcerpt(content, "nonexistent", 100);
            expect(excerpt).toBe("Short content.");
        });
    });

    describe("searchLexical", () => {
        it("returns empty result safely for blank or operator-only queries without DB error", async () => {
            const queryRawMock = vi.fn();
            const prisma = { $queryRaw: queryRawMock };

            const emptyQuery = await searchLexical({
                query: "   ",
                scope: createRagScope({ kind: "rocketchat", workspaceId: "ws-1", roomId: "room-1" }),
                limit: 5,
            }, { prisma });
            expect(emptyQuery).toEqual([]);
            expect(queryRawMock).not.toHaveBeenCalled();

            const operatorOnlyQuery = await searchLexical({
                query: "&& || ! ( ) : *",
                scope: createRagScope({ kind: "rocketchat", workspaceId: "ws-1", roomId: "room-1" }),
                limit: 5,
            }, { prisma });
            expect(operatorOnlyQuery).toEqual([]);
        });

        it("executes scoped query and filters strictly to room and workspace", async () => {
            const mockRows = [
                {
                    chunkId: "c1",
                    chatSourceId: "source-1",
                    content: "PostgreSQL full text search and lexical retrieval guide",
                    locator: "section-1",
                    heading: "FTS Guide",
                    pageUrl: "https://docs.local/fts",
                    documentId: "doc-1",
                    versionHash: "ver-1",
                    rankScore: 0.85,
                    workspaceId: "ws-1",
                    roomId: "room-1",
                },
            ];

            const queryRawMock = vi.fn().mockResolvedValue(mockRows);
            const prisma = { $queryRaw: queryRawMock };

            const results = await searchLexical({
                query: "lexical retrieval",
                scope: createRagScope({ kind: "rocketchat", workspaceId: "ws-1", roomId: "room-1" }),
                limit: 5,
            }, { prisma });

            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                title: "FTS Guide",
                pageUrl: "https://docs.local/fts",
                relevance: 0.85,
                metadata: {
                    retrievalMode: "lexical",
                    sourceId: "source-1",
                    chunkId: "c1",
                    documentId: "doc-1",
                    versionHash: "ver-1",
                },
            });
            expect(results[0].snippet).toContain("lexical retrieval");
        });

        it("filters out superseded or inactive document versions for a source", async () => {
            // Suppose the DB query or filter returns active document versions only
            const mockRows = [
                {
                    chunkId: "c-active",
                    chatSourceId: "source-1",
                    content: "Active version content for search",
                    locator: "active-locator",
                    heading: "Doc",
                    pageUrl: "https://doc",
                    documentId: "doc-active",
                    versionHash: "v2",
                    documentStatus: "ACTIVE",
                    rankScore: 0.9,
                },
                {
                    chunkId: "c-superseded",
                    chatSourceId: "source-1",
                    content: "Superseded obsolete version content",
                    locator: "old-locator",
                    heading: "Doc",
                    pageUrl: "https://doc",
                    documentId: "doc-old",
                    versionHash: "v1",
                    documentStatus: "SUPERSEDED",
                    rankScore: 0.95,
                },
            ];

            const queryRawMock = vi.fn().mockResolvedValue(mockRows);
            const prisma = { $queryRaw: queryRawMock };

            const results = await searchLexical({
                query: "version content",
                scope: createRagScope({ kind: "rocketchat", workspaceId: "ws-1", roomId: "room-1" }),
                limit: 5,
            }, { prisma });

            expect(results).toHaveLength(1);
            expect(results[0].metadata.chunkId).toBe("c-active");
        });
    });

    describe("fuseRankingsRrf", () => {
        it("fuses dense and lexical rankings with k=60 and breaks ties deterministically", () => {
            const denseResults = [
                {
                    title: "Doc A",
                    snippet: "Dense A",
                    pageUrl: "https://a",
                    relevance: 0.95,
                    metadata: { chunkId: "chunk-a", sourceId: "source-1" },
                },
                {
                    title: "Doc B",
                    snippet: "Dense B",
                    pageUrl: "https://b",
                    relevance: 0.85,
                    metadata: { chunkId: "chunk-b", sourceId: "source-1" },
                },
            ];

            const lexicalResults = [
                {
                    title: "Doc B",
                    snippet: "Lexical B",
                    pageUrl: "https://b",
                    relevance: 0.9,
                    metadata: { chunkId: "chunk-b", sourceId: "source-1" },
                },
                {
                    title: "Doc C",
                    snippet: "Lexical C",
                    pageUrl: "https://c",
                    relevance: 0.7,
                    metadata: { chunkId: "chunk-c", sourceId: "source-2" },
                },
            ];

            const fused = fuseRankingsRrf(denseResults, lexicalResults, { k: 60, topK: 3 });

            // Doc B appears in both dense (rank 1) and lexical (rank 0)
            // Score for B = 1/(60+1+1) + 1/(60+0+1) = 1/62 + 1/61 ≈ 0.016129 + 0.016393 ≈ 0.03252
            // Score for A = 1/(60+0+1) = 1/61 ≈ 0.016393
            // Score for C = 1/(60+1+1) = 1/62 ≈ 0.016129
            // Hence Doc B must rank #1
            expect(fused[0].metadata.chunkId).toBe("chunk-b");
            expect(fused[1].metadata.chunkId).toBe("chunk-a");
            expect(fused[2].metadata.chunkId).toBe("chunk-c");
            expect(fused).toHaveLength(3);
        });

        it("breaks score ties by chunkId lexicographical order", () => {
            const denseResults = [
                {
                    title: "Z Chunk",
                    snippet: "Z",
                    pageUrl: "",
                    relevance: 0.9,
                    metadata: { chunkId: "chunk-z", sourceId: "source-1" },
                },
            ];
            const lexicalResults = [
                {
                    title: "A Chunk",
                    snippet: "A",
                    pageUrl: "",
                    relevance: 0.9,
                    metadata: { chunkId: "chunk-a", sourceId: "source-1" },
                },
            ];

            // Both have rank 0 in their single-element list:
            // Score for Z = 1/61
            // Score for A = 1/61
            // Tie breaker chunk-a < chunk-z -> A Chunk should come first
            const fused = fuseRankingsRrf(denseResults, lexicalResults, { k: 60, topK: 2 });
            expect(fused[0].metadata.chunkId).toBe("chunk-a");
            expect(fused[1].metadata.chunkId).toBe("chunk-z");
        });
    });
});
