import { createChunkId, createContentHash, createDocumentVersion, createRagDocumentId, normalizeDocumentContent } from "./documentIdentity.js";
import { RagStageError, type RagScope } from "./types.js";
import { ensureRagCollection, getRagCollectionName } from "./qdrantIndex.service.js";

export interface RagChunkCandidate {
    content: string;
    locator?: string;
    metadata?: Record<string, unknown>;
}

export interface RagPoint {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
}

export interface BuildRagPointsInput {
    sourceId: string;
    sourceUrl: string;
    filename: string;
    documentType: string;
    content: string;
    embeddingModel: string;
    dimensions: number;
    indexVersion: string;
    scope: RagScope;
    chunks: readonly RagChunkCandidate[];
    embeddings: readonly number[][];
}

function scopePayload(scope: RagScope): Record<string, string | null> {
    return scope.kind === "web"
        ? { chatId: scope.chatId, workspaceId: null, roomId: null, threadId: null }
        : { chatId: null, workspaceId: scope.workspaceId, roomId: scope.roomId, threadId: scope.threadId ?? "" };
}

export function buildRagPoints(input: BuildRagPointsInput): RagPoint[] {
    if (!input.sourceId.trim()) throw new Error("sourceId is required");
    if (!input.documentType.trim()) throw new Error("documentType is required");
    if (!Number.isInteger(input.dimensions) || input.dimensions < 1) throw new Error("dimensions must be a positive integer");
    if (input.chunks.length !== input.embeddings.length) throw new Error("Embedding count must match chunk count");

    const normalizedContent = normalizeDocumentContent(input.content);
    if (!normalizedContent) throw new Error("Document content cannot be empty");
    const versionHash = createDocumentVersion({ sourceId: input.sourceId, content: normalizedContent, documentType: input.documentType });
    const documentId = createRagDocumentId({ sourceId: input.sourceId, version: versionHash, embeddingModel: input.embeddingModel, dimensions: input.dimensions });
    const common = {
        ...scopePayload(input.scope),
        sourceId: input.sourceId,
        documentId,
        versionHash,
        contentHash: createContentHash(normalizedContent),
        sourceUrl: input.sourceUrl,
        url: input.sourceUrl,
        filename: input.filename,
        title: input.filename,
        documentType: input.documentType,
        embeddingModel: input.embeddingModel,
        embeddingDimensions: input.dimensions,
        indexVersion: input.indexVersion,
    };

    return input.chunks.map((candidate, chunkIndex) => {
        const body = normalizeDocumentContent(candidate.content);
        if (!body) throw new Error(`Chunk ${chunkIndex} is empty`);
        const vector = input.embeddings[chunkIndex];
        if (!Array.isArray(vector) || vector.length !== input.dimensions || vector.some((value) => !Number.isFinite(value))) {
            throw new Error(`Embedding dimensions are invalid for chunk ${chunkIndex}`);
        }
        const locator = candidate.locator?.trim() || `chunk:${chunkIndex}`;
        const id = createChunkId({ sourceId: input.sourceId, version: versionHash, locator, chunkIndex, content: body });
        return {
            id,
            vector: [...vector],
            payload: {
                ...common,
                chunkId: id,
                chunkIndex,
                locator,
                body,
                content: body,
                metadata: candidate.metadata ?? {},
                ...candidate.metadata,
            },
        };
    });
}

export function buildRagManifest(input: Omit<BuildRagPointsInput, "embeddings"> & { chunkCount: number }) {
    const versionHash = createDocumentVersion({ sourceId: input.sourceId, content: input.content, documentType: input.documentType });
    return {
        id: createRagDocumentId({ sourceId: input.sourceId, version: versionHash, embeddingModel: input.embeddingModel, dimensions: input.dimensions }),
        chatSourceId: input.sourceId,
        contentHash: createContentHash(input.content),
        versionHash,
        documentType: input.documentType,
        embeddingModel: input.embeddingModel,
        embeddingDimensions: input.dimensions,
        chunkCount: input.chunkCount,
    };
}

export interface RagIndexDependencies {
    prisma: {
        ragDocument: {
            findUnique: (...args: any[]) => Promise<any>;
            create: (...args: any[]) => Promise<any>;
            update: (...args: any[]) => Promise<any>;
        };
        ragChunk: { createMany: (...args: any[]) => Promise<any> };
    };
    qdrant: {
        getCollection: (name: string) => Promise<unknown>;
        createCollection: (name: string, config: unknown) => Promise<unknown>;
        createPayloadIndex: (name: string, config: unknown) => Promise<unknown>;
        upsert: (name: string, request: unknown) => Promise<unknown>;
    };
}

export async function indexRagDocumentV1(
    input: Omit<BuildRagPointsInput, "embeddings"> & { embeddings: readonly number[][] },
    dependencies: RagIndexDependencies,
): Promise<{ documentId: string; collectionName: string; versionHash: string; chunkCount: number; alreadyIndexed: boolean }> {
    let points: RagPoint[];
    try {
        points = buildRagPoints(input);
    } catch (error) {
        if (error instanceof RagStageError) throw error;
        throw new RagStageError("CHUNK", "CHUNK_VALIDATION_FAILURE", error instanceof Error ? error.message : String(error), false, error);
    }
    const manifest = buildRagManifest({ ...input, chunkCount: points.length });
    const collectionName = getRagCollectionName(input.indexVersion, input.embeddingModel, input.dimensions);
    const uniqueWhere = {
        chatSourceId_versionHash_embeddingModel_embeddingDimensions: {
            chatSourceId: input.sourceId,
            versionHash: manifest.versionHash,
            embeddingModel: input.embeddingModel,
            embeddingDimensions: input.dimensions,
        },
    };
    const existing = await dependencies.prisma.ragDocument.findUnique({ where: uniqueWhere });
    if (existing?.status === "ACTIVE") {
        return { documentId: existing.id, collectionName: existing.collectionName, versionHash: existing.versionHash, chunkCount: existing.chunkCount, alreadyIndexed: true };
    }

    try {
        await ensureRagCollection(dependencies.qdrant, collectionName, input.dimensions);
    } catch (error) {
        throw new RagStageError("INDEX", "VECTOR_STORE_FAILURE", error instanceof Error ? error.message : String(error), true, error);
    }
    const record = existing ?? await dependencies.prisma.ragDocument.create({
        data: {
            ...manifest,
            collectionName,
            status: "INGESTING",
        },
    });

    try {
        await dependencies.qdrant.upsert(collectionName, { wait: true, points });
        if (!existing) {
            await dependencies.prisma.ragChunk.createMany({
                data: points.map((point) => ({
                    id: point.id,
                    documentId: record.id,
                    chunkIndex: point.payload.chunkIndex,
                    contentHash: point.payload.contentHash,
                    locator: point.payload.locator,
                    metadata: point.payload,
                })),
                skipDuplicates: true,
            });
        }
        await dependencies.prisma.ragDocument.update({
            where: { id: record.id },
            data: { status: "ACTIVE", chunkCount: points.length, activatedAt: new Date(), collectionName },
        });
    } catch (error) {
        await dependencies.prisma.ragDocument.update({
            where: { id: record.id },
            data: { status: "FAILED" },
        }).catch(() => undefined);
        if (error instanceof RagStageError) throw error;
        throw new RagStageError("INDEX", "VECTOR_STORE_FAILURE", error instanceof Error ? error.message : String(error), true, error);
    }

    return { documentId: record.id, collectionName, versionHash: manifest.versionHash, chunkCount: points.length, alreadyIndexed: false };
}
