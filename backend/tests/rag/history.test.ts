import { describe, expect, it } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { countTokensApproximately, trimHistoryForGeneration } from "../../rag/history.js";

describe("RAG conversation history", () => {
    it("counts tokens approximately according to LangChain heuristic", () => {
        expect(countTokensApproximately("")).toBe(0);
        expect(countTokensApproximately("test")).toBe(1);
        expect(countTokensApproximately("Hello, world!")).toBe(4);
        expect(countTokensApproximately(new HumanMessage("Hello, world!"))).toBe(4);
        expect(countTokensApproximately(new AIMessage({
            content: [
                { type: "text", text: "part one" },
                { type: "text", text: "part two" },
            ],
        }))).toBe(5);
        expect(countTokensApproximately([
            new HumanMessage("hello"),
            new AIMessage("world"),
        ])).toBe(4);
    });

    it("keeps a token-bounded history that starts with a human message", async () => {
        const history = await trimHistoryForGeneration([
            { role: "assistant", content: "orphan response" },
            { role: "user", content: "first question" },
            { role: "assistant", content: "first answer" },
            { role: "user", content: "second question" },
            { role: "assistant", content: "second answer" },
        ], 10);

        expect(history).toHaveLength(2);
        expect(history[0].getType()).toBe("human");
        expect(history.map((message) => message.content)).toEqual([
            "second question",
            "second answer",
        ]);
    });
});
