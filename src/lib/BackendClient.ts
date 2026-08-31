import {
    IHttp,
    IHttpResponse,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ERRORS } from '../constants/Errors';
import { ChatMessage } from '../persistence/sessionStore';
import { CitationSource } from '../utils/Formatter';
import { Validator } from '../utils/Validator';

export interface BackendAskResponse {
    answer: string;
    sources: CitationSource[];
    model: string;
}

export interface SearchResult {
    title: string;
    snippet: string;
    relevance: number;
    metadata: Record<string, unknown>;
}

/**
 * HTTP Client wrapper for communicating with the Python FastAPI RAG backend.
 *
 * Responsibilities:
 * - Dynamic base URL and API key resolution from App Settings.
 * - Header generation (Content-Type, Authorization: Bearer).
 * - Synchronous and Asynchronous Q&A operations (`ask`, `askAsync`).
 * - Document search, summarization, explanation, and translation.
 * - HTTP status code assertion (treating non-2xx as error and parsing detail).
 */
export class BackendClient {
    constructor(
        private http: IHttp,
        private read: IRead,
    ) {}

    /**
     * Synchronous Q&A request to `/api/chat`.
     * Note: Prefer `askAsync` for user-facing commands to prevent Deno 10s execution timeout.
     */
    public async ask(
        query: string,
        userId: string,
        roomId: string,
        history?: ChatMessage[],
    ): Promise<BackendAskResponse> {
        try {
            const response = await this.post('/api/chat', {
                query,
                user_id: userId,
                room_id: roomId,
                history: history || [],
            });
            const data = this.asData(response);

            return {
                answer: (data.answer as string) || 'No answer received.',
                sources: (data.sources as CitationSource[]) || [],
                model: (data.model as string) || 'unknown',
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Enqueues an asynchronous RAG job to `/api/chat/async`.
     *
     * The backend returns HTTP 202 immediately (<1s). Once the ARQ worker completes
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
    ): Promise<{ status: string; job_id: string; request_id: string }> {
        const reqId = requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        try {
            const response = await this.post('/api/chat/async', {
                query,
                request_id: reqId,
                user_id: userId,
                room_id: roomId,
                thread_id: threadId || null,
                placeholder_id: placeholderId || null,
                history: history || [],
            });
            const data = this.asData(response);
            return {
                status: (data.status as string) || 'accepted',
                job_id: (data.job_id as string) || '',
                request_id: (data.request_id as string) || reqId,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Executes semantic search across indexed document embeddings via `/api/search`.
     */
    public async search(
        query: string,
        topK: number = 5,
        userId?: string,
        roomId?: string,
    ): Promise<SearchResult[]> {
        try {
            const response = await this.post('/api/search', {
                query,
                top_k: topK,
                user_id: userId,
                room_id: roomId,
            });
            const data = this.asData(response);

            return (data.results as SearchResult[]) || [];
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Calls text summarization endpoint via `/api/summarize`.
     */
    public async summarize(text: string): Promise<string> {
        try {
            const response = await this.post('/api/summarize', { text });
            return (this.asData(response).summary as string) || 'No summary generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Calls concept explanation endpoint via `/api/explain`.
     */
    public async explain(concept: string): Promise<string> {
        try {
            const response = await this.post('/api/explain', { concept });
            return (this.asData(response).explanation as string) || 'No explanation generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Retrieves the list of indexed documents from `/api/documents`.
     */
    public async listDocuments(): Promise<Array<{
        id: string;
        filename: string;
        chunks_count: number;
        created_at?: string;
    }>> {
        try {
            const response = await this.get('/api/documents');
            const data = this.asData(response);
            return (data.documents as Array<{
                id: string;
                filename: string;
                chunks_count: number;
                created_at?: string;
            }>) || [];
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Translates input text into the target language via `/api/translate`.
     */
    public async translate(
        text: string,
        targetLang: string = 'vi',
    ): Promise<string> {
        try {
            const response = await this.post('/api/translate', {
                text,
                target_lang: targetLang,
            });
            return (this.asData(response).translation as string) || 'No translation generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    /**
     * Coerces response body to a plain Record object, preventing TypeError on missing payload.
     */
    private asData(response: IHttpResponse): Record<string, unknown> {
        const data = response.data;
        return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    }

    /**
     * Resolves and validates the backend URL from app settings.
     */
    private async getBackendUrl(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();
        const url = await settings.getValueById('backend-url');

        if (!url || typeof url !== 'string' || !Validator.isValidUrl(url.trim())) {
            throw new Error(ERRORS.SETTING_NOT_CONFIGURED('backend-url'));
        }

        return url.trim().replace(/\/+$/, '');
    }

    /**
     * Resolves the API key from app settings.
     */
    private async getApiKey(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();
        const key = await settings.getValueById('api-key');
        return typeof key === 'string' ? key : '';
    }

    /**
     * Executes HTTP POST request to backend with headers and timeout.
     */
    public async post(
        path: string,
        data: unknown,
    ): Promise<IHttpResponse> {
        const response = await this.http.post(`${await this.getBackendUrl()}${path}`, {
            data,
            headers: await this.buildHeaders(),
            timeout: 60000,
        });

        this.assertSuccess(response);
        return response;
    }

    /**
     * Executes HTTP GET request to backend with headers and timeout.
     */
    public async get(path: string): Promise<IHttpResponse> {
        const response = await this.http.get(`${await this.getBackendUrl()}${path}`, {
            headers: await this.buildHeaders(),
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
            let detail = '';
            if (response.data && typeof response.data === 'object' && 'detail' in response.data) {
                detail = String((response.data as { detail: unknown }).detail);
            } else if (response.content) {
                try {
                    const parsed = JSON.parse(response.content);
                    if (parsed && typeof parsed === 'object' && parsed.detail) {
                        detail = String(parsed.detail);
                    }
                } catch {
                    // Not JSON content
                }
            }
            if (detail) {
                throw new Error(`Backend error (${response.statusCode}): ${detail}`);
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

        const apiKey = await this.getApiKey();
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
    }
}

