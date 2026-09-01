import { ChatMessage } from '../persistence/sessionStore';
import { CitationSource } from '../utils/Formatter';

export interface BackendResponseEnvelope<T = unknown> {
    statusCode?: number;
    statuscode?: number;
    success?: boolean;
    data?: T;
    message?: string;
    errors?: string[] | Array<{ field: string; message: string }>;
    error?: string;
    detail?: string;
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
    requestId: string;
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
