import { describe, expect, it, vi } from "vitest";

import { retrieveWebChatSources } from "../services/webChatRetrieval.service.js";

describe("retrieveWebChatSources", () => {
    it("queries a later vector-enabled source when the first source is vector-less", async () => {
        const query = vi.fn().mockResolvedValue({
            points: [{ id: "eligible-point", score: 0.8, payload: { body: "Aurora deployment" } }],
        });

        const result = await retrieveWebChatSources({
            query: "Aurora deployment",
            sources: [
                { collectionName: null, isVectorLess: true },
                { collectionName: "eligible-collection", isVectorLess: false },
            ],
            dependencies: {
                generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
                qdrant: { query },
            },
        });

        expect(query).toHaveBeenCalledWith(
            "eligible-collection",
            expect.objectContaining({ query: [0.1, 0.2] }),
        );
        expect(result.map((point) => point.id)).toEqual(["eligible-point"]);
    });

    it("queries a shared eligible collection once and returns each retrieved point once", async () => {
        const query = vi.fn().mockResolvedValue({
            points: [{ id: "shared-point", score: 0.8, payload: { body: "Aurora deployment" } }],
        });

        const result = await retrieveWebChatSources({
            query: "Aurora deployment",
            sources: [
                { collectionName: "shared-collection", isVectorLess: false },
                { collectionName: "shared-collection", isVectorLess: false },
            ],
            dependencies: {
                generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
                qdrant: { query },
            },
        });

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(
            "shared-collection",
            expect.objectContaining({ query: [0.1, 0.2] }),
        );
        expect(result.map((point) => point.id)).toEqual(["shared-point"]);
    });

    it("grounds each source before lexical reranking and RRF fusion", async () => {
        const query = vi.fn().mockImplementation(async (collectionName: string) => ({
            points:
                collectionName === "first"
                    ? [
                          { id: "approved-first", score: 0.8, payload: { body: "Aurora" } },
                          { id: "rounded-floor-trap", score: 0.495, payload: { body: "Aurora Aurora Aurora" } },
                      ]
                    : [
                          { id: "approved-second", score: 0.81, payload: { body: "Aurora Aurora" } },
                          { id: "too-far-below-best", score: 0.68, payload: { body: "Aurora Aurora Aurora Aurora" } },
                      ],
        }));

        const result = await retrieveWebChatSources({
            query: "Aurora",
            sources: [
                { collectionName: "first", isVectorLess: false },
                { collectionName: "second", isVectorLess: false },
            ],
            dependencies: {
                generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
                qdrant: { query },
            },
        });

        expect(query).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(2);
        expect(result.map((point) => point.id)).toEqual(["approved-second", "approved-first"]);
        expect(result.map((point) => point.id)).not.toContain("rounded-floor-trap");
        expect(result.map((point) => point.id)).not.toContain("too-far-below-best");
    });

    it("caps fused results at three without needing payload indexes or scroll", async () => {
        const query = vi.fn().mockResolvedValue({
            points: [
                { id: "one", score: 0.9, payload: { body: "Aurora" } },
                { id: "two", score: 0.89, payload: { body: "Aurora" } },
                { id: "three", score: 0.88, payload: { body: "Aurora" } },
            ],
        });
        const qdrant = {
            query,
            createPayloadIndex: vi.fn(),
            scroll: vi.fn(),
        };

        const result = await retrieveWebChatSources({
            query: "Aurora",
            sources: [
                { collectionName: "one", isVectorLess: false },
                { collectionName: "two", isVectorLess: false },
            ],
            dependencies: {
                generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
                qdrant,
            },
        });

        expect(result).toHaveLength(3);
        expect(qdrant.createPayloadIndex).not.toHaveBeenCalled();
        expect(qdrant.scroll).not.toHaveBeenCalled();
    });
});
