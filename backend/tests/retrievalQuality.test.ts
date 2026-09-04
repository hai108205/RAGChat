import { describe, expect, it } from "vitest";

import {
    extractNormalizedQueryTerms,
    isVectorEligibleSource,
    normalizedTermFrequency,
    rerankCandidatesByTermFrequency,
    selectGroundedCandidates,
} from "../utils/retrievalQuality.js";

describe("retrieval quality utilities", () => {
    it("selects only valid raw cosine candidates within the inclusive quality window", () => {
        const candidates = [
            { id: "best", score: 0.8 },
            { id: "gap-boundary", score: 0.68 },
            { id: "gap-too-wide", score: 0.679 },
            { id: "rounding-trap", score: 0.495 },
            { id: "negative", score: -0.3 },
            { id: "not-a-number", score: Number.NaN },
            { id: "infinite", score: Number.POSITIVE_INFINITY },
            { id: "string", score: "0.99" },
        ];

        expect(selectGroundedCandidates(candidates).map((candidate) => candidate.id)).toEqual([
            "best",
            "gap-boundary",
        ]);
    });

    it("clamps finite cosine scores before comparing them", () => {
        expect(
            selectGroundedCandidates([
                { id: "clamped-high", score: 1.2 },
                { id: "near-high", score: 0.89 },
            ]).map((candidate) => candidate.id),
        ).toEqual(["clamped-high", "near-high"]);
    });

    it("caps grounded candidates at three in descending unrounded score order", () => {
        const candidates = [
            { id: "third", score: 0.86 },
            { id: "first", score: 0.91 },
            { id: "fourth", score: 0.85 },
            { id: "second", score: 0.88 },
        ];

        expect(selectGroundedCandidates(candidates).map((candidate) => candidate.id)).toEqual([
            "first",
            "second",
            "third",
        ]);
    });

    it("normalizes NFC and NFD query and chunk text before scoring terms", () => {
        const terms = extractNormalizedQueryTerms("CA\u0300 phe\u0302");

        expect(terms).toEqual(["cà", "phê"]);
        expect(normalizedTermFrequency("Cà phê ngon; cà phê đá.", terms)).toBe(4);
    });

    it("does not treat empty terms as arbitrary chunk matches", () => {
        expect(extractNormalizedQueryTerms("... ---")).toEqual([]);
        expect(normalizedTermFrequency("Aurora documentation", [""])).toBe(0);
        expect(normalizedTermFrequency("Aurora documentation", [])).toBe(0);
    });

    it("reranks only the supplied candidates by normalized term frequency", () => {
        const suppliedCandidates = [
            { id: "aurora-once", payload: { body: "Aurora deployment guide" } },
            { id: "aurora-twice", payload: { body: "Aurora Aurora troubleshooting" } },
        ];

        const reranked = rerankCandidatesByTermFrequency(
            suppliedCandidates,
            extractNormalizedQueryTerms("aurora"),
            (candidate) => candidate.payload.body,
        );

        expect(reranked.map((candidate) => candidate.id)).toEqual(["aurora-twice", "aurora-once"]);
        expect(reranked).toHaveLength(suppliedCandidates.length);
        expect(reranked.every((candidate) => suppliedCandidates.includes(candidate))).toBe(true);
    });

    it("identifies only vector-enabled sources with a usable collection", () => {
        expect(isVectorEligibleSource({ collectionName: "knowledge-base", isVectorLess: false })).toBe(true);
        expect(isVectorEligibleSource({ collectionName: "knowledge-base", isVectorLess: true })).toBe(false);
        expect(isVectorEligibleSource({ collectionName: "   ", isVectorLess: false })).toBe(false);
        expect(isVectorEligibleSource({ collectionName: null, isVectorLess: false })).toBe(false);
    });
});
