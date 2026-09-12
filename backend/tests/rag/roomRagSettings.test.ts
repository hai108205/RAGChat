import { describe, expect, it } from "vitest";
import {
    ROOM_RAG_PROMPT_TOKEN_BUDGET,
    createRoomRagCapabilities,
    parseRoomRagSettings,
} from "../../rag/roomRagSettings.js";

const lexicalCapabilities = createRoomRagCapabilities({ lexicalRetrievalEnabled: true });
const semanticOnlyCapabilities = createRoomRagCapabilities({ lexicalRetrievalEnabled: false });

const validSettings = (overrides: Record<string, unknown> = {}) => ({
    searchMode: "semantic",
    topK: 5,
    threshold: 0.5,
    prompt: "Answer in concise Vietnamese.",
    ...overrides,
});

describe("room RAG settings", () => {
    it.each(["semantic", "keyword", "hybrid"] as const)("accepts the %s retrieval mode when available", (searchMode) => {
        expect(parseRoomRagSettings(validSettings({ searchMode }), lexicalCapabilities).searchMode).toBe(searchMode);
    });

    it.each([3, 5, 8, 10, 15] as const)("accepts %d as a bounded Top-K value", (topK) => {
        expect(parseRoomRagSettings(validSettings({ topK }), lexicalCapabilities).topK).toBe(topK);
    });

    it.each([0.3, 0.5, 0.6, 0.8] as const)("accepts %s as a dense threshold", (threshold) => {
        expect(parseRoomRagSettings(validSettings({ threshold }), lexicalCapabilities).threshold).toBe(threshold);
    });

    it("rejects prompts longer than 1,500 characters", () => {
        expect(() => parseRoomRagSettings(validSettings({ prompt: "a".repeat(1501) }), lexicalCapabilities))
            .toThrow(/1,500 characters/i);
    });

    it("returns an immutable instruction representation with a reserved 512-token budget", () => {
        const settings = parseRoomRagSettings(validSettings({ prompt: "a".repeat(1500) }), lexicalCapabilities);

        expect(settings.prompt).toHaveLength(1500);
        expect(settings.promptTokenBudget).toBe(ROOM_RAG_PROMPT_TOKEN_BUDGET);
        expect(settings.promptTokenBudget).toBe(512);
        expect(Object.isFrozen(settings)).toBe(true);
    });

    it("rejects unavailable lexical modes rather than falling back to semantic", () => {
        expect(() => parseRoomRagSettings(validSettings({ searchMode: "keyword" }), semanticOnlyCapabilities))
            .toThrow(/not available/i);
        expect(() => parseRoomRagSettings(validSettings({ searchMode: "hybrid" }), semanticOnlyCapabilities))
            .toThrow(/not available/i);
    });

    it("exposes an immutable, serializable capability response for authenticated callers", () => {
        expect(semanticOnlyCapabilities).toEqual({
            lexicalRetrievalEnabled: false,
            availableSearchModes: ["semantic"],
            promptMaxCharacters: 1500,
            promptTokenBudget: 512,
        });
        expect(Object.isFrozen(semanticOnlyCapabilities)).toBe(true);
        expect(Object.isFrozen(semanticOnlyCapabilities.availableSearchModes)).toBe(true);
    });

    it.each([
        validSettings({ searchMode: "anything" }),
        validSettings({ topK: 4 }),
        validSettings({ threshold: 0.7 }),
        validSettings({ prompt: 42 }),
        { ...validSettings(), unexpected: true },
        { searchMode: "semantic", topK: 5, threshold: 0.5 },
    ])("rejects tampered room settings: %j", (input) => {
        expect(() => parseRoomRagSettings(input, lexicalCapabilities)).toThrow();
    });
});
