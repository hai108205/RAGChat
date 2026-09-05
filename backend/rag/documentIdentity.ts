import { createHash } from "node:crypto";

function digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeDocumentContent(content: string): string {
    return content.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function createContentHash(content: string): string {
    return digest(normalizeDocumentContent(content));
}

export function createRagDocumentId(input: {
    sourceId: string;
    version: string;
    embeddingModel: string;
    dimensions: number;
}): string {
    if (!Number.isInteger(input.dimensions) || input.dimensions < 1) {
        throw new Error("Embedding dimensions must be a positive integer");
    }
    return digest([
        input.sourceId.trim(),
        input.version.trim(),
        input.embeddingModel.trim(),
        String(input.dimensions),
    ].join("\u001f"));
}

export function createIngestionDedupeKey(input: {
    scope: string;
    filename: string;
    content: string;
    documentType: string;
}): string {
    return digest([
        input.scope.trim(),
        input.filename.trim().toLowerCase(),
        input.documentType.trim().toLowerCase(),
        normalizeDocumentContent(input.content),
    ].join("\u001f"));
}

export function createDocumentVersion(input: { sourceId: string; content: string; documentType: string }): string {
    return digest([input.sourceId.trim(), input.documentType.trim(), normalizeDocumentContent(input.content)].join("\u001f"));
}

export function createChunkId(input: {
    sourceId: string;
    version: string;
    locator: string;
    chunkIndex: number;
    content: string;
}): string {
    if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) throw new Error("chunkIndex must be a non-negative integer");
    return digest([input.sourceId.trim(), input.version, input.locator.trim(), String(input.chunkIndex), normalizeDocumentContent(input.content)].join("\u001f"));
}
