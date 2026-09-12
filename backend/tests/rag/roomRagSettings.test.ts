import { describe, expect, it } from "vitest";
import {
    ROOM_RAG_PROMPT_TOKEN_BUDGET,
    createRoomRagCapabilities,
    estimateRoomRagPromptTokens,
    parseRoomRagSettings,
} from "../../rag/roomRagSettings.js";
import { SUPPORTED_CHAT_MODELS } from "../../rag/supportedChatModels.js";

const lexicalCapabilities = createRoomRagCapabilities({ lexicalRetrievalEnabled: true });
const semanticOnlyCapabilities = createRoomRagCapabilities({ lexicalRetrievalEnabled: false });

const validSettings = (overrides: Record<string, unknown> = {}) => ({
    searchMode: "semantic",
    topK: 5,
    similarityThreshold: 0.5,
    ...overrides,
});

describe("room RAG settings", () => {
    it.each(["semantic", "keyword", "hybrid"] as const)("accepts the %s retrieval mode when available", (searchMode) => {
        expect(parseRoomRagSettings(validSettings({ searchMode }), lexicalCapabilities).searchMode).toBe(searchMode);
    });

    it.each([3, 5, 8, 10, 15] as const)("accepts %d as a bounded Top-K value", (topK) => {
        expect(parseRoomRagSettings(validSettings({ topK }), lexicalCapabilities).topK).toBe(topK);
    });

    it.each([0.3, 0.5, 0.6, 0.8] as const)("accepts %s as a dense threshold", (similarityThreshold) => {
        expect(parseRoomRagSettings(validSettings({ similarityThreshold }), lexicalCapabilities).similarityThreshold)
            .toBe(similarityThreshold);
    });

    it("rejects system prompts longer than 1,500 characters", () => {
        expect(() => parseRoomRagSettings(validSettings({ systemPrompt: "a".repeat(1501) }), lexicalCapabilities))
            .toThrow(/1,500 characters/i);
    });

    it("returns an immutable instruction representation with a reserved 512-token budget", () => {
        const settings = parseRoomRagSettings(validSettings({ systemPrompt: "a".repeat(1500) }), lexicalCapabilities);

        expect(settings.systemPrompt).toHaveLength(ROOM_RAG_PROMPT_TOKEN_BUDGET);
        expect(estimateRoomRagPromptTokens(settings.systemPrompt || "")).toBeLessThanOrEqual(ROOM_RAG_PROMPT_TOKEN_BUDGET);
        expect(settings.promptTokenBudget).toBe(ROOM_RAG_PROMPT_TOKEN_BUDGET);
        expect(settings.promptTokenBudget).toBe(512);
        expect(Object.isFrozen(settings)).toBe(true);
    });

    it("truncates an accepted no-whitespace prompt to its conservative 512-token representation", () => {
        const sourcePrompt = "a".repeat(513);
        const settings = parseRoomRagSettings(validSettings({ systemPrompt: sourcePrompt }), lexicalCapabilities);

        expect(estimateRoomRagPromptTokens(sourcePrompt)).toBe(513);
        expect(settings.systemPrompt).toBe("a".repeat(512));
        expect(estimateRoomRagPromptTokens(settings.systemPrompt || "")).toBe(512);
    });

    it("does not let Unicode prompts without whitespace exceed the reservation", () => {
        const sourcePrompt = "你".repeat(171);
        const settings = parseRoomRagSettings(validSettings({ systemPrompt: sourcePrompt }), lexicalCapabilities);

        expect(sourcePrompt).toHaveLength(171);
        expect(estimateRoomRagPromptTokens(sourcePrompt)).toBe(513);
        expect(settings.systemPrompt).toBe("你".repeat(170));
        expect(estimateRoomRagPromptTokens(settings.systemPrompt || "")).toBe(510);
    });

    it("accepts the modal's canonical payload fields and preserves optional model and system prompt", () => {
        expect(parseRoomRagSettings(validSettings({
            model: "gpt-4o-mini",
            systemPrompt: "Respond in Vietnamese.",
        }), lexicalCapabilities)).toMatchObject({
            searchMode: "semantic",
            topK: 5,
            similarityThreshold: 0.5,
            model: "gpt-4o-mini",
            systemPrompt: "Respond in Vietnamese.",
        });
    });

    it("accepts only the canonical model identifiers offered by the modal", () => {
        expect(SUPPORTED_CHAT_MODELS).toEqual([
            "gpt-4o",
            "gpt-4o-mini",
            "claude-3-5-sonnet-20241022",
            "gemini-1.5-pro",
            "llama-3.1-70b",
        ]);
        expect(parseRoomRagSettings(validSettings({ model: "gpt-4o-mini" }), lexicalCapabilities).model)
            .toBe("gpt-4o-mini");
        expect(() => parseRoomRagSettings(validSettings({ model: "openai/gpt-4o-mini" }), lexicalCapabilities))
            .toThrow(/unsupported model/i);
    });

    it("accepts a canonical payload without optional model or system prompt", () => {
        const settings = parseRoomRagSettings(validSettings(), lexicalCapabilities);

        expect(settings).not.toHaveProperty("model");
        expect(settings).not.toHaveProperty("systemPrompt");
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
        validSettings({ similarityThreshold: 0.7 }),
        validSettings({ systemPrompt: 42 }),
        validSettings({ model: "" }),
        { ...validSettings(), threshold: 0.5 },
        { ...validSettings(), prompt: "legacy alias" },
        { ...validSettings(), unexpected: true },
        { searchMode: "semantic", topK: 5, similarityThreshold: 0.5, systemPrompt: undefined },
        { searchMode: "semantic", topK: 5 },
    ])("rejects tampered room settings: %j", (input) => {
        expect(() => parseRoomRagSettings(input, lexicalCapabilities)).toThrow();
    });
});
