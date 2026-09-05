export function getRagCollectionName(indexVersion: string, embeddingModel: string, dimensions: number): string {
    const version = indexVersion.trim().replace(/[^a-zA-Z0-9_]+/g, "_");
    const model = embeddingModel.trim().replace(/[^a-zA-Z0-9]+/g, "_");
    if (!version || !model || !Number.isInteger(dimensions) || dimensions < 1) {
        throw new Error("A valid index version, embedding model, and dimensions are required");
    }
    return `rag_chunks_${version}_${model}_${dimensions}`.toLowerCase();
}

interface QdrantIndexClient {
    getCollection(name: string): Promise<unknown>;
    createCollection(name: string, config: { vectors: { size: number; distance: "Cosine" } }): Promise<unknown>;
    createPayloadIndex(name: string, config: { field_name: string; field_schema: "keyword" }): Promise<unknown>;
}

const FILTER_FIELDS = ["chatId", "workspaceId", "roomId", "threadId", "documentId"] as const;

export async function ensureRagCollection(client: QdrantIndexClient, name: string, dimensions: number): Promise<void> {
    try {
        await client.getCollection(name);
        return;
    } catch {
        await client.createCollection(name, { vectors: { size: dimensions, distance: "Cosine" } });
    }
    for (const field_name of FILTER_FIELDS) {
        await client.createPayloadIndex(name, { field_name, field_schema: "keyword" });
    }
}
