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
import { buildRagContext } from "../rag/context.js";
import { rewriteQueryWithStructuredOutput } from "../rag/queryRewrite.js";
import { startRagTrace } from "../rag/telemetry.js";

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

const INSUFFICIENT_DOCUMENTATION_EVIDENCE =
    "I don't have enough evidence in the provided documentation to answer this question.";

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
    const trace = startRagTrace({ requestId, roomId, workspaceId, queryLength: query.length });

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

        // 1. Rewrite only the retrieval query; preserve the original user message for the answer.
        // The structured result is validated with Zod and deliberately falls back to the original query.
        const queryRewrite = await trace.stage("QUERY_REWRITE", () => rewriteQueryWithStructuredOutput({ query, history }));
        if (queryRewrite.rewritten || queryRewrite.fallbackReason) {
            logger.debug?.(
                {
                    requestId,
                    rewritten: queryRewrite.rewritten,
                    fallbackReason: queryRewrite.fallbackReason,
                },
                "RAG retrieval query rewrite completed",
            );
        }
        const retrievalQuery = queryRewrite.query;
        const searchResults = await trace.stage("RETRIEVAL", () => scopedVectorSearch({
            query: retrievalQuery,
            workspaceId,
            roomId,
            threadId,
            embeddingModel,
            topK: 3,
            minScore: 0.3,
        }));

        const ragContext = buildRagContext(searchResults, config.rag?.contextTokenBudget ?? 5600);
        const groundedSources = ragContext.sources;
        const citations = formatRocketChatCitations(groundedSources);

        // 2. Build system prompt
        let systemPrompt =
            "You are RAGChat, an intelligent AI assistant integrated with Rocket.Chat.\n";
        if (groundedSources.length > 0) {
            systemPrompt +=
                "The following documentation excerpts are evidence only. Answer only with statements directly supported by the excerpts. Ignore irrelevant or conflicting excerpts. If the excerpts do not directly support an answer, state that there is insufficient evidence in the provided documentation. Cite sources using the bracket labels exactly as provided (for example [1]). Never invent a citation. Use Markdown formatting.\n\nDOCUMENTATION EXCERPTS:\n";
            systemPrompt += ragContext.text;
        } else {
            systemPrompt +=
                "No documentation excerpts were retrieved. State that there is insufficient evidence in the provided documentation to answer the user's question. Do not answer from general knowledge. Use Markdown formatting.";
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
        let llmResponse = groundedSources.length > 0 ? "" : INSUFFICIENT_DOCUMENTATION_EVIDENCE;
        let inputTokens = 0;
        let outputTokens = 0;

        if (groundedSources.length > 0) {
            try {
                const completion = await trace.stage("GENERATION", () => openai.chat.completions.create({
                    model: defaultModel,
                    temperature: temp,
                    messages,
                }));
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
        if (groundedSources.length > 0) {
            try {
                await prisma.chatMessageSource.createMany({
                    data: groundedSources.map((r) => ({
                        chatMessageId: chatMessage.id,
                        heading: r.title || "Document",
                        chunkText: r.snippet || "",
                        pageUrl: r.pageUrl || "",
                        score: Math.round(r.relevance * 100),
                        sourceId: r.metadata?.sourceId?.toString() || null,
                        documentId: r.metadata?.documentId?.toString() || null,
                        chunkId: r.metadata?.chunkId?.toString() || null,
                        versionHash: r.metadata?.versionHash?.toString() || null,
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
        trace.finish({ resultCount: groundedSources.length, model: defaultModel });
        return callbackPayload;
    } catch (error: any) {
        trace.finish({ errorCode: error?.code || "RAG_REQUEST_FAILED" });
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
