import type { Request, Response } from "express";
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
    generateVectorEmbeddings,
    splitDocumentationContent,
} from "../utils/ragUtilities.js";
import { qdrant } from "../utils/ragClients.js";

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
 * Sends webhook notification back to Rocket.Chat app
 */
export async function sendRocketChatCallback(
    callbackUrl?: string | null,
    payload?: any,
    options: SendRocketChatCallbackOptions = {},
): Promise<boolean> {
    if (!callbackUrl) {
        logger.debug(
            { event: payload?.event, requestId: payload?.request_id },
            "No callbackUrl provided; skipping Rocket.Chat webhook callback.",
        );
        return false;
    }

    const maxRetries = options.maxRetries ?? 2;
    const timeoutMs = options.timeoutMs ?? 10000;
    const token = process.env.ROCKETCHAT_INTEGRATION_TOKEN;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
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
                        requestId: payload?.request_id,
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
                    requestId: payload?.request_id,
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
                    requestId: payload?.request_id,
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
 * Executes RAG retrieval across any indexed sources linked to the chat
 */
async function retrieveRelevantSources(chat: any, query: string) {
    if (!chat?.chatSources?.length) {
        return [];
    }

    let userPromptEmbeddings: any;
    try {
        userPromptEmbeddings = await generateVectorEmbeddings(query);
    } catch {
        return [];
    }

    const allDensePoints: any[] = [];

    for (const source of chat.chatSources) {
        if (!source.collectionName) continue;
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
            logger.debug({ err: e.message }, "Qdrant query non-fatal failure");
        }
    }

    allDensePoints.sort((a, b) => (b.score || 0) - (a.score || 0));
    return allDensePoints.slice(0, 5);
}

/**
 * POST /api/v1/integrations/rocketchat/messages/async
 */
export const handleAsyncMessage = asyncHandler(async (req: Request, res: Response) => {
    const {
        workspaceId = "default",
        rocketUserId,
        roomId,
        threadId,
        placeholderId,
        requestId,
        query,
        history = [],
        model,
        provider = "DEFAULT",
        callbackUrl,
    } = req.body;

    const isDuplicate = markAndCheckIdempotency(requestId);
    if (isDuplicate) {
        return res.status(202).json(
            new ApiResponse(
                202,
                {
                    status: "accepted",
                    jobId: `job-${requestId}`,
                    requestId,
                    duplicate: true,
                },
                "Duplicate message request ignored",
            ),
        );
    }

    // Respond immediately with 202 Accepted
    res.status(202).json(
        new ApiResponse(
            202,
            {
                status: "accepted",
                jobId: `job-${requestId}`,
                requestId,
            },
            "Message queued for processing",
        ),
    );

    // Process asynchronous generation in background
    setImmediate(async () => {
        const defaultModel =
            model || process.env.DEFAULT_LLM_MODEL || "openai/gpt-4o-mini";

        try {
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

            // 1. Retrieve RAG documentation context
            const relevantPoints = await retrieveRelevantSources(chat, query);
            const citations = formatRocketChatCitations(relevantPoints);

            // 2. Build LLM prompt
            let systemPrompt =
                "You are RAGChat, an intelligent AI assistant integrated with Rocket.Chat.\n";
            if (relevantPoints.length > 0) {
                systemPrompt +=
                    "Use the following documentation excerpts to answer the question accurately and concisely. Use Markdown formatting.\n\nDOCUMENTATION EXCERPTS:\n";
                relevantPoints.forEach((pt, i) => {
                    const title = pt.payload?.title || `Source ${i + 1}`;
                    const text = pt.payload?.body || pt.payload?.content || "";
                    systemPrompt += `\n--- [${i + 1}] ${title} ---\n${text}\n`;
                });
            } else {
                systemPrompt +=
                    "Answer the user's question helpfully and concisely using Markdown formatting.";
            }

            const messages: any[] = [{ role: "system", content: systemPrompt }];

            if (Array.isArray(history)) {
                for (const h of history.slice(-6)) {
                    if (h.role && h.content) {
                        messages.push({
                            role: h.role === "user" ? "user" : "assistant",
                            content: String(h.content),
                        });
                    }
                }
            }

            messages.push({ role: "user", content: query });

            // 3. Call LLM
            const openai = getLLMClient();
            let llmResponse = "";
            let inputTokens = 0;
            let outputTokens = 0;

            try {
                const completion = await openai.chat.completions.create({
                    model: defaultModel,
                    messages,
                });
                llmResponse =
                    completion.choices?.[0]?.message?.content ||
                    "No response received.";
                if (completion.usage) {
                    inputTokens = completion.usage.prompt_tokens || 0;
                    outputTokens = completion.usage.completion_tokens || 0;
                }
            } catch (err: any) {
                logger.error(
                    { err: err.message, requestId },
                    "LLM completion error in Rocket.Chat integration",
                );
                llmResponse = `Xin lỗi, không thể kết nối tới mô hình AI: ${err.message}`;
            }

            // 4. Persist message record
            const chatMessage = await prisma.chatMessage.create({
                data: {
                    chatId: chat.id,
                    userPrompt: query,
                    llmResponse,
                    llmModel: defaultModel,
                },
            });

            // 5. Persist sources if available
            if (relevantPoints.length > 0) {
                await prisma.chatMessageSource.createMany({
                    data: relevantPoints.map((pt) => ({
                        chatMessageId: chatMessage.id,
                        heading: pt.payload?.title || pt.payload?.heading || "Source",
                        chunkText: pt.payload?.body || pt.payload?.content || "",
                        pageUrl: pt.payload?.url || pt.payload?.pageUrl || "",
                        score: Math.round((pt.score || 0) * 100),
                    })),
                });
            }

            // 6. Record usage events and audit logs
            const usageCost = estimateUsageCostUsd({
                provider: provider || "DEFAULT",
                model: defaultModel,
                inputTokens,
                outputTokens,
            });

            await prisma.usageEvents.create({
                data: {
                    userId: user.id,
                    chatId: chat.id,
                    messageId: chatMessage.id,
                    inputTokens,
                    outputTokens,
                    estimatedCostUsd: usageCost.estimatedCostUsd,
                    priceVersion: usageCost.priceVersion,
                },
            });

            await createAuditEvent("rocketchat.message.sent", user.id, chat.id, {
                chatMessageId: chatMessage.id,
                rocketUserId,
                roomId,
                threadId,
                requestId,
                model: defaultModel,
            });

            // 7. Dispatch callback to Rocket.Chat
            const callbackPayload = {
                event: "chat_completed",
                request_id: requestId,
                user_id: rocketUserId,
                room_id: roomId,
                thread_id: threadId || undefined,
                placeholder_id: placeholderId || undefined,
                query,
                answer: llmResponse,
                sources: citations,
                model: defaultModel,
            };

            await sendRocketChatCallback(callbackUrl, callbackPayload);
        } catch (error: any) {
            logger.error(
                { err: error.message, stack: error.stack, requestId },
                "Fatal error processing async Rocket.Chat message",
            );

            const failurePayload = {
                event: "chat_failed",
                request_id: requestId,
                user_id: rocketUserId,
                room_id: roomId,
                thread_id: threadId || undefined,
                placeholder_id: placeholderId || undefined,
                query,
                error: error.message || "Internal processing error",
            };

            await sendRocketChatCallback(callbackUrl, failurePayload);
        }
    });
});

/**
 * GET /api/v1/integrations/rocketchat/stats
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
    const sources = await prisma.chatSource.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
            id: true,
            heading: true,
            documentationUrl: true,
            totalPages: true,
            createdAt: true,
            lastIndexedAt: true,
            _count: {
                select: { pagesIndexed: true },
            },
        },
    });

    const documents = sources.map((s) => ({
        id: s.id,
        filename: s.heading || s.documentationUrl || "Document",
        chunks_count: s._count?.pagesIndexed || s.totalPages || 0,
        created_at: s.createdAt ? s.createdAt.toISOString() : undefined,
    }));

    const usageAggregate = await prisma.usageEvents.aggregate({
        _sum: {
            inputTokens: true,
            outputTokens: true,
        },
    });

    const inputTokens = usageAggregate._sum.inputTokens || 0;
    const outputTokens = usageAggregate._sum.outputTokens || 0;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                documents,
                chats: [],
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens,
                },
            },
            "Integration stats retrieved successfully",
        ),
    );
});

/**
 * POST /api/v1/integrations/rocketchat/sources/base64
 */
export const handleBase64Source = asyncHandler(async (req: Request, res: Response) => {
    const {
        workspaceId = "default",
        rocketUserId,
        roomId,
        threadId,
        filename,
        contentBase64,
        requestId,
        callbackUrl,
    } = req.body;

    res.status(202).json(
        new ApiResponse(
            202,
            {
                status: "accepted",
                jobId: `job-${requestId}`,
                requestId,
            },
            "Source queued for ingestion",
        ),
    );

    setImmediate(async () => {
        try {
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

            // Decode base64 content
            const buffer = Buffer.from(contentBase64, "base64");
            const textContent = buffer.toString("utf8");

            const chunks = splitDocumentationContent(textContent, {
                chunkSize: 500,
                chunkOverlap: 50,
            });

            const collectionName = `rc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            // Create or update ChatSource
            const source = await prisma.chatSource.create({
                data: {
                    heading: filename,
                    documentationUrl: `rocketchat://${workspaceId}/${roomId}/${filename}`,
                    collectionName,
                    totalPages: chunks.length,
                    lastIndexedAt: new Date(),
                    chats: {
                        connect: { id: chat.id },
                    },
                },
            });

            if (chunks.length > 0) {
                await prisma.documentPage.createMany({
                    data: chunks.map((c) => ({
                        heading: c.heading || filename,
                        pageUrl: `rocketchat://${workspaceId}/${roomId}/${filename}`,
                        chatSourceId: source.id,
                    })),
                });
            }

            await sendRocketChatCallback(callbackUrl, {
                event: "indexing_complete",
                request_id: requestId,
                user_id: rocketUserId,
                room_id: roomId,
                thread_id: threadId || undefined,
                document_name: filename,
                chunks_count: chunks.length,
            });
        } catch (error: any) {
            logger.error(
                { err: error.message, requestId },
                "Error processing base64 upload",
            );
            await sendRocketChatCallback(callbackUrl, {
                event: "indexing_failed",
                request_id: requestId,
                user_id: rocketUserId,
                room_id: roomId,
                thread_id: threadId || undefined,
                document_name: filename,
                error: error.message || "Failed to index file",
            });
        }
    });
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
    } = req.body;

    const openai = getLLMClient();
    const model = process.env.DEFAULT_LLM_MODEL || "openai/gpt-4o-mini";

    if (operation === "summarize") {
        const response = await openai.chat.completions.create({
            model,
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
                    { result: summary, summary },
                    "Text summarized successfully",
                ),
            );
    }

    if (operation === "explain") {
        const response = await openai.chat.completions.create({
            model,
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
                    { result: explanation, explanation },
                    "Concept explained successfully",
                ),
            );
    }

    if (operation === "translate") {
        const response = await openai.chat.completions.create({
            model,
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
                    { result: translation, translation },
                    "Text translated successfully",
                ),
            );
    }

    if (operation === "search") {
        let results: any[] = [];
        try {
            const searchResults = await prisma.documentPage.findMany({
                where: {
                    heading: { contains: query, mode: "insensitive" },
                },
                take: topK,
                include: { chatSource: true },
            });

            results = searchResults.map((p) => ({
                title: p.heading || p.chatSource?.heading || "Document",
                snippet: `Found in ${p.chatSource?.heading || "knowledge base"} (${p.pageUrl})`,
                relevance: 0.85,
            }));
        } catch {
            results = [];
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { results },
                    "Search completed successfully",
                ),
            );
    }

    throw new ApiError(400, `Unsupported utility operation: ${operation}`);
});
