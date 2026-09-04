import type { Request, Response } from "express";
import crypto from "crypto";
import OpenAI from "openai";
import prisma from "../utils/prismaClient.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import { createAuditEvent } from "../utils/audit.js";
import { estimateUsageCostUsd } from "../utils/constants.js";
import {
    getOrCreateRocketChatUser,
    getOrCreateRocketChatChat,
    formatRocketChatCitations,
} from "../utils/rocketchatIdentity.js";
import {
    buildRocketChatDocumentationUrl,
    buildChatSourceScopeWhere,
    buildStatsScopeWhere,
    verifySourceDeletionScope,
    verifyFeedbackScope,
} from "../utils/rocketchatScope.js";
import {
    generateVectorEmbeddings,
    getEmbeddingDimensionsForModel,
    splitDocumentationContent,
} from "../utils/ragUtilities.js";
import { qdrant } from "../utils/ragClients.js";
import { deleteQdrantCollectionSafe } from "../utils/qdrantCleanup.js";
import {
    validateAndDecodeBase64,
    validateFileMetadata,
} from "../utils/uploadPolicy.js";
import {
    parseDocument,
    DocumentParserError,
} from "../services/documentParser.js";
import { scopedVectorSearch } from "../services/scopedVectorSearch.js";
import { getRocketChatStats } from "../services/rocketchatStats.service.js";
import { deleteSourceWithCleanup } from "../services/qdrantCleanupOutbox.service.js";
import { enqueueRocketChatJob } from "../utils/rocketchatQueue.js";
import { submitRocketChatFeedback } from "../services/rocketchatFeedback.service.js";


// In-memory LRU idempotency cache for fast deduplication
const seenRequests = new Set<string>();

function markAndCheckIdempotency(requestId?: string | null): boolean {
    if (!requestId) return false;
    if (seenRequests.has(requestId)) {
        return true;
    }
    seenRequests.add(requestId);
    if (seenRequests.size > 2000) {
        const first = seenRequests.values().next().value;
        if (first) seenRequests.delete(first);
    }
    return false;
}

export interface SendRocketChatCallbackOptions {
    maxRetries?: number;
    timeoutMs?: number;
}

/**
 * Resolves list of trusted origins for Rocket.Chat callbacks from environment variables.
 */
export function getTrustedCallbackOrigins(): Set<string> {
    const trusted = new Set<string>();
    const originsStr = process.env.ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS;
    if (originsStr) {
        originsStr.split(",").forEach((item) => {
            const trimmed = item.trim();
            if (trimmed) {
                try {
                    const parsed = new URL(trimmed);
                    trusted.add(parsed.origin.toLowerCase());
                } catch {
                    trusted.add(trimmed.toLowerCase());
                }
            }
        });
    }

    const baseUrlStr = process.env.ROCKETCHAT_CALLBACK_BASE_URL;
    if (baseUrlStr) {
        const trimmed = baseUrlStr.trim();
        if (trimmed) {
            try {
                const parsed = new URL(trimmed);
                trusted.add(parsed.origin.toLowerCase());
            } catch {
                trusted.add(trimmed.toLowerCase());
            }
        }
    }

    return trusted;
}

/**
 * Validates a Rocket.Chat webhook callback URL against security constraints:
 * - Must be http: or https:
 * - Must not contain credentials (username / password)
 * - Must not contain fragments (#hash)
 * - In production, must match trusted origins allowlist (or explicit container hostname if configured)
 */
export function validateCallbackUrl(callbackUrl: string): { valid: boolean; reason?: string } {
    if (!callbackUrl || typeof callbackUrl !== "string") {
        return { valid: false, reason: "Callback URL must be a non-empty string." };
    }

    let parsed: URL;
    try {
        parsed = new URL(callbackUrl);
    } catch {
        return { valid: false, reason: "Invalid callback URL format." };
    }

    // Protocol check: only http and https allowed
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { valid: false, reason: `Invalid protocol '${parsed.protocol}'; only http: and https: are permitted.` };
    }

    // Credentials check
    if (parsed.username || parsed.password) {
        return { valid: false, reason: "Callback URL must not contain credentials (username or password)." };
    }

    // Fragment check
    if (parsed.hash) {
        return { valid: false, reason: "Callback URL must not contain URL fragments/hashes." };
    }

    const isProd = process.env.NODE_ENV === "production";
    const allowDev = process.env.ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV === "true";
    const trustedOrigins = getTrustedCallbackOrigins();
    const origin = parsed.origin.toLowerCase();

    if (trustedOrigins.size > 0) {
        if (!trustedOrigins.has(origin)) {
            // Also allow matching host if hostname is configured directly without port or protocol
            const hostname = parsed.hostname.toLowerCase();
            const host = parsed.host.toLowerCase();
            const matchesHost = Array.from(trustedOrigins).some(
                (trusted) => trusted === hostname || trusted === host || trusted === origin,
            );

            if (!matchesHost) {
                return {
                    valid: false,
                    reason: `Callback origin '${origin}' is not in the trusted origins allowlist.`,
                };
            }
        }
    } else if (isProd) {
        return {
            valid: false,
            reason: "No trusted callback origins configured in production (ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS or ROCKETCHAT_CALLBACK_BASE_URL).",
        };
    } else if (!allowDev) {
        // In dev without explicit allowDev, if no trusted origins are set, allow localhost/127.0.0.1 or reject
        const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
        if (!isLocalhost) {
            return {
                valid: false,
                reason: `Callback origin '${origin}' is not trusted. Set ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS or ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true.`,
            };
        }
    }

    return { valid: true };
}

/**
 * Sends webhook notification back to Rocket.Chat app
 */
export async function sendRocketChatCallback(
    callbackUrl?: string | null,
    payload?: any,
    options: SendRocketChatCallbackOptions = {},
): Promise<boolean> {
    if (!callbackUrl) {
        logger.debug(
            { event: payload?.event, requestId: payload?.request_id || payload?.requestId },
            "No callbackUrl provided; skipping Rocket.Chat webhook callback.",
        );
        return false;
    }

    const validation = validateCallbackUrl(callbackUrl);
    if (!validation.valid) {
        logger.error(
            {
                callbackUrl,
                reason: validation.reason,
                event: payload?.event,
                requestId: payload?.request_id || payload?.requestId,
            },
            "Refusing to send Rocket.Chat callback to untrusted/invalid URL.",
        );
        return false;
    }

    const maxRetries = options.maxRetries ?? 2;
    const timeoutMs = options.timeoutMs ?? 10000;
    const token = process.env.ROCKETCHAT_INTEGRATION_TOKEN;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const reqId = payload?.request_id || payload?.requestId;
    if (reqId) {
        headers["X-Request-Id"] = reqId;
    }
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(callbackUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (res.ok) {
                logger.info(
                    {
                        event: payload?.event,
                        requestId: reqId,
                        attempt,
                        statusCode: res.status,
                    },
                    "Rocket.Chat callback delivered successfully.",
                );
                return true;
            }

            const errorText = await res.text().catch(() => "");
            logger.warn(
                {
                    event: payload?.event,
                    requestId: reqId,
                    attempt,
                    statusCode: res.status,
                    errorText,
                },
                "Rocket.Chat callback returned non-2xx status.",
            );
        } catch (err: any) {
            logger.warn(
                {
                    event: payload?.event,
                    requestId: reqId,
                    attempt,
                    err: err.message,
                },
                "Failed to send Rocket.Chat callback attempt.",
            );
        }

        if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
        }
    }

    return false;
}

function getLLMClient(): OpenAI {
    if (process.env.NODE_ENV === "test" && (!process.env.OPENROUTER_LLM_API_KEY || process.env.OPENROUTER_LLM_API_KEY.startsWith("test-"))) {
        return {
            chat: {
                completions: {
                    create: async ({ messages }: { messages: any[] }) => {
                        const lastUser = messages.find((m) => m.role === "user")?.content || "";
                        return {
                            choices: [
                                {
                                    message: {
                                        content: `AI completion response for: ${lastUser}`,
                                    },
                                },
                            ],
                            usage: {
                                prompt_tokens: 20,
                                completion_tokens: 30,
                            },
                        };
                    },
                },
            },
        } as any;
    }

    const apiKey =
        process.env.OPENROUTER_LLM_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "dummy_key_for_test";
    const baseURL =
        process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

    return new OpenAI({
        baseURL,
        apiKey,
    });
}

/**
 * Executes RAG retrieval across any indexed sources linked to the chat and scope
 */
async function retrieveRelevantSources(
    chat: any,
    query: string,
    embeddingModel?: string,
    scopeParams?: { workspaceId?: string; roomId?: string; threadId?: string | null },
) {
    try {
        const results = await scopedVectorSearch({
            query,
            workspaceId: scopeParams?.workspaceId || chat?.rocketchatWorkspaceId || "default",
            roomId: scopeParams?.roomId || chat?.rocketchatRoomId || "",
            threadId: scopeParams?.threadId !== undefined ? scopeParams.threadId : chat?.rocketchatThreadId,
            embeddingModel,
            topK: 5,
            minScore: 0.3,
        });

        if (results && results.length > 0) {
            return results.map((r) => ({
                score: r.relevance,
                payload: {
                    title: r.title,
                    body: r.snippet,
                    url: r.pageUrl,
                    chunkType: r.metadata?.chunkType,
                },
            }));
        }
    } catch (err: any) {
        logger.debug({ err: err.message }, "scopedVectorSearch error during retrieveRelevantSources; falling back");
    }

    if (!chat?.chatSources?.length) {
        return [];
    }

    const allDensePoints: any[] = [];

    // Group sources by embedding model
    const sourcesByModel = new Map<string, any[]>();
    for (const source of chat.chatSources) {
        if (!source.collectionName) continue;
        const srcModel = source.embeddingModel || process.env.EMBEDDING_MODEL || embeddingModel || "openai/text-embedding-3-small";
        if (!sourcesByModel.has(srcModel)) {
            sourcesByModel.set(srcModel, []);
        }
        sourcesByModel.get(srcModel)!.push(source);
    }

    for (const [modelName, sources] of sourcesByModel.entries()) {
        let userPromptEmbeddings: any;
        try {
            userPromptEmbeddings = await generateVectorEmbeddings(query, { model: modelName });
        } catch (e: any) {
            logger.debug({ err: e.message, modelName }, "Embedding generation failure during retrieval");
            continue;
        }

        for (const source of sources) {
            try {
                const denseResults = await qdrant.query(source.collectionName, {
                    query: userPromptEmbeddings,
                    limit: 5,
                    with_payload: true,
                    score_threshold: 0.3,
                });
                if (denseResults?.points?.length) {
                    allDensePoints.push(...denseResults.points);
                }
            } catch (e: any) {
                logger.debug({ err: e.message, collection: source.collectionName }, "Qdrant query non-fatal failure");
            }
        }
    }

    allDensePoints.sort((a, b) => (b.score || 0) - (a.score || 0));
    return allDensePoints.slice(0, 5);
}

/**
 * POST /api/v1/integrations/rocketchat/messages/async
 */
export const handleAsyncMessage = asyncHandler(async (req: Request, res: Response) => {
    const canonicalRequestId = (req.id || req.body?.requestId || req.headers["x-request-id"] || crypto.randomUUID()) as string;
    const {
        workspaceId = "default",
        rocketUserId,
        roomId,
        threadId,
        placeholderId,
        query,
        history = [],
        model,
        temperature,
        embeddingModel,
        provider = "DEFAULT",
        callbackUrl,
    } = req.body;

    if (callbackUrl) {
        const validation = validateCallbackUrl(callbackUrl);
        if (!validation.valid) {
            throw new ApiError(400, `Invalid callbackUrl: ${validation.reason}`);
        }
    }

    const { jobId, isDuplicate } = await enqueueRocketChatJob("chat", {
        workspaceId,
        rocketUserId,
        roomId,
        threadId,
        placeholderId,
        query,
        history,
        model,
        temperature,
        embeddingModel,
        provider,
        callbackUrl,
        requestId: canonicalRequestId,
    });

    if (isDuplicate) {
        return res.status(202).json(
            new ApiResponse(
                202,
                {
                    status: "accepted",
                    jobId,
                    requestId: canonicalRequestId,
                    duplicate: true,
                },
                "Duplicate message request ignored",
            ),
        );
    }

    return res.status(202).json(
        new ApiResponse(
            202,
            {
                status: "accepted",
                jobId,
                requestId: canonicalRequestId,
            },
            "Message queued for processing",
        ),
    );
});

/**
 * GET /api/v1/integrations/rocketchat/stats
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
    const {
        workspaceId = "default",
        roomId,
        threadId,
        mode = "room",
    } = req.query as any;

    const statsResult = await getRocketChatStats({
        workspaceId,
        roomId,
        threadId,
        mode,
        allowGlobal: process.env.ALLOW_ROCKETCHAT_GLOBAL_MODE === "true",
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...statsResult,
                requestId: req.id,
            },
            "Integration stats retrieved successfully",
        ),
    );
});

/**
 * GET /api/v1/integrations/rocketchat/sources
 */
export const listSources = asyncHandler(async (req: Request, res: Response) => {
    const {
        workspaceId = "default",
        roomId,
        threadId,
        mode = "room",
        limit = 50,
        cursor,
    } = req.query as any;

    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    const whereClause = buildChatSourceScopeWhere({
        workspaceId,
        roomId,
        threadId,
        mode,
        allowGlobal: process.env.ALLOW_ROCKETCHAT_GLOBAL_MODE === "true",
    });

    const sources = await prisma.chatSource.findMany({
        where: whereClause,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: parsedLimit + 1,
        ...(cursor
            ? {
                  cursor: { id: cursor },
                  skip: 1,
              }
            : {}),
        select: {
            id: true,
            heading: true,
            documentationUrl: true,
            totalPages: true,
            createdAt: true,
            lastIndexedAt: true,
            embeddingModel: true,
            embeddingDimensions: true,
            _count: {
                select: { pagesIndexed: true },
            },
        },
    });

    const hasMore = sources.length > parsedLimit;
    const paginatedSources = hasMore ? sources.slice(0, parsedLimit) : sources;
    const nextCursor = hasMore ? paginatedSources[paginatedSources.length - 1]?.id : undefined;

    const formattedSources = paginatedSources.map((s) => {
        const chunksCount = s._count?.pagesIndexed || s.totalPages || 0;
        return {
            id: s.id,
            filename: s.heading || s.documentationUrl || "Document",
            documentationUrl: s.documentationUrl,
            chunksCount,
            totalPages: s.totalPages || chunksCount,
            createdAt: s.createdAt ? s.createdAt.toISOString() : undefined,
            lastIndexedAt: s.lastIndexedAt ? s.lastIndexedAt.toISOString() : undefined,
            status: chunksCount > 0 ? "ACTIVE" : "EMPTY",
            embeddingModel: s.embeddingModel,
            embeddingDimensions: s.embeddingDimensions,
        };
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                sources: formattedSources,
                nextCursor,
                hasMore,
                requestId: req.id,
            },
            "Sources retrieved successfully",
        ),
    );
});

/**
 * DELETE /api/v1/integrations/rocketchat/sources/:id
 */
export const deleteSource = asyncHandler(async (req: Request, res: Response) => {
    const sourceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
        workspaceId = "default",
        roomId,
        mode = "room",
        actorRocketUserId,
        canManageSources,
    } = req.query as any;

    const result = await deleteSourceWithCleanup({
        sourceId,
        workspaceId,
        roomId,
        mode,
        allowGlobal: process.env.ALLOW_ROCKETCHAT_GLOBAL_MODE === "true",
        actorRocketUserId,
        canManageSources,
        requestId: req.id,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...result,
                requestId: req.id,
            },
            "Source deleted successfully",
        ),
    );
});

/**
 * POST /api/v1/integrations/rocketchat/feedback
 */
export const submitFeedback = asyncHandler(async (req: Request, res: Response) => {
    const {
        messageId,
        chatMessageId,
        rating,
        feedbackText,
        rocketUserId,
        actorRocketUserId,
        workspaceId = "default",
        roomId,
    } = req.body;

    const result = await submitRocketChatFeedback({
        messageId,
        chatMessageId,
        rating,
        feedbackText,
        rocketUserId,
        actorRocketUserId,
        workspaceId,
        roomId,
        requestId: req.id,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...result,
                requestId: req.id,
            },
            "Feedback recorded successfully",
        ),
    );
});

/**
 * POST /api/v1/integrations/rocketchat/sources/base64
 */
export const handleBase64Source = asyncHandler(async (req: Request, res: Response) => {
    const canonicalRequestId = (req.id || req.body?.requestId || req.headers["x-request-id"] || crypto.randomUUID()) as string;
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
    } = req.body;

    if (callbackUrl) {
        const validation = validateCallbackUrl(callbackUrl);
        if (!validation.valid) {
            throw new ApiError(400, `Invalid callbackUrl: ${validation.reason}`);
        }
    }

    // Fast sync pre-validation of upload metadata & base64 format before enqueueing
    validateFileMetadata(filename, contentType);
    validateAndDecodeBase64(contentBase64);

    const { jobId, isDuplicate } = await enqueueRocketChatJob("ingestion", {
        workspaceId,
        rocketUserId,
        roomId,
        threadId,
        filename,
        contentBase64,
        contentType,
        embeddingModel,
        callbackUrl,
        requestId: canonicalRequestId,
    });

    if (isDuplicate) {
        return res.status(202).json(
            new ApiResponse(
                202,
                {
                    status: "accepted",
                    jobId,
                    requestId: canonicalRequestId,
                    duplicate: true,
                },
                "Duplicate source upload ignored",
            ),
        );
    }

    return res.status(202).json(
        new ApiResponse(
            202,
            {
                status: "accepted",
                jobId,
                requestId: canonicalRequestId,
            },
            "Source queued for ingestion",
        ),
    );
});

/**
 * POST /api/v1/integrations/rocketchat/utilities/completion
 */
export const handleUtilityCompletion = asyncHandler(async (req: Request, res: Response) => {
    const {
        operation,
        text = "",
        targetLang = "vi",
        concept = "",
        query = "",
        topK = 5,
        model,
        temperature,
    } = req.body;

    const openai = getLLMClient();
    const activeModel = model || process.env.DEFAULT_LLM_MODEL || "openai/gpt-4o-mini";
    const temp = typeof temperature === "number" ? temperature : 0.7;

    if (operation === "summarize") {
        const response = await openai.chat.completions.create({
            model: activeModel,
            temperature: temp,
            messages: [
                {
                    role: "system",
                    content:
                        "Summarize the following text clearly and concisely. Preserve key facts and action items.",
                },
                { role: "user", content: text },
            ],
        });

        const summary =
            response.choices?.[0]?.message?.content || "No summary generated.";
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { result: summary, summary, requestId: req.id },
                    "Text summarized successfully",
                ),
            );
    }

    if (operation === "explain") {
        const response = await openai.chat.completions.create({
            model: activeModel,
            temperature: temp,
            messages: [
                {
                    role: "system",
                    content:
                        "Explain the concept or technical term clearly in simple language with an intuitive example.",
                },
                { role: "user", content: concept || text },
            ],
        });

        const explanation =
            response.choices?.[0]?.message?.content || "No explanation generated.";
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { result: explanation, explanation, requestId: req.id },
                    "Concept explained successfully",
                ),
            );
    }

    if (operation === "translate") {
        const response = await openai.chat.completions.create({
            model: activeModel,
            temperature: temp,
            messages: [
                {
                    role: "system",
                    content: `Translate the text accurately into ${targetLang}. Return only the translation.`,
                },
                { role: "user", content: text },
            ],
        });

        const translation =
            response.choices?.[0]?.message?.content || "No translation generated.";
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { result: translation, translation, requestId: req.id },
                    "Text translated successfully",
                ),
            );
    }

    if (operation === "search") {
        const {
            workspaceId = "default",
            roomId,
            threadId,
            embeddingModel,
        } = req.body;

        const results = await scopedVectorSearch({
            query,
            workspaceId,
            roomId,
            threadId,
            limit: topK,
            embeddingModel,
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { results, requestId: req.id },
                    "Search completed successfully",
                ),
            );
    }

    throw new ApiError(400, `Unsupported utility operation: ${operation}`);
});
