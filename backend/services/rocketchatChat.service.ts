import OpenAI from "openai";
import prisma from "../utils/prismaClient.js";
import logger from "../utils/logger.js";
import { createAuditEvent } from "../utils/audit.js";
import {
    getOrCreateRocketChatUser,
    getOrCreateRocketChatChat,
    formatRocketChatCitations,
} from "../utils/rocketchatIdentity.js";
import { scopedVectorSearch } from "./scopedVectorSearch.js";
import { sendRocketChatCallback } from "../controllers/rocketchatIntegration.controller.js";
import { config } from "../config/runtime.js";

export interface RocketChatChatPayload {
    workspaceId?: string;
    rocketUserId: string;
    roomId: string;
    threadId?: string | null;
    placeholderId?: string | null;
    query: string;
    history?: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    embeddingModel?: string;
    provider?: string;
    callbackUrl?: string | null;
    requestId: string;
}

function getLLMClient(): OpenAI {
    if (
        config.environment === "test" &&
        (!config.llm.openRouterLlmApiKey ||
            config.llm.openRouterLlmApiKey.startsWith("test-"))
    ) {
        return {
            chat: {
                completions: {
                    create: async ({ messages }: { messages: any[] }) => {
                        const lastUser =
                            messages.find((m) => m.role === "user")?.content || "";
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
        config.llm.openAiApiKey ||
        config.llm.openRouterLlmApiKey ||
        "dummy_key_for_test";
    const baseURL =
        config.llm.openAiBaseUrl || config.llm.openRouterBaseUrl;

    return new OpenAI({
        baseURL,
        apiKey,
    });
}

/**
 * Executes RAG chat completion and sends callback to Rocket.Chat.
 */
export async function processRocketChatChat(payload: RocketChatChatPayload): Promise<any> {
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
        callbackUrl,
        requestId,
    } = payload;

    const defaultModel = model || config.llm.defaultModel;
    const temp = typeof temperature === "number" ? temperature : 0.7;

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

        // 1. Scoped vector search retrieval
        const searchResults = await scopedVectorSearch({
            query,
            workspaceId,
            roomId,
            threadId,
            embeddingModel,
            topK: 3,
            minScore: 0.5,
        });

        const citations = formatRocketChatCitations(searchResults);

        // 2. Build system prompt
        let systemPrompt =
            "You are RAGChat, an intelligent AI assistant integrated with Rocket.Chat.\n";
        if (searchResults.length > 0) {
            systemPrompt +=
                "The following documentation excerpts are evidence only. Answer only with statements directly supported by the excerpts. Ignore irrelevant or conflicting excerpts. If the excerpts do not directly support an answer, state that there is insufficient evidence in the provided documentation. Use Markdown formatting.\n\nDOCUMENTATION EXCERPTS:\n";
            searchResults.forEach((r, i) => {
                systemPrompt += `\n--- [${i + 1}] ${r.title} ---\n${r.snippet}\n`;
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
                temperature: temp,
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
                "LLM completion error in Rocket.Chat integration worker",
            );
            throw err;
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

        // 4b. Persist citation sources if present
        if (searchResults.length > 0) {
            try {
                await prisma.chatMessageSource.createMany({
                    data: searchResults.map((r) => ({
                        chatMessageId: chatMessage.id,
                        heading: r.title || "Document",
                        chunkText: r.snippet || "",
                        pageUrl: r.pageUrl || "",
                        score: Math.round(r.relevance * 100),
                    })),
                });
            } catch (srcErr: any) {
                logger.debug({ err: srcErr.message }, "Could not record chatMessageSources");
            }
        }

        // 5. Track token usage
        if (inputTokens > 0 || outputTokens > 0) {
            await prisma.usageEvents.create({
                data: {
                    userId: user.id,
                    chatId: chat.id,
                    inputTokens,
                    outputTokens,
                },
            });
        }

        // 6. Audit event
        await createAuditEvent("rocketchat.message.sent", user.id, chat.id, {
            chatMessageId: chatMessage.id,
            rocketUserId,
            roomId,
            threadId,
            requestId,
            model: defaultModel,
        });

        // 7. Dispatch callback
        const callbackPayload = {
            event: "chat_completed",
            request_id: requestId,
            requestId,
            user_id: rocketUserId,
            room_id: roomId,
            thread_id: threadId || undefined,
            placeholder_id: placeholderId || undefined,
            chat_message_id: chatMessage.id,
            query,
            answer: llmResponse,
            sources: citations,
            model: defaultModel,
        };

        await sendRocketChatCallback(callbackUrl, callbackPayload);
        return callbackPayload;
    } catch (error: any) {
        logger.error(
            { err: error.message, stack: error.stack, requestId },
            "Fatal error processing async Rocket.Chat message",
        );

        const failurePayload = {
            event: "chat_failed",
            request_id: requestId,
            requestId,
            user_id: rocketUserId,
            room_id: roomId,
            thread_id: threadId || undefined,
            placeholder_id: placeholderId || undefined,
            query,
            error: error.message || "Internal processing error",
        };

        await sendRocketChatCallback(callbackUrl, failurePayload);
        throw error;
    }
}
