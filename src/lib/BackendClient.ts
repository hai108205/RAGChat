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

export class BackendClient {
    constructor(
        private http: IHttp,
        private read: IRead,
    ) {}

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

    public async summarize(text: string): Promise<string> {
        try {
            const response = await this.post('/api/summarize', { text });
            return (this.asData(response).summary as string) || 'No summary generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    public async explain(concept: string): Promise<string> {
        try {
            const response = await this.post('/api/explain', { concept });
            return (this.asData(response).explanation as string) || 'No explanation generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

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
     * Coerce a response body to a plain object, defaulting to ``{}`` when the
     * backend returns no JSON body. Prevents ``response.data.X`` from throwing
     * a TypeError on an empty/undefined payload.
     */
    private asData(response: IHttpResponse): Record<string, unknown> {
        const data = response.data;
        return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    }

    private async getBackendUrl(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();
        const url = await settings.getValueById('backend-url');

        if (!url || typeof url !== 'string' || !Validator.isValidUrl(url.trim())) {
            throw new Error(ERRORS.SETTING_NOT_CONFIGURED('backend-url'));
        }

        return url.trim().replace(/\/+$/, '');
    }

    private async getApiKey(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();
        const key = await settings.getValueById('api-key');
        return typeof key === 'string' ? key : '';
    }

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

    public async get(path: string): Promise<IHttpResponse> {
        const response = await this.http.get(`${await this.getBackendUrl()}${path}`, {
            headers: await this.buildHeaders(),
            timeout: 60000,
        });

        this.assertSuccess(response);
        return response;
    }

    /**
     * Treat any non-2xx status as an error. Previously only >=400 was rejected,
     * so a 3xx redirect (whose body is HTML/empty) passed through and was then
     * parsed as JSON — producing confusing downstream failures.
     */
    private assertSuccess(response: IHttpResponse): void {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(ERRORS.BACKEND_ERROR(response.statusCode));
        }
    }

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
