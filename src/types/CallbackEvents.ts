import { CitationSource } from '../utils/Formatter';

export type CallbackEventType =
    | 'chat_completed'
    | 'chat_failed'
    | 'indexing_complete'
    | 'indexing_failed';

export interface BaseCallbackEvent {
    event: CallbackEventType;
    requestId: string;
    jobId?: string;
    userId: string;
    roomId: string;
    threadId?: string | null;
}

export interface ChatCompletedCallbackEvent extends BaseCallbackEvent {
    event: 'chat_completed';
    query?: string;
    answer: string;
    placeholderId?: string | null;
    chatMessageId?: string | null;
    sources: CitationSource[];
    model?: string | null;
}

export interface ChatFailedCallbackEvent extends BaseCallbackEvent {
    event: 'chat_failed';
    error: string;
    errorCode?: string;
    query?: string | null;
    placeholderId?: string | null;
}

export interface IndexingCompleteCallbackEvent extends BaseCallbackEvent {
    event: 'indexing_complete';
    documentName: string;
    chunksCount?: number;
    sourceId?: string | null;
    placeholderId?: string | null;
}

export interface IndexingFailedCallbackEvent extends BaseCallbackEvent {
    event: 'indexing_failed';
    documentName: string;
    error: string;
    errorCode?: string;
    placeholderId?: string | null;
}

export type CallbackEvent =
    | ChatCompletedCallbackEvent
    | ChatFailedCallbackEvent
    | IndexingCompleteCallbackEvent
    | IndexingFailedCallbackEvent;

/**
 * Validates and parses raw callback payloads into typed discriminated union CallbackEvent.
 * Supports top-level envelope fields or nested `data` wrapper, and snake_case or camelCase aliases.
 */
export function validateCallbackEvent(raw: unknown): CallbackEvent {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Callback payload must be a non-null object');
    }

    const obj = raw as Record<string, unknown>;
    const nestedData = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<string, unknown>;

    const getField = <T = unknown>(...keys: string[]): T | undefined => {
        for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
            if (nestedData[k] !== undefined && nestedData[k] !== null) return nestedData[k] as T;
        }
        return undefined;
    };

    const event = getField<string>('event');
    if (!event || typeof event !== 'string' || !event.trim()) {
        throw new Error('Missing required field: "event"');
    }

    const validEvents: CallbackEventType[] = [
        'chat_completed',
        'chat_failed',
        'indexing_complete',
        'indexing_failed',
    ];

    if (!validEvents.includes(event as CallbackEventType)) {
        throw new Error(`Unsupported callback event: "${event}"`);
    }

    const userId = getField<string>('user_id', 'userId');
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
        throw new Error('Missing required field: "user_id"');
    }

    const roomId = getField<string>('room_id', 'roomId');
    if (!roomId || typeof roomId !== 'string' || !roomId.trim()) {
        throw new Error('Missing required field: "room_id"');
    }

    const requestId = getField<string>('request_id', 'requestId');
    const jobId = getField<string>('job_id', 'jobId');
    const placeholderId = getField<string | null>('placeholder_id', 'placeholderId') ?? null;
    const threadId = getField<string | null>('thread_id', 'threadId') ?? null;
    const sourceId = getField<string | null>('source_id', 'sourceId') ?? null;

    // Determine canonical request ID (fallback to jobId, placeholderId, sourceId or deterministic legacy key)
    const effectiveRequestId = (requestId && typeof requestId === 'string' && requestId.trim())
        ? requestId.trim()
        : (jobId && typeof jobId === 'string' && jobId.trim())
            ? jobId.trim()
            : (placeholderId && typeof placeholderId === 'string' && placeholderId.trim())
                ? placeholderId.trim()
                : (sourceId && typeof sourceId === 'string' && sourceId.trim())
                    ? sourceId.trim()
                    : `legacy-${userId}-${roomId}`;

    const baseEvent: BaseCallbackEvent = {
        event: event as CallbackEventType,
        requestId: effectiveRequestId,
        jobId: jobId ? String(jobId).trim() : undefined,
        userId: userId.trim(),
        roomId: roomId.trim(),
        threadId: threadId ? String(threadId).trim() : null,
    };

    switch (event) {
        case 'chat_completed': {
            const answer = getField<string>('answer');
            if (typeof answer !== 'string') {
                throw new Error('Missing required field "answer" for chat_completed event');
            }

            const query = getField<string>('query');
            const rawSources = getField<Array<Record<string, unknown>>>('sources') || [];
            const sources: CitationSource[] = Array.isArray(rawSources)
                ? rawSources.map((s) => {
                    let relevance = typeof s.relevance === 'number' ? s.relevance : 0;
                    if (typeof s.score === 'number' && !s.relevance) {
                        relevance = (s.score as number) > 1 ? (s.score as number) / 100 : (s.score as number);
                    }
                    return {
                        title: (s.title as string) || (s.heading as string) || 'Document',
                        snippet: (s.snippet as string) || (s.chunkText as string) || (s.body as string) || '',
                        pageUrl: (s.pageUrl as string) || (s.url as string) || '',
                        relevance: isNaN(relevance) ? 0 : relevance,
                    };
                })
                : [];

            const chatMessageId = getField<string | null>('chat_message_id', 'chatMessageId') ?? null;
            const model = getField<string | null>('model') ?? null;

            return {
                ...baseEvent,
                event: 'chat_completed',
                answer,
                query: query !== undefined ? String(query) : undefined,
                placeholderId,
                chatMessageId,
                sources,
                model,
            };
        }

        case 'chat_failed': {
            const error = getField<string>('error');
            if (typeof error !== 'string' || !error.trim()) {
                throw new Error('Missing required field "error" for chat_failed event');
            }
            const errorCode = getField<string>('error_code', 'errorCode');
            const query = getField<string | null>('query') ?? null;

            return {
                ...baseEvent,
                event: 'chat_failed',
                error: error.trim(),
                errorCode: errorCode ? String(errorCode) : undefined,
                query,
                placeholderId,
            };
        }

        case 'indexing_complete': {
            const docName = getField<string>('document_name', 'filename', 'documentName');
            if (typeof docName !== 'string' || !docName.trim()) {
                throw new Error('Missing required field "document_name" (or "filename") for indexing_complete event');
            }
            const chunksCount = getField<number>('chunks_count', 'chunksCount');

            return {
                ...baseEvent,
                event: 'indexing_complete',
                documentName: docName.trim(),
                chunksCount: typeof chunksCount === 'number' ? chunksCount : undefined,
                sourceId,
                placeholderId,
            };
        }

        case 'indexing_failed': {
            const docName = getField<string>('document_name', 'filename', 'documentName');
            if (typeof docName !== 'string' || !docName.trim()) {
                throw new Error('Missing required field "document_name" (or "filename") for indexing_failed event');
            }
            const error = getField<string>('error');
            if (typeof error !== 'string' || !error.trim()) {
                throw new Error('Missing required field "error" for indexing_failed event');
            }
            const errorCode = getField<string>('error_code', 'errorCode');

            return {
                ...baseEvent,
                event: 'indexing_failed',
                documentName: docName.trim(),
                error: error.trim(),
                errorCode: errorCode ? String(errorCode) : undefined,
                placeholderId,
            };
        }
        default:
            throw new Error(`Unhandled callback event: "${event}"`);
    }
}
