import type { Request, Response } from "express";
import prisma from "../utils/prismaClient.js";
import redis from "../utils/redis.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import {
    LLM_MODELS,
    PROVIDERS_BASE_URLS,
    MEM0_ENABLED,
    DAILY_TOKEN_BUDGET,
    estimateUsageCostUsd,
} from "../utils/constants.js";
import OpenAI from "openai";
import { qdrant, treeindex } from "../utils/ragClients.js";
import { decryptApiKey } from "../utils/decrypt.js";
import { generateVectorEmbeddings } from "../utils/ragUtilities.js";
import { getEmbeddingDimensionsForModel } from "../utils/ragUtilities.js";
import { searchWebRagV1 } from "../rag/retrieval.js";
import { buildMessagesForLLM } from "../utils/contextBuilder.js";
import { MemoryClient } from "mem0ai";
import PDFDocument from "pdfkit";
import { createAuditEvent } from "../utils/audit.js";
import { config } from "../config/runtime.js";
import { retrieveWebChatSources } from "../services/webChatRetrieval.service.js";

let memory: any = null;
if (MEM0_ENABLED) {
    if (config.integrations.mem0ApiKey) {
        memory = new MemoryClient({ apiKey: config.integrations.mem0ApiKey });
    } else {
        console.warn(
            "WARNING: MEM0_ENABLED is true, but MEM0_API_KEY is not set in environment variables. Mem0 integration is disabled.",
        );
    }
}

// Daily token budget tracked per user per UTC day.
const dailyBudgetKey = (userId: string) => `tokenBudget:${userId}:${new Date().toISOString().slice(0, 10)}`;

const startOfUtcDay = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const secondsUntilUtcMidnight = () =>
    Math.ceil((startOfUtcDay().getTime() + 86400000 - Date.now()) / 1000);

const getAvailableModels = asyncHandler(async (req: Request, res: Response) => {
    const apikeys = await prisma.apiKey.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "asc" },
    });
    if (!apikeys.length) {
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { models: [] },
                    "No API keys found. Please create an API key to access the models.",
                ),
            );
    }

    const models: string[] = [];
    apikeys.forEach((key) => {
        const providerModels = LLM_MODELS[key.provider];
        if (providerModels) {
            models.push(...providerModels);
        }
    });
    const uniqueSortedModels = Array.from(new Set(models)).sort();

    return res
        .status(200)
        .json(new ApiResponse(200, { models: uniqueSortedModels }, "Available models retrieved successfully."));
});

const sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const { userPrompt, model, provider, chatId } = req.body;

    if (DAILY_TOKEN_BUDGET) {
        const budgetKey = dailyBudgetKey(req.user.id);
        let tokensUsedToday: any = await redis.get(budgetKey);

        if (tokensUsedToday === null) {
            const usage = await prisma.usageEvents.aggregate({
                where: { userId: req.user.id, timestamp: { gte: startOfUtcDay() } },
                _sum: { inputTokens: true, outputTokens: true },
            });
            tokensUsedToday = (usage._sum.inputTokens || 0) + (usage._sum.outputTokens || 0);
            await redis.set(budgetKey, tokensUsedToday, "EX", secondsUntilUtcMidnight());
        } else {
            tokensUsedToday = Number(tokensUsedToday);
        }

        if (tokensUsedToday >= DAILY_TOKEN_BUDGET) {
            throw new ApiError(
                429,
                `Daily token budget reached: ${tokensUsedToday} of ${DAILY_TOKEN_BUDGET} tokens used today. Resets at 00:00 UTC.`,
            );
        }
    }

    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
            chatSources: {
                orderBy: { createdAt: "asc" },
                include: {
                    documentTree: true,
                },
            },
        },
    });
    if (!chat) {
        throw new ApiError(404, "Chat not found.");
    }

    if (chat.status === "QUEUED" || chat.status === "PROCESSING") {
        throw new ApiError(409, "Chat is still indexing your docs — please try again in a moment.");
    }

    if (chat.status === "FAILED") {
        throw new ApiError(
            409,
            "Chat ingestion failed. Please re-ingest the documentation or check the docs URL and try again.",
        );
    }
    let openai: OpenAI;
    let modelId = model;
    let apiKeyId: string | null = null;
    let resolvedApiKey: any = null;

    if (provider == "DEFAULT") {
        if (model === "default-1") modelId = "openai/gpt-oss-20b:free";
        else if (model === "default-2") modelId = "nvidia/nemotron-3-ultra-550b-a55b:free";
        else throw new ApiError(400, "Invalid model selection for default provider.");

        openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: config.llm.openRouterLlmApiKey,
        });
    } else {
        const apiKey = await prisma.apiKey.findFirst({
            where: {
                userId: req.user.id,
                provider,
            },
            orderBy: { createdAt: "asc" },
        });

        if (!apiKey) {
            throw new ApiError(
                400,
                `No API key found for this provider (${provider}). Please configure it in your settings.`,
            );
        }
        resolvedApiKey = apiKey;
        apiKeyId = apiKey.id;
        if (apiKey.userId !== req.user.id) {
            throw new ApiError(403, "You do not have access to this API key.");
        }
        if (!LLM_MODELS[apiKey.provider]?.includes(model)) {
            throw new ApiError(400, "Invalid model for the selected API key.");
        }

        openai = new OpenAI({
            baseURL: PROVIDERS_BASE_URLS[apiKey.provider],
            apiKey: decryptApiKey(apiKey.encryptedKey, apiKey.iv, apiKey.tag),
        });
    }

    let relevantSources: any[] = [];
    const relevantNodes: any[] = [];

    const useRagV1 = config.rag?.v1Enabled === true;
    if (useRagV1) {
        const embeddingModel = config.llm.embeddingModel;
        const dimensions = getEmbeddingDimensionsForModel(embeddingModel);
        try {
            const v1 = await searchWebRagV1({
                query: userPrompt,
                chatId,
                indexVersion: config.rag.indexVersion,
                embeddingModel,
                dimensions,
                limit: config.rag.retrievalCandidateLimit,
                minScore: 0.3,
            }, { prisma, embed: generateVectorEmbeddings, qdrant });
            relevantSources = v1.map((result) => ({
                id: result.metadata.chunkId || result.metadata.documentId,
                score: result.relevance,
                payload: { body: result.snippet, title: result.title, url: result.pageUrl, ...result.metadata },
            }));
            const shouldReadLegacy = config.rag.dualReadEnabled || (relevantSources.length === 0 && config.rag.allowLegacyAvailabilityFallback);
            if (shouldReadLegacy) {
                relevantSources = [...relevantSources, ...await retrieveWebChatSources({
                    query: userPrompt,
                    sources: chat.chatSources,
                    dependencies: {
                        generateEmbedding: async (query) => (await generateVectorEmbeddings(query)) as number[],
                        qdrant: { query: (collectionName, request) => qdrant.query(collectionName, request) as any },
                    },
                })];
            }
        } catch (error) {
            if (!config.rag.allowLegacyAvailabilityFallback) throw error;
            relevantSources = await retrieveWebChatSources({
                query: userPrompt,
                sources: chat.chatSources,
                dependencies: {
                    generateEmbedding: async (query) => (await generateVectorEmbeddings(query)) as number[],
                    qdrant: { query: (collectionName, request) => qdrant.query(collectionName, request) as any },
                },
            });
        }
    } else {
        relevantSources = await retrieveWebChatSources({
            query: userPrompt,
            sources: chat.chatSources,
            dependencies: {
                generateEmbedding: async (query) => (await generateVectorEmbeddings(query)) as number[],
                qdrant: { query: (collectionName, request) => qdrant.query(collectionName, request) as any },
            },
        });
    }

    let systemInstructions = "You are a documentation-grounded assistant. \n";
    if (relevantSources.length || relevantNodes.length) {
        systemInstructions +=
            "Answer only from the provided documentation evidence. If it does not establish the answer, say you don't know based on the provided documentation. Do not use general knowledge. Be concise, use Markdown, and wrap code in triple backticks.";
    } else {
        systemInstructions +=
            "No documentation evidence was retrieved. Say you don't know based on the provided documentation; do not answer from general knowledge.";
    }

    let memories: any[] = [];
    if (MEM0_ENABLED && memory) {
        try {
            memories =
                (await memory.search(userPrompt, {
                    user_id: req.user.id,
                    limit: 5,
                })) || [];
        } catch (error: any) {
            console.error("Mem0 search error (non-fatal):", error?.message || error);
        }
    }

    const messages = await prisma.chatMessage.findMany({
        where: { chatId },
        take: -40,
        orderBy: { createdAt: "asc" },
    });

    const messagesForLLM = buildMessagesForLLM({
        systemInstructions,
        relevantSources,
        relevantNodes,
        memories,
        history: messages,
        userPrompt,
    });

    const stream = await openai.chat.completions.create({
        model: modelId,
        messages: messagesForLLM as any,
        stream: true,
        stream_options: { include_usage: true },
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let llmResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";

            if (chunk.usage) {
                inputTokens = chunk.usage.prompt_tokens;
                outputTokens = chunk.usage.completion_tokens;
            }
            if (content) {
                llmResponse += content;
                res.write(content);
            }
        }
    } catch (error: any) {
        res.write(
            `\n\ndata: {"error": "Stream ended with error: ${error.message.replace(/\n/g, " ")}"}\n\n`,
        );
    } finally {
        res.end();
    }

    if (llmResponse.trim()) {
        if (MEM0_ENABLED && memory) {
            try {
                await memory.add(
                    [
                        { role: "user", content: userPrompt },
                        { role: "assistant", content: llmResponse },
                    ],
                    {
                        user_id: req.user.id,
                        custom_instructions:
                            "Note: Store this interaction history for future reference.",
                    },
                );
            } catch (error: any) {
                console.error("Mem0 add error (non-fatal):", error?.message || error);
            }
        }

        const chatMessage = await prisma.chatMessage.create({
            data: {
                chatId,
                llmModel: model,
                llmResponse,
                userPrompt,
            },
        });

        if (relevantSources.length) {
            await prisma.chatMessageSource.createMany({
                data: relevantSources.map((point) => ({
                    chunkText: point.payload.body,
                    heading: point.payload.title,
                    pageUrl: point.payload.url,
                    chatMessageId: chatMessage.id,
                    score: Math.round(point.score * 100),
                })),
            });
        }
        if (relevantNodes.length) {
            await prisma.chatMessageSource.createMany({
                data: relevantNodes.map((node) => ({
                    chunkText: node.data,
                    heading: node.heading,
                    pageUrl: node.pageUrl,
                    chatMessageId: chatMessage.id,
                })),
            });
        }

        const usageCost = estimateUsageCostUsd({
            provider: provider === "DEFAULT" ? "DEFAULT" : resolvedApiKey?.provider,
            model,
            inputTokens,
            outputTokens,
        });

        let usageEventData: any = {
            userId: req.user.id,
            messageId: chatMessage.id,
            inputTokens,
            outputTokens,
            chatId: chat.id,
            estimatedCostUsd: usageCost.estimatedCostUsd,
            priceVersion: usageCost.priceVersion,
        };
        if (model != "default" && provider != "DEFAULT" && apiKeyId) {
            usageEventData = {
                ...usageEventData,
                apikeyId: apiKeyId,
            };
        }
        await prisma.usageEvents.create({
            data: usageEventData,
        });

        await createAuditEvent("message.sent", req.user.id, chat.id, {
            chatMessageId: chatMessage.id,
            model,
            provider,
            inputTokens,
            outputTokens,
        });
        if (DAILY_TOKEN_BUDGET) {
            const budgetKey = dailyBudgetKey(req.user.id);
            await redis.incrby(budgetKey, (inputTokens || 0) + (outputTokens || 0));
            await redis.expire(budgetKey, secondsUntilUtcMidnight());
        }
    }
});

const getChatMessages = asyncHandler(async (req: Request, res: Response) => {
    const chatId = req.params.chatId as string;
    const limit = Number(req.query.limit ?? 50);
    const cursor = (req.query.cursor as string) || undefined;

    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
    });

    if (!chat) {
        throw new ApiError(404, "Chat not found.");
    }

    const messages = await prisma.chatMessage.findMany({
        where: { chatId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { sourceChunks: true },
    });

    const hasMore = messages.length > limit;
    const pageMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id || null : null;
    const orderedMessages = pageMessages.reverse();

    if (!orderedMessages.length) {
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { messages: [], nextCursor: null, hasMore: false },
                    "No messages found for this chat.",
                ),
            );
    }

    const messagesWithMeta = orderedMessages.map(({ sourceChunks, ...msg }: any) => ({
        ...msg,
        hasSystemInstructions: (sourceChunks || []).length > 0,
    }));

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { messages: messagesWithMeta, nextCursor, hasMore },
                "Chat messages retrieved successfully.",
            ),
        );
});

const exportChatMessages = asyncHandler(async (req: Request, res: Response) => {
    const { format = "txt" } = req.query as { format?: string };
    const chatId = req.params.chatId as string;

    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
    });

    if (!chat) {
        throw new ApiError(404, "Chat not found.");
    }

    const messages = await prisma.chatMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
    });

    const escapeForPlainText = (text?: string | null) => text || "";

    const chatName = chat.name || "Untitled Chat";
    if (format === "md") {
        let markdown = `# ${chatName}\n\n`;

        messages.forEach((msg, index) => {
            markdown += `## Message ${index + 1}\n\n`;
            markdown += `### User\n\n${msg.userPrompt}\n\n`;
            markdown += `### Assistant\n\n${msg.llmResponse}\n\n`;
        });

        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="chat-export-${chatId}.md"`);

        return res.send(markdown);
    }
    const exportDate = new Date();
    const header = [
        "DocChat Conversation Export",
        "===========================",
        `Chat: ${chatName}`,
        `Chat ID: ${chatId}`,
        `Exported: ${exportDate.toLocaleString()}`,
        `Total Messages: ${messages.length * 2}`,
        "",
    ].join("\n");

    if (format === "pdf") {
        const doc = new PDFDocument();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="chat-export-${chatId}.pdf"`);

        doc.pipe(res);

        doc.fontSize(18).text(chatName);
        doc.moveDown();

        messages.forEach((msg, index) => {
            doc.fontSize(14).text(`Message ${index + 1}`);
            doc.moveDown(0.5);

            doc.fontSize(12).text("User:");
            doc.text(msg.userPrompt || "");
            doc.moveDown();

            doc.text("Assistant:");
            doc.text(msg.llmResponse || "");
            doc.moveDown();
        });

        doc.end();
        return;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="chat-export-${chatId}.txt"`);
    res.setHeader("X-Accel-Buffering", "no");

    res.write(header);

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgNumber = i + 1;

        const userBlock = [
            "",
            `--- Message ${msgNumber} ---`,
            `[User] - ${new Date(msg.createdAt).toLocaleString()}`,
            "",
            escapeForPlainText(msg.userPrompt),
            "",
        ].join("\n");
        res.write(userBlock);

        const assistantBlock = [
            `--- Message ${msgNumber} ---`,
            `[Assistant] - ${new Date(msg.createdAt).toLocaleString()}`,
            `Model: ${msg.llmModel || "Unknown"}`,
            "",
            escapeForPlainText(msg.llmResponse),
            "",
        ].join("\n");
        res.write(assistantBlock);
    }

    res.write("\n--- End of Conversation ---\n");
    res.end();
});

const getChatMessageSources = asyncHandler(async (req: Request, res: Response) => {
    const messageId = req.params.messageId as string;

    const message: any = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        include: {
            chat: {
                select: { userId: true },
            },
        },
    });

    if (!message) {
        throw new ApiError(404, "Message not found.");
    }

    if (message.chat.userId !== req.user.id) {
        throw new ApiError(404, "Message not found.");
    }

    const messageSources = await prisma.chatMessageSource.findMany({
        where: { chatMessageId: messageId },
        orderBy: { score: "desc" },
    });

    if (!messageSources.length) {
        return res
            .status(200)
            .json(
                new ApiResponse(200, { messageSources: [] }, "No sources found for this chat message."),
            );
    }

    return res
        .status(200)
        .json(new ApiResponse(200, { messageSources }, "Chat message sources retrieved successfully."));
});

const getSharedChatMessageSources = asyncHandler(async (req: Request, res: Response) => {
    const shareToken = req.params.shareToken as string;
    const messageId = req.params.messageId as string;

    const chat = await prisma.chat.findUnique({
        where: { shareToken },
    });

    if (!chat) {
        throw new ApiError(404, "Shared chat not found");
    }

    const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
    });

    if (!message || message.chatId !== chat.id) {
        throw new ApiError(404, "Message not found.");
    }

    const messageSources = await prisma.chatMessageSource.findMany({
        where: { chatMessageId: messageId },
        orderBy: { score: "desc" },
    });

    if (!messageSources.length) {
        return res
            .status(200)
            .json(
                new ApiResponse(200, { messageSources: [] }, "No sources found for this chat message."),
            );
    }

    return res
        .status(200)
        .json(new ApiResponse(200, { messageSources }, "Chat message sources retrieved successfully."));
});

const getSharedChatMessages = asyncHandler(async (req: Request, res: Response) => {
    const shareToken = req.params.shareToken as string;

    const chat = await prisma.chat.findUnique({
        where: { shareToken },
    });

    if (!chat) {
        throw new ApiError(404, "Shared chat not found");
    }

    const messages = await prisma.chatMessage.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "asc" },
        include: { sourceChunks: true },
    });

    if (!messages.length) {
        return res
            .status(200)
            .json(new ApiResponse(200, { messages: [] }, "No messages found for this chat."));
    }

    const messagesWithMeta = messages.map(({ sourceChunks, ...msg }: any) => ({
        ...msg,
        hasSystemInstructions: (sourceChunks || []).length > 0,
    }));

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { messages: messagesWithMeta },
                "Chat messages retrieved successfully.",
            ),
        );
});

export {
    sendMessage,
    getAvailableModels,
    getChatMessages,
    getChatMessageSources,
    exportChatMessages,
    getSharedChatMessages,
    getSharedChatMessageSources,
};
