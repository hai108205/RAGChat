import {
    IHttp,
    IHttpResponse,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ERRORS } from '../constants/Errors';
import { ChatMessage } from '../persistence/sessionStore';
import { CitationSource } from '../utils/Formatter';
import { Validator } from '../utils/Validator';
import {
    AsyncMessagePayload,
    AsyncMessageResponseData,
    BackendResponseEnvelope,
    Base64UploadPayload,
    Base64UploadResponseData,
    FeedbackPayload,
    IntegrationStatsData,
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
 * Rocket.Chat Apps Engine enforces a ~10s budget on slash-command/action
 * handlers, so interactive paths must stay well under it. Async enqueue paths
 * (ask/upload) can tolerate more because they return after the backend
 * acknowledges with HTTP 202.
 */
export const HTTP_TIMEOUT = {
    /** Default for non-interactive calls (async enqueue, uploads, list/delete). */
    DEFAULT: 60000,
    /** LLM-backed utility endpoints (summarize / explain / translate). */
    UTILITY: 8000,
    /** Vector search — no LLM generation, must feel instant. */
    SEARCH: 5000,
} as const;

export { SearchResult, SourceDocument, SourcesListData, FeedbackPayload } from './BackendTypes';

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
 * - Response envelope unwrapping and detailed error extraction.
 */
export class BackendClient {
    constructor(
        private http: IHttp,
        private read: IRead,
    ) {}

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
    ): Promise<{ status: string; job_id: string; request_id: string }> {
        const reqId = requestId || `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        const payload: AsyncMessagePayload = {
            workspaceId: workspaceId || 'default',
            rocketUserId: userId,
            roomId,
            threadId: threadId || null,
            placeholderId: placeholderId || null,
            requestId: reqId,
            query,
            history: history || [],
            callbackUrl,
        };

        try {
            const response = await this.post('/api/v1/integrations/rocketchat/messages/async', payload);
            const data = this.extractData<AsyncMessageResponseData>(response);

            return {
                status: data?.status || 'accepted',
                job_id: data?.jobId || data?.job_id || `job-${reqId}`,
                request_id: data?.requestId || data?.request_id || reqId,
            };
        } catch (error: unknown) {
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
    ): Promise<StatsDocument[]> {
        try {
            const queryParams: string[] = [];
            if (workspaceId) queryParams.push(`workspaceId=${encodeURIComponent(workspaceId)}`);
            if (roomId) queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (threadId) queryParams.push(`threadId=${encodeURIComponent(threadId)}`);

            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            const response = await this.get(`/api/v1/integrations/rocketchat/stats${queryString}`);
            const data = this.extractData<IntegrationStatsData>(response);

            return data?.documents || [];
        } catch (error: unknown) {
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
    ): Promise<SourceDocument[]> {
        try {
            const queryParams: string[] = [];
            if (workspaceId) queryParams.push(`workspaceId=${encodeURIComponent(workspaceId)}`);
            if (roomId) queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (threadId) queryParams.push(`threadId=${encodeURIComponent(threadId)}`);

            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            const response = await this.get(`/api/v1/integrations/rocketchat/sources${queryString}`);
            const data = this.extractData<SourcesListData>(response);

            return data?.sources || [];
        } catch (error: unknown) {
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
    ): Promise<boolean> {
        try {
            const queryParams: string[] = [];
            if (workspaceId) queryParams.push(`workspaceId=${encodeURIComponent(workspaceId)}`);
            if (roomId) queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (mode) queryParams.push(`mode=${encodeURIComponent(mode)}`);

            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            await this.delete(`/api/v1/integrations/rocketchat/sources/${encodeURIComponent(sourceId)}${queryString}`);
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Submits answer feedback via `POST /api/v1/integrations/rocketchat/feedback`.
     */
    public async submitFeedback(
        payload: FeedbackPayload,
    ): Promise<boolean> {
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/feedback', payload);
            this.assertSuccess(response);
            return true;
        } catch (error: unknown) {
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
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/sources/base64', payload);
            const data = this.extractData<Base64UploadResponseData>(response);

            return {
                status: data?.status || 'accepted',
                sourceId: data?.sourceId,
                jobId: data?.jobId,
                requestId: data?.requestId || payload.requestId,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Summarizes text using the utility endpoint `/api/v1/integrations/rocketchat/utilities/completion`.
     * Uses a short timeout to fit within the Apps Engine ~10s handler budget.
     */
    public async summarize(text: string): Promise<string> {
        try {
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                { operation: 'summarize', text },
                HTTP_TIMEOUT.UTILITY,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.result || data?.summary || 'No summary generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Explains a concept using the utility endpoint `/api/v1/integrations/rocketchat/utilities/completion`.
     * Uses a short timeout to fit within the Apps Engine ~10s handler budget.
     */
    public async explain(concept: string): Promise<string> {
        try {
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                { operation: 'explain', concept },
                HTTP_TIMEOUT.UTILITY,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.result || data?.explanation || 'No explanation generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Translates text using the utility endpoint `/api/v1/integrations/rocketchat/utilities/completion`.
     * Uses a short timeout to fit within the Apps Engine ~10s handler budget.
     */
    public async translate(text: string, targetLang: string = 'vi'): Promise<string> {
        try {
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                { operation: 'translate', text, targetLang },
                HTTP_TIMEOUT.UTILITY,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.result || data?.translation || 'No translation generated.';
        } catch (error: unknown) {
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
    ): Promise<SearchResult[]> {
        try {
            const response = await this.post(
                '/api/v1/integrations/rocketchat/utilities/completion',
                { operation: 'search', query, topK, roomId },
                HTTP_TIMEOUT.SEARCH,
            );
            const data = this.extractData<UtilityCompletionData>(response);
            return data?.results || [];
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Synchronous ask fallback method.
     */
    public async ask(
        query: string,
        userId: string,
        roomId: string,
        _history?: ChatMessage[],
    ): Promise<BackendAskResponse> {
        try {
            const reqId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const response = await this.post('/api/v1/integrations/rocketchat/utilities/completion', {
                operation: 'explain',
                concept: query,
                roomId,
            });
            const data = this.extractData<UtilityCompletionData>(response);

            return {
                answer: data?.result || data?.explanation || 'No answer received.',
                sources: [],
                model: 'node-backend',
            };
        } catch (error: unknown) {
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
            if (envelope.data !== undefined) {
                return envelope.data;
            }
            return raw as unknown as T;
        }

        if (response.content) {
            try {
                const parsed = JSON.parse(response.content);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.data !== undefined) {
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
     * Executes HTTP POST request to backend with headers and timeout.
     * Defaults to 60s; interactive callers (commands, action handlers) should
     * pass a tighter budget via `HTTP_TIMEOUT.UTILITY` / `HTTP_TIMEOUT.SEARCH`.
     */
    public async post(
        path: string,
        data: unknown,
        timeoutMs: number = HTTP_TIMEOUT.DEFAULT,
    ): Promise<IHttpResponse> {
        const url = `${await this.getBackendUrl()}${path}`;
        const headers = await this.buildHeaders();

        const response = await this.http.post(url, {
            data,
            headers,
            timeout: timeoutMs,
        });

        this.assertSuccess(response);
        return response;
    }

    /**
     * Executes HTTP GET request to backend with headers and timeout.
     */
    public async get(path: string): Promise<IHttpResponse> {
        const url = `${await this.getBackendUrl()}${path}`;
        const headers = await this.buildHeaders();

        const response = await this.http.get(url, {
            headers,
            timeout: 60000,
        });

        this.assertSuccess(response);
        return response;
    }

    /**
     * Executes HTTP DELETE request to backend with headers and timeout.
     */
    public async delete(path: string): Promise<IHttpResponse> {
        const url = `${await this.getBackendUrl()}${path}`;
        const headers = await this.buildHeaders();

        const response = await this.http.del(url, {
            headers,
            timeout: 60000,
        });

        this.assertSuccess(response);
        return response;
    }

    /**
     * Asserts that response has a 2xx status code and extracts error detail if non-2xx.
     */
    private assertSuccess(response: IHttpResponse): void {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            let errorDetail = '';

            if (response.data && typeof response.data === 'object') {
                const env = response.data as BackendResponseEnvelope;
                if (env.message) {
                    errorDetail = env.message;
                } else if (env.detail) {
                    errorDetail = env.detail;
                } else if (env.error) {
                    errorDetail = env.error;
                } else if (Array.isArray(env.errors) && env.errors.length > 0) {
                    errorDetail = env.errors
                        .map((e) => (typeof e === 'object' && e !== null && 'message' in e ? e.message : String(e)))
                        .join(', ');
                }
            } else if (response.content) {
                try {
                    const parsed = JSON.parse(response.content);
                    if (parsed && typeof parsed === 'object') {
                        errorDetail = parsed.message || parsed.detail || parsed.error || '';
                        if (!errorDetail && Array.isArray(parsed.errors)) {
                            errorDetail = parsed.errors.join(', ');
                        }
                    }
                } catch {
                    errorDetail = response.content.slice(0, 150);
                }
            }

            if (errorDetail) {
                throw new Error(`Backend error (${response.statusCode}): ${errorDetail}`);
            }

            throw new Error(ERRORS.BACKEND_ERROR(response.statusCode));
        }
    }

    /**
     * Constructs HTTP request headers with Content-Type and Bearer auth token.
     */
    private async buildHeaders(): Promise<Record<string, string>> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const token = await this.getIntegrationToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }
}
