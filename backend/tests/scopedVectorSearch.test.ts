import { describe, it, expect, vi, beforeEach } from "vitest";

const {
    chatSourceFindManyMock,
    documentPageFindManyMock,
    qdrantQueryMock,
    qdrantSearchMock,
    generateVectorEmbeddingsMock,
} = vi.hoisted(() => ({
    chatSourceFindManyMock: vi.fn(),
    documentPageFindManyMock: vi.fn(),
    qdrantQueryMock: vi.fn(),
    qdrantSearchMock: vi.fn(),
    generateVectorEmbeddingsMock: vi.fn(),
}));

vi.mock("../utils/prismaClient.js", () => ({
    default: {
        chatSource: {
            findMany: (...args: any[]) => chatSourceFindManyMock(...args),
        },
        documentPage: {
            findMany: (...args: any[]) => documentPageFindManyMock(...args),
        },
    },
}));

vi.mock("../utils/ragClients.js", () => ({
    qdrant: {
        query: (...args: any[]) => qdrantQueryMock(...args),
        search: (...args: any[]) => qdrantSearchMock(...args),
    },
}));

vi.mock("../utils/ragUtilities.js", async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return {
        ...actual,
        generateVectorEmbeddings: (...args: any[]) => generateVectorEmbeddingsMock(...args),
    };
});

const {
    scopedVectorSearch,
    normalizeRelevanceScore,
    deduplicateAndRankResults,
    executeKeywordFallback,
} = await import("../services/scopedVectorSearch.js");

describe("scopedVectorSearch Service", () => {
    beforeEach(() => {
        chatSourceFindManyMock.mockReset();
        documentPageFindManyMock.mockReset();
        qdrantQueryMock.mockReset();
        qdrantSearchMock.mockReset();
        generateVectorEmbeddingsMock.mockReset().mockResolvedValue([new Array(1536).fill(0.05)]);
    });

    describe("Relevance score normalization", () => {
        it("normalizes scores between 0 and 1 with 2 decimal precision", () => {
            expect(normalizeRelevanceScore(0.8542)).toBe(0.85);
            expect(normalizeRelevanceScore(0.8567)).toBe(0.86);
            expect(normalizeRelevanceScore(1.0)).toBe(1.0);
            expect(normalizeRelevanceScore(0.0)).toBe(0.0);
        });

        it("normalizes 0-100 percentage scores to 0-1 scale", () => {
            expect(normalizeRelevanceScore(95.0)).toBe(0.95);
            expect(normalizeRelevanceScore(80.5)).toBe(0.81);
        });

        it("clamps out-of-range and invalid scores safely", () => {
            expect(normalizeRelevanceScore(-0.5)).toBe(0);
            expect(normalizeRelevanceScore(150)).toBe(1);
            expect(normalizeRelevanceScore(NaN)).toBe(0);
            expect(normalizeRelevanceScore(null)).toBe(0);
            expect(normalizeRelevanceScore(undefined)).toBe(0);
            expect(normalizeRelevanceScore("invalid")).toBe(0);
        });
    });

    describe("Deduplication and ranking", () => {
        it("sorts results by relevance descending and deduplicates by title + snippet prefix", () => {
            const results = [
                {
                    title: "Doc B",
                    snippet: "Content of B",
                    pageUrl: "https://example.com/b",
                    relevance: 0.7,
                    metadata: {},
                },
                {
                    title: "Doc A",
                    snippet: "Content of A that is long",
                    pageUrl: "https://example.com/a1",
                    relevance: 0.95,
                    metadata: {},
                },
                {
                    title: "Doc A",
                    snippet: "Content of A that is long and slightly more text",
                    pageUrl: "https://example.com/a2",
                    relevance: 0.85,
                    metadata: {},
                },
            ];

            const ranked = deduplicateAndRankResults(results, 5);
            expect(ranked).toHaveLength(2);
            expect(ranked[0].title).toBe("Doc A");
            expect(ranked[0].relevance).toBe(0.95);
            expect(ranked[1].title).toBe("Doc B");
            expect(ranked[1].relevance).toBe(0.7);
        });

        it("slices results to limit", () => {
            const results = Array.from({ length: 10 }, (_, i) => ({
                title: `Doc ${i}`,
                snippet: `Snippet ${i}`,
                pageUrl: `https://example.com/${i}`,
                relevance: 0.5 + i * 0.04,
                metadata: {},
            }));

            const ranked = deduplicateAndRankResults(results, 3);
            expect(ranked).toHaveLength(3);
            expect(ranked[0].relevance).toBeGreaterThanOrEqual(ranked[1].relevance);
        });
    });

    describe("Input validation & scope safety", () => {
        it("returns empty array immediately if query is empty or whitespace", async () => {
            const res1 = await scopedVectorSearch({ query: "" });
            const res2 = await scopedVectorSearch({ query: "   \n\t  " });

            expect(res1).toEqual([]);
            expect(res2).toEqual([]);
            expect(chatSourceFindManyMock).not.toHaveBeenCalled();
        });

        it("returns empty array in room mode if roomId is missing", async () => {
            const res = await scopedVectorSearch({
                query: "how to deploy",
                workspaceId: "ws-1",
                mode: "room",
            });

            expect(res).toEqual([]);
            expect(chatSourceFindManyMock).not.toHaveBeenCalled();
        });

        it("accepts nested scope object parameter", async () => {
            chatSourceFindManyMock.mockResolvedValue([]);
            documentPageFindManyMock.mockResolvedValue([]);

            await scopedVectorSearch({
                query: "deploy",
                scope: {
                    workspaceId: "ws-1",
                    roomId: "GENERAL",
                    threadId: "th-42",
                },
            });

            expect(chatSourceFindManyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        AND: expect.arrayContaining([
                            expect.objectContaining({
                                OR: expect.arrayContaining([
                                    expect.objectContaining({
                                        rocketchatWorkspaceId: "ws-1",
                                        rocketchatRoomId: "GENERAL",
                                    }),
                                ]),
                            }),
                        ]),
                    }),
                }),
            );
        });
    });

    describe("Model grouping and single embedding generation", () => {
        it("applies raw-score grounding within each embedding group before merging and caps the final output at three", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "small-source",
                    heading: "Small embeddings",
                    documentationUrl: "https://docs/small",
                    collectionName: "small-collection",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
                {
                    id: "large-source",
                    heading: "Large embeddings",
                    documentationUrl: "https://docs/large",
                    collectionName: "large-collection",
                    embeddingModel: "openai/text-embedding-3-large",
                    embeddingDimensions: 3072,
                },
            ]);

            qdrantQueryMock.mockImplementation(async (collectionName: string) => ({
                points:
                    collectionName === "small-collection"
                        ? [
                              { score: 0.805, payload: { title: "Small best", snippet: "Supported" } },
                              { score: 0.685, payload: { title: "Small boundary", snippet: "Supported" } },
                              { score: 0.495, payload: { title: "Rounded floor trap", snippet: "Unsupported" } },
                          ]
                        : [
                              { score: 0.806, payload: { title: "Large best", snippet: "Supported" } },
                              { score: 0.686, payload: { title: "Large boundary", snippet: "Supported" } },
                              { score: 0.675, payload: { title: "Large gap reject", snippet: "Unsupported" } },
                          ],
            }));

            const results = await scopedVectorSearch({
                query: "grounded query",
                workspaceId: "default",
                roomId: "GENERAL",
                topK: 10,
                minScore: 0,
            });

            expect(results.map((result) => result.title)).toEqual([
                "Large best",
                "Small best",
                "Large boundary",
            ]);
            expect(results).toHaveLength(3);
            expect(results.map((result) => result.metadata.rawScore)).not.toContain(0.495);
            expect(results.map((result) => result.metadata.rawScore)).not.toContain(0.675);
        });

        it("groups sources by (embeddingModel, embeddingDimensions) and generates embeddings once per group", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "src-1",
                    heading: "Guide 1",
                    documentationUrl: "https://docs/1",
                    collectionName: "col-small-1",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
                {
                    id: "src-2",
                    heading: "Guide 2",
                    documentationUrl: "https://docs/2",
                    collectionName: "col-small-2",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
                {
                    id: "src-3",
                    heading: "Guide 3",
                    documentationUrl: "https://docs/3",
                    collectionName: "col-large-1",
                    embeddingModel: "openai/text-embedding-3-large",
                    embeddingDimensions: 3072,
                },
            ]);

            qdrantQueryMock.mockResolvedValue({
                points: [
                    {
                        id: "p-1",
                        score: 0.9,
                        payload: { title: "Result 1", snippet: "Text 1", url: "https://docs/1" },
                    },
                ],
            });

            const results = await scopedVectorSearch({
                query: "kubernetes setup",
                workspaceId: "default",
                roomId: "GENERAL",
            });

            // 2 distinct groups: (small, 1536) and (large, 3072)
            expect(generateVectorEmbeddingsMock).toHaveBeenCalledTimes(2);
            expect(generateVectorEmbeddingsMock).toHaveBeenCalledWith(
                "kubernetes setup",
                expect.objectContaining({ model: "openai/text-embedding-3-small", dimensions: 1536 }),
            );
            expect(generateVectorEmbeddingsMock).toHaveBeenCalledWith(
                "kubernetes setup",
                expect.objectContaining({ model: "openai/text-embedding-3-large", dimensions: 3072 }),
            );

            expect(results.length).toBeGreaterThan(0);
        });

        it("deduplicates collection queries when multiple sources share the same collection name", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "src-1",
                    heading: "Guide 1",
                    documentationUrl: "https://docs/1",
                    collectionName: "col-shared",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
                {
                    id: "src-2",
                    heading: "Guide 2",
                    documentationUrl: "https://docs/2",
                    collectionName: "col-shared",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
            ]);

            qdrantQueryMock.mockResolvedValue({
                points: [
                    {
                        id: "pt-shared",
                        score: 0.88,
                        payload: { title: "Shared Doc", snippet: "Doc snippet", url: "https://docs/shared" },
                    },
                ],
            });

            await scopedVectorSearch({
                query: "shared collection test",
                workspaceId: "default",
                roomId: "GENERAL",
            });

            // Should query Qdrant col-shared only once despite 2 sources sharing it
            expect(qdrantQueryMock).toHaveBeenCalledTimes(1);
            expect(qdrantQueryMock).toHaveBeenCalledWith("col-shared", expect.anything());
        });
    });

    describe("Qdrant error handling & Fallback", () => {
        it("returns keyword fallback results when Qdrant fails but keyword search succeeds", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "src-1",
                    heading: "Architecture Docs",
                    documentationUrl: "https://docs/arch",
                    collectionName: "col-failing",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
            ]);

            // Qdrant fails
            qdrantQueryMock.mockRejectedValue(new Error("Connection to Qdrant failed: timeout"));

            // Keyword fallback in PostgreSQL succeeds
            documentPageFindManyMock.mockResolvedValue([
                {
                    id: "page-1",
                    heading: "Architecture Overview",
                    pageUrl: "https://docs/arch/overview",
                    chatSourceId: "src-1",
                    chatSource: { id: "src-1", heading: "Architecture Docs", documentationUrl: "https://docs/arch" },
                },
            ]);

            const results = await scopedVectorSearch({
                query: "architecture",
                workspaceId: "default",
                roomId: "GENERAL",
            });

            expect(results).toHaveLength(1);
            expect(results[0].title).toBe("Architecture Overview");
            expect(results[0].metadata.retrievalMode).toBe("keyword_fallback");
        });

        it("throws QDRANT_UNAVAILABLE error with 503 status when Qdrant fails and no keyword fallback matches", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "src-1",
                    heading: "Offline Docs",
                    documentationUrl: "https://docs/offline",
                    collectionName: "col-offline",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
            ]);

            // Qdrant fails
            qdrantQueryMock.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:6333"));
            // Keyword fallback returns no matches
            documentPageFindManyMock.mockResolvedValue([]);

            await expect(
                scopedVectorSearch({
                    query: "offline docs query",
                    workspaceId: "default",
                    roomId: "GENERAL",
                }),
            ).rejects.toMatchObject({
                code: "QDRANT_UNAVAILABLE",
                statusCode: 503,
            });
        });

        it("throws immediately with QDRANT_UNAVAILABLE when throwOnQdrantError is true", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "src-1",
                    heading: "Docs",
                    documentationUrl: "https://docs/1",
                    collectionName: "col-1",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
            ]);

            qdrantQueryMock.mockRejectedValue(new Error("Qdrant rate limit"));

            await expect(
                scopedVectorSearch({
                    query: "test query",
                    workspaceId: "default",
                    roomId: "GENERAL",
                    throwOnQdrantError: true,
                }),
            ).rejects.toMatchObject({
                code: "QDRANT_UNAVAILABLE",
                statusCode: 503,
            });

            // Keyword fallback should NOT be called when throwOnQdrantError is true
            expect(documentPageFindManyMock).not.toHaveBeenCalled();
        });

        it("falls back to keyword search when no vectorized sources exist in scope", async () => {
            chatSourceFindManyMock.mockResolvedValue([]); // No collections in scope

            documentPageFindManyMock.mockResolvedValue([
                {
                    id: "page-kw-1",
                    heading: "Getting Started",
                    pageUrl: "https://docs/started",
                    chatSourceId: "src-kw",
                    chatSource: { id: "src-kw", heading: "Intro Docs", documentationUrl: "https://docs/intro" },
                },
            ]);

            const results = await scopedVectorSearch({
                query: "getting started",
                workspaceId: "default",
                roomId: "GENERAL",
            });

            expect(results).toHaveLength(1);
            expect(results[0].title).toBe("Getting Started");
            expect(results[0].metadata.retrievalMode).toBe("keyword_fallback");
        });

        it("returns empty array cleanly when Qdrant succeeds but finds no matching points and fallback is empty", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "src-1",
                    heading: "Docs",
                    documentationUrl: "https://docs/1",
                    collectionName: "col-1",
                    embeddingModel: "openai/text-embedding-3-small",
                    embeddingDimensions: 1536,
                },
            ]);

            // Qdrant succeeds cleanly, returning empty points
            qdrantQueryMock.mockResolvedValue({ points: [] });
            documentPageFindManyMock.mockResolvedValue([]);

            const results = await scopedVectorSearch({
                query: "non-existent topic",
                workspaceId: "default",
                roomId: "GENERAL",
            });

            expect(results).toEqual([]);
        });
    });
});
