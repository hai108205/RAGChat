import { describe, expect, it } from "vitest";
import {
    createEmbeddingProfile,
    createRagScope,
    RagStageError,
} from "../../rag/types.js";

describe("RAG v1 contracts", () => {
    it("fails closed when a Rocket.Chat retrieval scope lacks a room", () => {
        expect(() => createRagScope({ kind: "rocketchat", workspaceId: "workspace-a" }))
            .toThrow(/roomId/i);
    });

    it("creates a stable embedding profile only for valid dimensions", () => {
        expect(createEmbeddingProfile("openai/text-embedding-3-small", 1536)).toEqual({
            model: "openai/text-embedding-3-small",
            dimensions: 1536,
            key: "openai-text-embedding-3-small-1536",
        });
        expect(() => createEmbeddingProfile("model", 0)).toThrow(/dimensions/i);
    });

    it("preserves stage, code, and retryability for operational failures", () => {
        const error = new RagStageError("EMBEDDING", "EMBEDDING_FAILURE", "provider timed out", true);

        expect(error).toMatchObject({
            stage: "EMBEDDING",
            code: "EMBEDDING_FAILURE",
            retryable: true,
        });
    });
});
