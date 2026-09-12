import { describe, expect, it } from "vitest";
import { ensureRagCollection, getRagCollectionName } from "../../rag/qdrantIndex.service.js";

describe("RAG Qdrant index naming", () => {
    it("uses an immutable collection name for one index and embedding profile", () => {
        expect(getRagCollectionName("v1", "openai/text-embedding-3-small", 1536))
            .toBe("rag_chunks_v1_openai_text_embedding_3_small_1536");
    });
});

it("creates a profile collection and its filter indexes only when absent", async () => {
    const calls: string[] = [];
    const client = {
        getCollection: async () => { throw new Error("not found"); },
        createCollection: async () => { calls.push("create"); },
        createPayloadIndex: async (_name: string, body: { field_name: string }) => { calls.push(body.field_name); },
    };
    await ensureRagCollection(client, "rag_chunks_v1_openai_1536", 1536);
    expect(calls).toEqual(["create", "chatId", "workspaceId", "roomId", "threadId", "documentId"]);
});
