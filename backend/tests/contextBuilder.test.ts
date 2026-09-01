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

    it("assembles system context sections and keeps total prompt within budget", () => {
        const history = Array.from({ length: 12 }, (_, index) => ({
            userPrompt: `Question ${index + 1} with some extra text`,
            llmResponse: `Answer ${index + 1} with extended explanation`,
        }));

        const messages = buildMessagesForLLM({
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
});
