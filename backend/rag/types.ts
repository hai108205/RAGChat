export type RagStage =
    | "PARSE"
    | "NORMALIZE"
    | "CHUNK"
    | "EMBEDDING"
    | "INDEX"
    | "RETRIEVAL"
    | "CONTEXT"
    | "GENERATION";

export type RagErrorCode =
    | "INVALID_DOCUMENT"
    | "EMPTY_DOCUMENT"
    | "PARSER_FAILURE"
    | "CHUNK_VALIDATION_FAILURE"
    | "EMBEDDING_FAILURE"
    | "VECTOR_STORE_FAILURE"
    | "NO_GROUNDED_CONTEXT"
    | "QUERY_REWRITE_FAILURE"
    | "MODEL_TIMEOUT"
    | "MODEL_RATE_LIMIT"
    | "MODEL_PROVIDER_FAILURE";

export class RagStageError extends Error {
    readonly stage: RagStage;
    readonly code: RagErrorCode;
    readonly retryable: boolean;

    constructor(stage: RagStage, code: RagErrorCode, message: string, retryable: boolean, cause?: unknown) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = "RagStageError";
        this.stage = stage;
        this.code = code;
        this.retryable = retryable;
    }
}

export interface EmbeddingProfile {
    model: string;
    dimensions: number;
    key: string;
}

export function createEmbeddingProfile(model: string, dimensions: number): EmbeddingProfile {
    const normalizedModel = model.trim();
    if (!normalizedModel) throw new Error("Embedding model is required");
    if (!Number.isInteger(dimensions) || dimensions < 1) {
        throw new Error("Embedding dimensions must be a positive integer");
    }

    return {
        model: normalizedModel,
        dimensions,
        key: `${normalizedModel.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}-${dimensions}`,
    };
}

export type RagScope =
    | { kind: "web"; chatId: string }
    | { kind: "rocketchat"; workspaceId: string; roomId: string; threadId: string | null };

export function createRagScope(input: {
    kind: "web" | "rocketchat";
    chatId?: string | null;
    workspaceId?: string | null;
    roomId?: string | null;
    threadId?: string | null;
}): RagScope {
    if (input.kind === "web") {
        const chatId = input.chatId?.trim();
        if (!chatId) throw new Error("chatId is required for web RAG scope");
        return { kind: "web", chatId };
    }

    const workspaceId = input.workspaceId?.trim();
    const roomId = input.roomId?.trim();
    if (!workspaceId) throw new Error("workspaceId is required for Rocket.Chat RAG scope");
    if (!roomId) throw new Error("roomId is required for Rocket.Chat RAG scope");
    return { kind: "rocketchat", workspaceId, roomId, threadId: input.threadId?.trim() || null };
}
