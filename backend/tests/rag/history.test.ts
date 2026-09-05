import { describe, expect, it } from "vitest";
import { trimHistoryForGeneration } from "../../rag/history.js";

describe("RAG conversation history", () => {
    it("keeps a token-bounded history that starts with a human message", async () => {
        const history = await trimHistoryForGeneration([
            { role: "assistant", content: "orphan response" },
            { role: "user", content: "first question" },
            { role: "assistant", content: "first answer" },
            { role: "user", content: "second question" },
            { role: "assistant", content: "second answer" },
        ], 5);

        expect(history).toHaveLength(2);
        expect(history[0].getType()).toBe("human");
        expect(history.map((message) => message.content)).toEqual([
            "second question",
            "second answer",
        ]);
    });
});
