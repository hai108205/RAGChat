import { createHash } from "node:crypto";

function digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeDocumentContent(content: string): string {
    return content.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
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
