import crypto from "crypto";
import prisma from "../utils/prismaClient.js";
import logger from "../utils/logger.js";
import { qdrant } from "../utils/ragClients.js";
import {
    generateVectorEmbeddings,
    getEmbeddingDimensionsForModel,
    splitDocumentationContent,
} from "../utils/ragUtilities.js";
import { deleteQdrantCollectionSafe } from "../utils/qdrantCleanup.js";
import { config } from "../config/runtime.js";
import {
    getOrCreateRocketChatUser,
    getOrCreateRocketChatChat,
} from "../utils/rocketchatIdentity.js";
import { buildRocketChatDocumentationUrl } from "../utils/rocketchatScope.js";
import {
    validateAndDecodeBase64,
    validateFileMetadata,
    UploadPolicyError,
} from "../utils/uploadPolicy.js";
import {
    parseDocument,
    DocumentParserError,
    type DocumentFormat,
} from "./documentParser.js";
import { sendRocketChatCallback } from "../controllers/rocketchatIntegration.controller.js";
import type { RocketChatIngestionJobPayload } from "../utils/rocketchatQueue.js";

export interface Base64IngestionInput {
    workspaceId?: string;
    rocketUserId: string;
    roomId: string;
    threadId?: string | null;
    filename: string;
    contentBase64: string;
    contentType?: string | null;
    embeddingModel?: string;
    requestId: string;
    callbackUrl?: string | null;
}

export interface IngestionResult {
    sourceId: string;
    chunksCount: number;
    filename: string;
    format: DocumentFormat;
    collectionName: string;
    sourceUrl: string;
}

/**
 * Service for ingesting documents uploaded via Rocket.Chat integration.
 */
export async function ingestBase64Document(
    input: Base64IngestionInput,
): Promise<IngestionResult> {
    const {
        workspaceId = "default",
        rocketUserId,
        roomId,
        threadId,
        filename,
        contentBase64,
        contentType,
        embeddingModel,
        requestId,
    } = input;

    // 1. Policy & metadata validation
    const { normalizedFilename } = validateFileMetadata(filename, contentType);

    // 2. Decode base64
    const buffer = validateAndDecodeBase64(contentBase64);

    // 3. Document parsing
    const parsed = await parseDocument(buffer, {
        filename: normalizedFilename,
        contentType,
    });

    if (!parsed.text || parsed.text.trim().length === 0) {
        throw new DocumentParserError(
            "EMPTY_FILE",
            `Document "${normalizedFilename}" contained no extractable text content`,
        );
    }

    // 4. Split into chunks
    const chunks = splitDocumentationContent(parsed.text, {
        chunkSize: 1000,
        chunkOverlap: 150,
    });

    if (chunks.length === 0) {
        throw new DocumentParserError(
            "EMPTY_FILE",
            `Document "${normalizedFilename}" could not be split into valid chunks`,
        );
    }

    // 5. Ensure user and chat entities exist
    const user = await getOrCreateRocketChatUser({
        workspaceId,
        rocketUserId,
    });

    const chat = await getOrCreateRocketChatChat({
        userId: user.id,
        roomId,
        threadId,
        workspaceId,
    });

    // 6. Allocate Qdrant collection
    const collectionName = `rc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const selectedEmbeddingModel = embeddingModel || config.llm.embeddingModel;
    const dimensions = getEmbeddingDimensionsForModel(selectedEmbeddingModel);

    await qdrant.createCollection(collectionName, {
        vectors: { size: dimensions, distance: "Cosine" },
    });

    let createdSourceId: string | null = null;

    try {
        const sourceId = crypto.randomUUID();
        const sourceUrl = buildRocketChatDocumentationUrl({
            workspaceId,
            roomId,
            threadId,
            sourceId,
            filename: normalizedFilename,
        });

        // 7. Persist ChatSource record
        const source = await prisma.chatSource.create({
            data: {
                id: sourceId,
                heading: normalizedFilename,
                documentationUrl: sourceUrl,
                collectionName,
                totalPages: parsed.metadata.totalPages || chunks.length,
                lastIndexedAt: new Date(),
                rocketchatWorkspaceId: workspaceId || "default",
                rocketchatRoomId: roomId,
                rocketchatThreadId: threadId || null,
                uploadedByRocketUserId: rocketUserId,
                embeddingModel: selectedEmbeddingModel,
                embeddingDimensions: dimensions,
                chats: {
                    connect: { id: chat.id },
                },
            },
        });
        createdSourceId = source.id;

        // 8. Generate embeddings
        const embeddings = (await generateVectorEmbeddings(
            chunks.map((c) => c.content),
            { model: selectedEmbeddingModel, dimensions },
        )) as number[][];

        // 9. Upsert points to Qdrant
        await qdrant.upsert(collectionName, {
            wait: true,
            points: chunks.map((chunk, index) => ({
                id: crypto.randomUUID(),
                vector: embeddings[index],
                payload: {
                    url: sourceUrl,
                    title: normalizedFilename,
                    heading: chunk.heading || normalizedFilename,
                    body: chunk.content,
                    chatSourceId: source.id,
                    chunkType: chunk.chunkType,
                    hasCodeBlock: chunk.hasCodeBlock,
                },
            })),
        });

        // 10. Persist DocumentPage metadata
        await prisma.documentPage.createMany({
            data: chunks.map((c) => ({
                heading: c.heading || normalizedFilename,
                pageUrl: sourceUrl,
                chatSourceId: source.id,
            })),
        });

        logger.info(
            {
                requestId,
                sourceId: source.id,
                filename: normalizedFilename,
                format: parsed.format,
                chunksCount: chunks.length,
            },
            "Document ingestion completed successfully",
        );

        return {
            sourceId: source.id,
            chunksCount: chunks.length,
            filename: normalizedFilename,
            format: parsed.format,
            collectionName,
            sourceUrl,
        };
    } catch (err: unknown) {
        // Cleanup partial state on failure
        logger.error(
            {
                err: err instanceof Error ? err.message : String(err),
                requestId,
                collectionName,
                createdSourceId,
            },
            "Ingestion failed; rolling back partial collection and DB records",
        );

        try {
            await deleteQdrantCollectionSafe(collectionName);
        } catch (cleanupErr: any) {
            logger.warn({ err: cleanupErr.message }, "Failed to delete partial Qdrant collection");
        }

        if (createdSourceId) {
            try {
                await prisma.chatSource.delete({ where: { id: createdSourceId } });
            } catch (cleanupErr: any) {
                logger.warn({ err: cleanupErr.message }, "Failed to delete partial ChatSource record");
            }
        }

        throw err;
    }
}

/**
 * Pure service function for executing document ingestion and dispatching Rocket.Chat callbacks.
 */
export async function processRocketChatIngestion(
    payload: RocketChatIngestionJobPayload,
): Promise<IngestionResult> {
    const {
        workspaceId = "default",
        rocketUserId,
        roomId,
        threadId,
        filename,
        contentBase64,
        contentType,
        embeddingModel,
        callbackUrl,
        requestId,
    } = payload;

    try {
        const result = await ingestBase64Document({
            workspaceId,
            rocketUserId,
            roomId,
            threadId,
            filename,
            contentBase64,
            contentType,
            embeddingModel,
            requestId,
            callbackUrl,
        });

        await sendRocketChatCallback(callbackUrl, {
            event: "indexing_complete",
            request_id: requestId,
            requestId,
            user_id: rocketUserId,
            room_id: roomId,
            thread_id: threadId || undefined,
            document_name: result.filename,
            chunks_count: result.chunksCount,
            source_id: result.sourceId,
            sourceId: result.sourceId,
        });

        return result;
    } catch (error: any) {
        logger.error(
            { err: error.message, requestId, filename },
            "Error processing Rocket.Chat document ingestion",
        );

        await sendRocketChatCallback(callbackUrl, {
            event: "indexing_failed",
            request_id: requestId,
            requestId,
            user_id: rocketUserId,
            room_id: roomId,
            thread_id: threadId || undefined,
            document_name: filename,
            error: error.message || "Failed to index file",
            errorCode: error.code || "INDEXING_FAILED",
        });

        throw error;
    }
}
