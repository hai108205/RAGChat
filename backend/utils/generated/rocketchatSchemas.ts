/**
 * Auto-generated / standardized Zod schemas for Rocket.Chat integration contract.
 * Based on OpenAPI 3.1 specification at contracts/rocketchat-integration.openapi.yaml.
 */
import { z } from "zod";

export const ALLOWED_LLM_MODELS = [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "anthropic/claude-3-5-sonnet",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.1-70b-instruct",
] as const;

export const ALLOWED_EMBEDDING_MODELS = [
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002",
] as const;

export const llmModelSchema = z.string().optional();
export const embeddingModelSchema = z.string().optional();
export const temperatureSchema = z.coerce.number().min(0).max(2).optional();

export const chatMessageHistorySchema = z.object({
    role: z.string(),
    content: z.string(),
});

export const rocketchatAsyncMessageSchema = {
    body: z.object({
        workspaceId: z.string().optional(),
        rocketUserId: z.string().min(1, "rocketUserId is required"),
        roomId: z.string().min(1, "roomId is required"),
        threadId: z.string().optional().nullable(),
        placeholderId: z.string().optional().nullable(),
        requestId: z.string().min(1, "requestId is required"),
        query: z.string().min(1, "query is required"),
        history: z.array(chatMessageHistorySchema).optional(),
        model: z.string().regex(/^[a-zA-Z0-9_./-]+$/, "Invalid model identifier").optional(),
        provider: z.string().optional(),
        embeddingModel: z.string().regex(/^[a-zA-Z0-9_./-]+$/, "Invalid embedding model identifier").refine((val) => !val || ALLOWED_EMBEDDING_MODELS.some((m) => val.includes(m) || m.includes(val)), { message: "Unsupported embedding model" }).optional(),
        temperature: temperatureSchema,
        callbackUrl: z.string().optional().nullable(),
    }),
};

export const rocketchatStatsSchema = {
    query: z.object({
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
        threadId: z.string().optional(),
    }),
};

export const rocketchatSourcesQuerySchema = {
    query: z.object({
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
        threadId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
};

export const rocketchatSourceIdParamSchema = {
    params: z.object({
        id: z.string().uuid("Invalid source ID"),
    }),
};

export const rocketchatDeleteSourceSchema = {
    params: z.object({
        id: z.string().uuid("Invalid source ID"),
    }),
    query: z.object({
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
        mode: z.enum(["room", "global"]).default("room"),
    }),
};

export const rocketchatFeedbackSchema = {
    body: z.object({
        messageId: z.string().optional(),
        chatMessageId: z.string().uuid("Invalid chatMessageId").optional(),
        rating: z.enum(["positive", "negative"]),
        feedbackText: z.string().max(2000).optional(),
        rocketUserId: z.string().min(1, "rocketUserId is required"),
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
    }),
};

export const rocketchatBase64SourceSchema = {
    body: z.object({
        workspaceId: z.string().optional(),
        rocketUserId: z.string().min(1, "rocketUserId is required"),
        roomId: z.string().min(1, "roomId is required"),
        threadId: z.string().optional().nullable(),
        filename: z.string().min(1, "filename is required"),
        contentBase64: z.string().min(1, "contentBase64 is required"),
        contentType: z.string().optional().nullable(),
        embeddingModel: z.string().regex(/^[a-zA-Z0-9_./-]+$/, "Invalid embedding model identifier").optional(),
        requestId: z.string().min(1, "requestId is required"),
        callbackUrl: z.string().optional().nullable(),
    }),
};

export const rocketchatUtilityCompletionSchema = {
    body: z.object({
        operation: z.enum(["summarize", "explain", "translate", "search"]),
        text: z.string().optional(),
        targetLang: z.string().optional(),
        concept: z.string().optional(),
        query: z.string().optional(),
        topK: z.coerce.number().int().min(1).max(50).default(5),
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
        temperature: temperatureSchema,
    }),
};

export const errorEnvelopeSchema = z.object({
    statusCode: z.number().int(),
    success: z.literal(false),
    data: z.null(),
    message: z.string(),
    errors: z.array(z.union([z.string(), z.object({ field: z.string(), message: z.string() })])),
});

export const citationSourceSchema = z.object({
    title: z.string(),
    snippet: z.string().optional().nullable(),
    pageUrl: z.string().optional().nullable(),
    relevance: z.number().optional().nullable(),
});

export const chatCompletedCallbackSchema = z.object({
    event: z.literal("chat_completed"),
    request_id: z.string(),
    user_id: z.string(),
    room_id: z.string(),
    thread_id: z.string().optional().nullable(),
    placeholder_id: z.string().optional().nullable(),
    query: z.string(),
    answer: z.string(),
    sources: z.array(citationSourceSchema).optional(),
    model: z.string().optional().nullable(),
});

export const chatFailedCallbackSchema = z.object({
    event: z.literal("chat_failed"),
    request_id: z.string(),
    user_id: z.string(),
    room_id: z.string(),
    thread_id: z.string().optional().nullable(),
    placeholder_id: z.string().optional().nullable(),
    query: z.string().optional().nullable(),
    error: z.string(),
});

export const indexingCompleteCallbackSchema = z.object({
    event: z.literal("indexing_complete"),
    request_id: z.string(),
    user_id: z.string(),
    room_id: z.string(),
    thread_id: z.string().optional().nullable(),
    document_name: z.string(),
    chunks_count: z.number().int().optional().nullable(),
    sourceId: z.string().uuid().optional().nullable(),
});

export const indexingFailedCallbackSchema = z.object({
    event: z.literal("indexing_failed"),
    request_id: z.string(),
    user_id: z.string(),
    room_id: z.string(),
    thread_id: z.string().optional().nullable(),
    document_name: z.string(),
    error: z.string(),
});

export const rocketchatCallbackPayloadSchema = z.discriminatedUnion("event", [
    chatCompletedCallbackSchema,
    chatFailedCallbackSchema,
    indexingCompleteCallbackSchema,
    indexingFailedCallbackSchema,
]);
