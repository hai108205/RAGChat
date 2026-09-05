import { describe, expect, it } from "vitest";
import {
    buildMessagesForLLM,
    estimateTokens,
    truncateToTokenBudget,
} from "../utils/contextBuilder.js";

describe("contextBuilder", () => {
    it("estimates tokens and truncates text within the requested budget", () => {
        const text = "A".repeat(400);

        expect(estimateTokens(text)).toBe(100);
        const truncated = truncateToTokenBudget(text, 10);

        expect(estimateTokens(truncated)).toBeLessThanOrEqual(10);
        expect(truncated.endsWith("...")).toBe(true);
    });

    it("assembles system context sections and keeps total prompt within budget", async () => {
        const history = Array.from({ length: 12 }, (_, index) => ({
            userPrompt: `Question ${index + 1} with some extra text`,
            llmResponse: `Answer ${index + 1} with extended explanation`,
        }));

        const messages = await buildMessagesForLLM({
            systemInstructions: "System base instructions.",
            relevantSources: [
                {
                    payload: {
                        body: "Important documentation excerpt for testing context assembly.",
                    },
                },
            ],
            memories: [{ memory: "User prefers concise answers." }],
            history,
            userPrompt: "How should I structure my project?",
            budget: {
                total: 250,
                sources: 80,
                memory: 30,
                summary: 60,
                recent: 60,
                user: 40,
            },
        });

        expect(messages[0].role).toBe("system");
        expect(messages[0].content).toContain("System base instructions.");
        expect(messages[0].content).toContain("--- DOCUMENTATION SOURCES ---");
        expect(messages[0].content).toContain("--- RELEVANT PAST USER FACTS ---");
        expect(messages[messages.length - 1].role).toBe("user");
        expect(messages[messages.length - 1].content).toContain("How should I structure my project?");

        const totalTokens = messages.reduce(
            (sum, message) => sum + estimateTokens(message.content),
            0,
        );
        expect(totalTokens).toBeLessThanOrEqual(250);
    });

    it("builds deterministic, source-labelled context and removes duplicate v1 chunks", async () => {
        const messages = await buildMessagesForLLM({
            systemInstructions: "Ground answers in the context.",
            relevantSources: [
                {
                    score: 0.6,
                    payload: {
                        chunk_id: "second",
                        title: "Second document",
                        url: "https://example.test/second",
                        body: "Second excerpt.",
                    },
                },
                {
                    score: 0.9,
                    payload: {
                        chunk_id: "first",
                        title: "First document",
                        url: "https://example.test/first",
                        page: 3,
                        body: "First excerpt.",
                    },
                },
                {
                    score: 0.8,
                    payload: {
                        chunk_id: "first",
                        title: "Duplicate",
                        body: "Duplicate excerpt.",
                    },
                },
            ],
            userPrompt: "What does the documentation say?",
            budget: { total: 200, sources: 120 },
        });

        const system = messages[0].content;
        expect(system).toContain("[1] First document (https://example.test/first) - page 3");
        expect(system).toContain("[2] Second document (https://example.test/second)");
        expect(system).not.toContain("Duplicate excerpt.");
        expect(system.indexOf("First excerpt.")).toBeLessThan(system.indexOf("Second excerpt."));
    });

    it("does not send an orphan assistant message as the start of the history window", async () => {
        const messages = await buildMessagesForLLM({
            systemInstructions: "Ground answers in the context.",
            history: [{ llmResponse: "orphan answer" }],
            userPrompt: "Current question",
        });

        expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    });
});
