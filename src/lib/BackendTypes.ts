import { ChatMessage } from '../persistence/sessionStore';
import { ERRORS } from '../constants/Errors';

export interface BackendResponseEnvelope<T = unknown> {
    statusCode?: number;
    statuscode?: number;
    success?: boolean;
    data?: T;
    message?: string;
    errors?: string[] | Array<{ field: string; message: string }>;
    error?: string;
    detail?: string;
    errorCode?: string;
    error_code?: string;
    requestId?: string;
    request_id?: string;
    retryable?: boolean;
}

/**
 * Structured, typed error for SDK HTTP interactions with the backend.
 * Provides machine-readable error codes/status and safe user-facing messaging.
 */
export class BackendClientError extends Error {
    public readonly statusCode: number;
    public readonly errorCode?: string;
    public readonly requestId?: string;
    public readonly errors?: Array<string | { field: string; message: string }>;
    public readonly userMessage: string;
    public readonly retryable: boolean;

    constructor(options: {
        statusCode: number;
        message: string;
        userMessage?: string;
        errorCode?: string;
        requestId?: string;
        errors?: Array<string | { field: string; message: string }>;
        retryable?: boolean;
    }) {
        super(options.message);
        this.name = 'BackendClientError';
        this.statusCode = options.statusCode;
        this.errorCode = options.errorCode;
        this.requestId = options.requestId;
        this.errors = options.errors;
        this.retryable = options.retryable ?? (options.statusCode === 429 || options.statusCode === 408 || options.statusCode >= 500);
        this.userMessage = options.userMessage || BackendClientError.getUserFacingMessage(options.statusCode, options.errorCode);

        Object.setPrototypeOf(this, BackendClientError.prototype);
    }

    public static getUserFacingMessage(statusCode: number, errorCode?: string): string {
        if (statusCode === 401 || statusCode === 403 || errorCode === 'UNAUTHORIZED' || errorCode === 'FORBIDDEN') {
            return ERRORS.AUTH_ERROR;
        }
        if (statusCode === 429 || errorCode === 'RATE_LIMIT_EXCEEDED') {
            return ERRORS.RATE_LIMIT;
        }
        if (statusCode === 504 || errorCode === 'GATEWAY_TIMEOUT') {
            return ERRORS.GATEWAY_TIMEOUT;
        }
        if (statusCode === 408 || errorCode === 'TIMEOUT') {
            return ERRORS.TIMEOUT;
        }
        if (statusCode >= 500) {
            return ERRORS.SERVER_ERROR;
        }
        return ERRORS.BACKEND_ERROR(statusCode);
    }
}

export interface BackendAskOptions {
    model?: string;
    temperature?: number;
    embeddingModel?: string;
    workspaceId?: string;
    provider?: string;
}

export interface AsyncMessagePayload {
    workspaceId?: string;
    rocketUserId: string;
    roomId: string;
    threadId?: string | null;
    placeholderId?: string | null;
    requestId: string;
    query: string;
    history?: ChatMessage[];
    model?: string;
    temperature?: number;
    embeddingModel?: string;
    provider?: string;
    callbackUrl?: string;
}

export interface AsyncMessageResponseData {
    status: string;
    jobId?: string;
    job_id?: string;
    requestId?: string;
    request_id?: string;
    duplicate?: boolean;
}

export interface StatsDocument {
    id: string;
    filename: string;
    chunks_count: number;
    created_at?: string;
}

export interface IntegrationStatsData {
    documents: StatsDocument[];
    chats?: unknown[];
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
}

export interface Base64UploadPayload {
    workspaceId?: string;
    rocketUserId: string;
    roomId: string;
    threadId?: string | null;
    filename: string;
    contentBase64: string;
    contentType?: string;
    mimeType?: string;
    requestId: string;
    embeddingModel?: string;
    callbackUrl?: string;
}

export interface Base64UploadResponseData {
    status: string;
    sourceId?: string;
    jobId?: string;
    requestId: string;
}

export interface UtilityCompletionPayload {
    operation: 'summarize' | 'explain' | 'translate' | 'search';
    text?: string;
    targetLang?: string;
    concept?: string;
    query?: string;
    topK?: number;
    workspaceId?: string;
    roomId?: string;
    model?: string;
    temperature?: number;
}

export interface SearchResult {
    title: string;
    snippet: string;
    relevance: number;
    metadata?: Record<string, unknown>;
}

export interface UtilityCompletionData {
    result?: string;
    summary?: string;
    explanation?: string;
    translation?: string;
    results?: SearchResult[];
}

export interface SourceDocument {
    id: string;
    filename: string;
    documentationUrl?: string;
    chunksCount: number;
    totalPages?: number;
    createdAt?: string;
    lastIndexedAt?: string;
    status: 'ACTIVE' | 'EMPTY' | 'FAILED';
}

export interface SourcesListData {
    sources: SourceDocument[];
}

export interface FeedbackPayload {
    messageId?: string;
    chatMessageId?: string;
    rating: 'positive' | 'negative';
    feedbackText?: string;
    rocketUserId: string;
    workspaceId?: string;
    roomId?: string;
}

