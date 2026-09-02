import {
    IHttp,
    IHttpResponse,
    ILogger,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ERRORS } from '../constants/Errors';
import { ChatMessage } from '../persistence/sessionStore';
import { CitationSource } from '../utils/Formatter';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';
import { Validator } from '../utils/Validator';
import { getBackendRuntimeSettings } from '../utils/BackendRuntimeSettings';
import {
    AsyncMessagePayload,
    AsyncMessageResponseData,
    BackendAskOptions,
    BackendClientError,
    BackendResponseEnvelope,
    Base64UploadPayload,
    Base64UploadResponseData,
    DeleteSourceOptions,
    DeleteSourceResponseData,
    FeedbackPayload,
    IntegrationStatsData,
    SearchOptions,
    SearchResult,
    SourceDocument,
    SourcesListData,
    StatsDocument,
    UtilityCompletionData,
} from './BackendTypes';

export interface BackendAskResponse {
    answer: string;
    sources: CitationSource[];
    model: string;
}

/**
 * HTTP timeouts (ms).
 * Rocket.Chat Apps Engine enforces execution budgets on slash-command/action
 * handlers (~10s total), so interactive paths must stay well under it.
 *
 * Budget allocation:
 * - Enqueue / Search: 5000ms (5s)
 * - Utility completion: 8000ms (8s)
 * - List / Delete / Feedback: 8000ms (8s)
 * - Default: 8000ms (8s)
 */
export const HTTP_TIMEOUT = {
    /** Enqueue operations (askAsync, uploadBase64) - must return 202 quickly within budget. */
    ENQUEUE: 5000,
    /** Vector search — no LLM generation, instant retrieval. */
    SEARCH: 5000,
    /** LLM-backed utility endpoints (summarize / explain / translate / sync ask). */
    UTILITY: 8000,
    /** Management operations (list sources/stats, delete source, feedback). */
    MANAGEMENT: 8000,
    /** Default timeout matching Apps-Engine interactive execution budget (8s). */
    DEFAULT: 8000,
} as const;

export {
    BackendAskOptions,
    SearchOptions,
    DeleteSourceOptions,
    SearchResult,
    SourceDocument,
    SourcesListData,
    FeedbackPayload,
    BackendClientError,
    BackendResponseEnvelope,
} from './BackendTypes';

/**
 * HTTP Client wrapper for communicating with the Node.js/Express RAG backend.
 *
 * Responsibilities:
 * - Dynamic base URL and Bearer integration token resolution from App Settings.
 * - Header generation (Content-Type, Authorization: Bearer <token>).
 * - Asynchronous Q&A operations mapped to `/api/v1/integrations/rocketchat/messages/async`.
 * - Integration stats mapped to `/api/v1/integrations/rocketchat/stats`.
 * - Base64 document indexing mapped to `/api/v1/integrations/rocketchat/sources/base64`.
 * - Utility text operations (summarize, explain, translate, search) mapped to `/api/v1/integrations/rocketchat/utilities/completion`.
 * - Centralized observability and structured logging for all outgoing HTTP transactions.
 */
export class BackendClient {
    private logger: Logger;

    constructor(
        private http: IHttp,
        private read: IRead,
        logger?: ILogger | Logger | null,
    ) {
        if (logger instanceof Logger) {
            this.logger = logger.child('BackendClient');
        } else {
            this.logger = new Logger(logger, 'BackendClient');
        }
    }

    /**
     * Enqueues an asynchronous RAG question answering job to the Node.js backend.
     *
     * Returns HTTP 202 immediately (<1s). Once the background worker completes
     * processing the query and generating the answer, it triggers `CallbackEndpoint.ts`
     * to update the placeholder message in the chat room.
     */
    public async askAsync(
        query: string,
        userId: string,
        roomId: string,
        threadId?: string,
        placeholderId?: string,
        history?: ChatMessage[],
        requestId?: string,
        workspaceId?: string,
        callbackUrl?: string,
        options?: BackendAskOptions,
    ): Promise<{ status: string; job_id: string; request_id: string }> {
        const reqId = requestId || createRequestId('ask');
        const runtimeSettings = await getBackendRuntimeSettings(this.read);

        const finalWorkspaceId = workspaceId || options?.workspaceId || runtimeSettings.workspaceId || 'default';
        const finalModel = options?.model || runtimeSettings.model;
        const finalTemperature = options?.temperature ?? runtimeSettings.temperature;
        const finalEmbeddingModel = options?.embeddingModel || runtimeSettings.embeddingModel;

        const payload: AsyncMessagePayload = {
            workspaceId: finalWorkspaceId,
            rocketUserId: userId,
            roomId,
            threadId: threadId || null,
            placeholderId: placeholderId || null,
            requestId: reqId,
            query,
            history: history || [],
            model: finalModel,
            temperature: finalTemperature,
            embeddingModel: finalEmbeddingModel,
            provider: options?.provider || 'DEFAULT',
            callbackUrl,
        };

        try {
            const response = await this.post('/api/v1/integrations/rocketchat/messages/async', payload, HTTP_TIMEOUT.ENQUEUE, reqId);
            const data = this.extractData<AsyncMessageResponseData>(response);

            const result = {
                status: data?.status || 'accepted',
                job_id: data?.jobId || data?.job_id || `job-${reqId}`,
                request_id: data?.requestId || data?.request_id || reqId,
            };

            return result;
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Retrieves knowledge base documents and statistics via `/api/v1/integrations/rocketchat/stats`.
     */
    public async listDocuments(
        workspaceId?: string,
        roomId?: string,
        threadId?: string,
        requestId?: string,
    ): Promise<StatsDocument[]> {
        const reqId = requestId || createRequestId('docs');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const finalWorkspaceId = workspaceId || runtimeSettings.workspaceId || 'default';

            const queryParams: string[] = [];
            if (finalWorkspaceId) queryParams.push(`workspaceId=${encodeURIComponent(finalWorkspaceId)}`);
            if (roomId) queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (threadId) queryParams.push(`threadId=${encodeURIComponent(threadId)}`);

            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            const response = await this.get(`/api/v1/integrations/rocketchat/stats${queryString}`, HTTP_TIMEOUT.MANAGEMENT, reqId);
            const data = this.extractData<IntegrationStatsData>(response);

            return data?.documents || [];
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Retrieves scoped knowledge base sources via `/api/v1/integrations/rocketchat/sources`.
     */
    public async listSources(
        workspaceId?: string,
        roomId?: string,
        threadId?: string,
        requestId?: string,
    ): Promise<SourceDocument[]> {
        const reqId = requestId || createRequestId('sources');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const finalWorkspaceId = workspaceId || runtimeSettings.workspaceId || 'default';

            const queryParams: string[] = [];
            if (finalWorkspaceId) queryParams.push(`workspaceId=${encodeURIComponent(finalWorkspaceId)}`);
            if (roomId) queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (threadId) queryParams.push(`threadId=${encodeURIComponent(threadId)}`);

            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            const response = await this.get(`/api/v1/integrations/rocketchat/sources${queryString}`, HTTP_TIMEOUT.MANAGEMENT, reqId);
            const data = this.extractData<SourcesListData>(response);

            return data?.sources || [];
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Deletes a knowledge base source via `DELETE /api/v1/integrations/rocketchat/sources/:id`.
     */
    public async deleteSource(
        sourceId: string,
        workspaceId?: string,
        roomId?: string,
        mode: 'room' | 'global' = 'room',
        requestId?: string,
        options?: DeleteSourceOptions,
    ): Promise<boolean> {
        const reqId = requestId || createRequestId('delete');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const finalWorkspaceId = workspaceId || runtimeSettings.workspaceId || 'default';

            const queryParams: string[] = [];
            if (finalWorkspaceId) queryParams.push(`workspaceId=${encodeURIComponent(finalWorkspaceId)}`);
            if (roomId) queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (mode) queryParams.push(`mode=${encodeURIComponent(mode)}`);
            if (options?.actorRocketUserId) queryParams.push(`actorRocketUserId=${encodeURIComponent(options.actorRocketUserId)}`);
            if (typeof options?.canManageSources === 'boolean') queryParams.push(`canManageSources=${options.canManageSources ? 'true' : 'false'}`);

            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            await this.delete(
                `/api/v1/integrations/rocketchat/sources/${encodeURIComponent(sourceId)}${queryString}`,
                HTTP_TIMEOUT.MANAGEMENT,
                reqId,
            );
            return true;
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Submits answer feedback via `POST /api/v1/integrations/rocketchat/feedback`.
     */
    public async submitFeedback(
        payload: FeedbackPayload,
        requestId?: string,
    ): Promise<boolean> {
        const reqId = requestId || createRequestId('feedback');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const finalWorkspaceId = payload.workspaceId || runtimeSettings.workspaceId || 'default';
            const mergedPayload: FeedbackPayload = {
                ...payload,
                workspaceId: finalWorkspaceId,
                ...(payload.actorRocketUserId ? { actorRocketUserId: payload.actorRocketUserId } : {}),
            };

            const response = await this.post('/api/v1/integrations/rocketchat/feedback', mergedPayload, HTTP_TIMEOUT.MANAGEMENT, reqId);
            this.assertSuccess(response, reqId);
            return true;
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Uploads and indexes a base64 encoded document via `/api/v1/integrations/rocketchat/sources/base64`.
     */
    public async uploadBase64(
        payload: Base64UploadPayload,
    ): Promise<Base64UploadResponseData> {
        const reqId = payload.requestId || createRequestId('upload');
        const runtimeSettings = await getBackendRuntimeSettings(this.read);

        const mergedPayload: Base64UploadPayload = {
            ...payload,
            workspaceId: payload.workspaceId || runtimeSettings.workspaceId || 'default',
            embeddingModel: payload.embeddingModel || runtimeSettings.embeddingModel,
            placeholderId: payload.placeholderId || null,
            requestId: reqId,
        };

        try {
            const response = await this.post('/api/v1/integrations/rocketchat/sources/base64', mergedPayload, HTTP_TIMEOUT.ENQUEUE, reqId);
            const data = this.extractData<Base64UploadResponseData>(response);

            return {
                status: data?.status || 'accepted',
                sourceId: data?.sourceId,
                jobId: data?.jobId,
                requestId: data?.requestId || reqId,
            };
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Summarizes text using the utility endpoint `/api/v1/integrations/rocketchat/utilities/completion`.
     * Uses a short timeout to fit within the Apps Engine ~10s handler budget.
     */
    public async summarize(
        text: string,
        requestId?: string,
        options?: { model?: string; temperature?: number; workspaceId?: string },
    ): Promise<string> {
        const reqId = requestId || createRequestId('sum');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                {
                    operation: 'summarize',
                    text,
                    workspaceId: options?.workspaceId || runtimeSettings.workspaceId || 'default',
                    model: options?.model || runtimeSettings.model,
                    temperature: options?.temperature ?? runtimeSettings.temperature,
                },
                HTTP_TIMEOUT.UTILITY,
                reqId,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.result || data?.summary || 'No summary generated.';
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Explains a concept using the utility endpoint `/api/v1/integrations/rocketchat/utilities/completion`.
     * Uses a short timeout to fit within the Apps Engine ~10s handler budget.
     */
    public async explain(
        concept: string,
        requestId?: string,
        options?: { model?: string; temperature?: number; workspaceId?: string },
    ): Promise<string> {
        const reqId = requestId || createRequestId('exp');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                {
                    operation: 'explain',
                    concept,
                    workspaceId: options?.workspaceId || runtimeSettings.workspaceId || 'default',
                    model: options?.model || runtimeSettings.model,
                    temperature: options?.temperature ?? runtimeSettings.temperature,
                },
                HTTP_TIMEOUT.UTILITY,
                reqId,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.result || data?.explanation || 'No explanation generated.';
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Translates text using the utility endpoint `/api/v1/integrations/rocketchat/utilities/completion`.
     * Uses a short timeout to fit within the Apps Engine ~10s handler budget.
     */
    public async translate(
        text: string,
        targetLang: string = 'vi',
        requestId?: string,
        options?: { model?: string; temperature?: number; workspaceId?: string },
    ): Promise<string> {
        const reqId = requestId || createRequestId('trans');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                {
                    operation: 'translate',
                    text,
                    targetLang,
                    workspaceId: options?.workspaceId || runtimeSettings.workspaceId || 'default',
                    model: options?.model || runtimeSettings.model,
                    temperature: options?.temperature ?? runtimeSettings.temperature,
                },
                HTTP_TIMEOUT.UTILITY,
                reqId,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.result || data?.translation || 'No translation generated.';
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Searches knowledge base documents via `/api/v1/integrations/rocketchat/utilities/completion`.
     * Vector search has no LLM generation step — uses the tightest timeout.
     */
    public async search(
        query: string,
        topK: number = 5,
        _userId?: string,
        roomId?: string,
        requestId?: string,
        options?: SearchOptions,
    ): Promise<SearchResult[]> {
        const reqId = requestId || createRequestId('search');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                {
                    operation: 'search',
                    query,
                    topK,
                    roomId,
                    threadId: options?.threadId,
                    workspaceId: options?.workspaceId || runtimeSettings.workspaceId || 'default',
                    embeddingModel: options?.embeddingModel || runtimeSettings.embeddingModel,
                },
                HTTP_TIMEOUT.SEARCH,
                reqId,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.results || [];
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Synchronous ask fallback method.
     */
    public async ask(
        query: string,
        _userId: string,
        roomId: string,
        _history?: ChatMessage[],
        requestId?: string,
        options?: BackendAskOptions,
    ): Promise<BackendAskResponse> {
        const reqId = requestId || createRequestId('sync');
        try {
            const runtimeSettings = await getBackendRuntimeSettings(this.read);
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                {
                    operation: 'explain',
                    concept: query,
                    roomId,
                    workspaceId: options?.workspaceId || runtimeSettings.workspaceId || 'default',
                    model: options?.model || runtimeSettings.model,
                    temperature: options?.temperature ?? runtimeSettings.temperature,
                },
                HTTP_TIMEOUT.UTILITY,
                reqId,
            );
            const data = this.extractData<UtilityCompletionData>(response);

            return {
                answer: data?.result || data?.explanation || 'No answer received.',
                sources: [],
                model: options?.model || runtimeSettings.model || 'node-backend',
            };
        } catch (error: unknown) {
            if (error instanceof BackendClientError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Unwraps data from standard `{ success, data, message, statusCode }` response envelopes.
     */
    private extractData<T>(response: IHttpResponse): T {
        const raw = response.data;
        if (raw && typeof raw === 'object') {
            const envelope = raw as BackendResponseEnvelope<T>;
            if (envelope.data !== undefined && envelope.data !== null) {
                return envelope.data;
            }
            return raw as unknown as T;
        }

        if (response.content) {
            try {
                const parsed = JSON.parse(response.content);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.data !== undefined && parsed.data !== null) {
                        return parsed.data as T;
                    }
                    return parsed as T;
                }
            } catch {
                // Not JSON content
            }
        }

        return {} as T;
    }

    /**
     * Resolves and validates the backend URL from app settings.
     */
    public async getBackendUrl(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();
        const url = await settings.getValueById('backend-url');

        if (!url || typeof url !== 'string' || !Validator.isValidUrl(url.trim())) {
            throw new Error(ERRORS.SETTING_NOT_CONFIGURED('backend-url'));
        }

        return url.trim().replace(/\/+$/, '');
    }

    /**
     * Resolves the integration authentication token from app settings.
     * Checks `integration-token` first, falling back to legacy `api-key`.
     */
    public async getIntegrationToken(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();

        try {
            const integrationToken = await settings.getValueById('integration-token');
            if (typeof integrationToken === 'string' && integrationToken.trim().length > 0) {
                return integrationToken.trim();
            }
        } catch {
            // Setting might not be configured yet
        }

        const apiKey = await settings.getValueById('api-key');
        return typeof apiKey === 'string' ? apiKey.trim() : '';
    }

    /**
     * Executes HTTP POST request to backend with headers, timeout, and structured logging.
     */
    public async post(
        path: string,
        data: unknown,
        timeoutMs: number = HTTP_TIMEOUT.DEFAULT,
        requestId?: string,
    ): Promise<IHttpResponse> {
        return this.executeHttp('POST', path, data, timeoutMs, requestId);
    }

    /**
     * Executes HTTP GET request to backend with headers, timeout, and structured logging.
     */
    public async get(
        path: string,
        timeoutMs: number = HTTP_TIMEOUT.DEFAULT,
        requestId?: string,
    ): Promise<IHttpResponse> {
        return this.executeHttp('GET', path, undefined, timeoutMs, requestId);
    }

    /**
     * Executes HTTP DELETE request to backend with headers, timeout, and structured logging.
     */
    public async delete(
        path: string,
        timeoutMs: number = HTTP_TIMEOUT.DEFAULT,
        requestId?: string,
    ): Promise<IHttpResponse> {
        return this.executeHttp('DELETE', path, undefined, timeoutMs, requestId);
    }

    /**
     * Pauses execution for the specified milliseconds.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Determines whether an HTTP request failure is eligible for automatic retry.
     * Only retries idempotent GET/DELETE requests or POST requests with correlation requestId.
     */
    private isRetryableRequest(
        method: 'GET' | 'POST' | 'DELETE',
        requestId?: string,
        statusCode?: number,
        error?: unknown,
    ): boolean {
        // Only retry idempotent GET / DELETE or POST with requestId correlation
        const isIdempotentMethod = method === 'GET' || method === 'DELETE' || (method === 'POST' && Boolean(requestId));
        if (!isIdempotentMethod) {
            return false;
        }

        // If error has explicit retryable flag
        if (error instanceof BackendClientError && error.retryable !== undefined) {
            return error.retryable;
        }

        // HTTP status-based retry decision: 429 Rate Limit, 408 Timeout, 500, 502, 503, 504 are retryable
        if (statusCode !== undefined) {
            return statusCode === 429 || statusCode === 408 || statusCode >= 500;
        }

        // Network / timeout exception (no status code)
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return (
                error.name === 'AbortError' ||
                msg.includes('timeout') ||
                msg.includes('etimedout') ||
                msg.includes('econnrefused') ||
                msg.includes('econnreset') ||
                msg.includes('network') ||
                msg.includes('fetch failed')
            );
        }

        return false;
    }

    /**
     * Parses backend response envelopes ({ statusCode, success, data, message, errors, errorCode }).
     */
    private parseEnvelope(response: IHttpResponse): BackendResponseEnvelope | null {
        if (response.data && typeof response.data === 'object') {
            return response.data as BackendResponseEnvelope;
        }
        if (response.content) {
            try {
                const parsed = JSON.parse(response.content);
                if (parsed && typeof parsed === 'object') {
                    return parsed as BackendResponseEnvelope;
                }
            } catch {
                // Non-JSON content
            }
        }
        return null;
    }

    /**
     * Centralized execution pipeline for all HTTP communication with RAG backend.
     * Implements timeout budgeting, exponential backoff retries on transient errors,
     * status sanitization, and structured logs.
     */
    private async executeHttp(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        data?: unknown,
        timeoutMs: number = HTTP_TIMEOUT.DEFAULT,
        requestId?: string,
    ): Promise<IHttpResponse> {
        const startTime = Date.now();
        const effectiveRequestId = requestId || createRequestId(method.toLowerCase());
        const sanitizedPath = this.sanitizeRoute(path);
        const maxRetries = 2;
        const initialBackoffMs = 100;
        const maxBackoffMs = 500;

        this.logger.debug('backend.request.started', {
            event: 'backend.request.started',
            operation: `http_${method.toLowerCase()}` as any,
            phase: 'start',
            outcome: 'in_progress',
            method,
            path: sanitizedPath,
            requestId: effectiveRequestId,
            details: { method, path: sanitizedPath, timeoutMs },
        });

        let lastError: unknown = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const elapsed = Date.now() - startTime;
            const remainingBudget = timeoutMs - elapsed;

            if (attempt > 0 && remainingBudget < 400) {
                break;
            }

            const attemptTimeout = attempt === 0 ? timeoutMs : Math.max(1000, Math.min(timeoutMs, remainingBudget));

            try {
                const baseUrl = await this.getBackendUrl();
                const url = `${baseUrl}${path}`;
                const headers = await this.buildHeaders(effectiveRequestId);

                let response: IHttpResponse;
                switch (method) {
                    case 'POST':
                        response = await this.http.post(url, { data, headers, timeout: attemptTimeout });
                        break;
                    case 'GET':
                        response = await this.http.get(url, { headers, timeout: attemptTimeout });
                        break;
                    case 'DELETE':
                        response = await this.http.del(url, { headers, timeout: attemptTimeout });
                        break;
                }

                this.assertSuccess(response, effectiveRequestId);

                const durationMs = Date.now() - startTime;
                this.logger.debug('backend.request.completed', {
                    event: 'backend.request.completed',
                    operation: `http_${method.toLowerCase()}` as any,
                    phase: 'complete',
                    outcome: 'success',
                    method,
                    path: sanitizedPath,
                    statusCode: response.statusCode,
                    durationMs,
                    requestId: effectiveRequestId,
                    details: { method, path: sanitizedPath, attempt: attempt + 1 },
                });

                return response;
            } catch (error: unknown) {
                lastError = error;

                let statusCode: number | undefined;
                if (error instanceof BackendClientError) {
                    statusCode = error.statusCode;
                } else if (error instanceof Error) {
                    const statusMatch = error.message.match(/\((\d{3})\)/);
                    if (statusMatch) {
                        statusCode = parseInt(statusMatch[1], 10);
                    } else if (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout')) {
                        statusCode = 408;
                    }
                }

                const canRetry = attempt < maxRetries && this.isRetryableRequest(method, effectiveRequestId, statusCode, error);

                if (canRetry) {
                    const backoff = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs);
                    if (remainingBudget > backoff + 500) {
                        this.logger.debug('backend.request.retry', {
                            event: 'backend.request.retry',
                            operation: `http_${method.toLowerCase()}` as any,
                            phase: 'start',
                            outcome: 'in_progress',
                            method,
                            path: sanitizedPath,
                            requestId: effectiveRequestId,
                            details: { attempt: attempt + 1, backoffMs: backoff, statusCode },
                        });
                        await this.sleep(backoff);
                        continue;
                    }
                }

                break;
            }
        }

        const durationMs = Date.now() - startTime;
        let statusCode = 500;
        let errorCode = 'HTTP_500';
        let errorName = 'HttpError';
        let errorMessage = 'Request failed';

        if (lastError instanceof BackendClientError) {
            statusCode = lastError.statusCode;
            errorCode = `HTTP_${statusCode}`;
            errorName = lastError.name;
            errorMessage = lastError.message;
        } else if (lastError instanceof Error) {
            errorName = lastError.name;
            errorMessage = lastError.message;
            const statusMatch = errorMessage.match(/\((\d{3})\)/);
            if (statusMatch) {
                statusCode = parseInt(statusMatch[1], 10);
                errorCode = `HTTP_${statusCode}`;
            } else if (lastError.name === 'AbortError' || errorMessage.toLowerCase().includes('timeout')) {
                statusCode = 408;
                errorCode = 'HTTP_408';
            }
        } else if (lastError) {
            errorMessage = String(lastError);
        }

        this.logger.error('backend.request.failed', {
            event: 'backend.request.failed',
            operation: `http_${method.toLowerCase()}` as any,
            phase: 'fail',
            outcome: 'failure',
            method,
            path: sanitizedPath,
            statusCode,
            durationMs,
            errorCode,
            errorName,
            errorMessage: Validator.sanitizeInput(errorMessage),
            requestId: effectiveRequestId,
            details: { method, path: sanitizedPath },
        });

        if (lastError instanceof BackendClientError) {
            throw lastError;
        } else if (lastError instanceof Error) {
            throw new BackendClientError({
                statusCode,
                message: lastError.message,
                errorCode,
                requestId: effectiveRequestId,
            });
        } else {
            throw new BackendClientError({
                statusCode: 500,
                message: ERRORS.BACKEND_UNAVAILABLE,
                requestId: effectiveRequestId,
            });
        }
    }

    /**
     * Sanitizes route path by removing query param values that could leak PII or tokens.
     */
    private sanitizeRoute(path: string): string {
        const queryIndex = path.indexOf('?');
        if (queryIndex === -1) {
            return path;
        }
        const basePath = path.slice(0, queryIndex);
        const query = path.slice(queryIndex + 1);
        const params = query.split('&').map((p) => {
            const [k] = p.split('=');
            return `${k}=***`;
        });
        return `${basePath}?${params.join('&')}`;
    }

    /**
     * Asserts that response has a 2xx status code and extracts error detail if non-2xx.
     */
    private assertSuccess(response: IHttpResponse, requestId?: string): void {
        const envelope = this.parseEnvelope(response);

        if (response.statusCode < 200 || response.statusCode >= 300 || (envelope && envelope.success === false)) {
            let errorDetail = '';
            const errorCode = envelope?.errorCode || envelope?.error_code;
            const reqId = envelope?.requestId || envelope?.request_id || requestId;

            if (envelope) {
                if (envelope.message) {
                    errorDetail = envelope.message;
                } else if (envelope.detail) {
                    errorDetail = envelope.detail;
                } else if (envelope.error) {
                    errorDetail = envelope.error;
                }

                if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
                    const formatted = envelope.errors
                        .map((e) => (typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e)))
                        .join(', ');
                    errorDetail = errorDetail ? `${errorDetail}: ${formatted}` : formatted;
                }
            } else if (response.content) {
                errorDetail = response.content.slice(0, 150);
            }

            const statusCode = response.statusCode >= 400 ? response.statusCode : (envelope?.statusCode || 500);

            const message = errorDetail
                ? `Backend error (${statusCode}): ${errorDetail}`
                : ERRORS.BACKEND_ERROR(statusCode);

            throw new BackendClientError({
                statusCode,
                message,
                errorCode,
                requestId: reqId,
                errors: envelope?.errors,
                retryable: envelope?.retryable,
            });
        }
    }

    /**
     * Constructs HTTP request headers with Content-Type, correlation ID, and Bearer auth token.
     */
    private async buildHeaders(requestId?: string): Promise<Record<string, string>> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId || createRequestId('http'),
        };

        const token = await this.getIntegrationToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }
}

