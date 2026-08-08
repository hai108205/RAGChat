import {
    IHttp,
    IHttpResponse,
    IRead,
    HttpStatusCode,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ERRORS } from '../constants/Errors';
import { ChatMessage } from '../persistence/sessionStore';
import { CitationSource } from '../utils/Formatter';

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

            return {
                answer: response.data.answer || 'No answer received.',
                sources: response.data.sources || [],
                model: response.data.model || 'unknown',
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    public async search(
        query: string,
        topK: number = 5,
    ): Promise<SearchResult[]> {
        try {
            const response = await this.post('/api/search', {
                query,
                top_k: topK,
            });

            return response.data.results || [];
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    public async summarize(text: string): Promise<string> {
        try {
            const response = await this.post('/api/summarize', { text });
            return response.data.summary || 'No summary generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    public async explain(concept: string): Promise<string> {
        try {
            const response = await this.post('/api/explain', { concept });
            return response.data.explanation || 'No explanation generated.';
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
            return response.data.translation || 'No translation generated.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }

    private async getBackendUrl(): Promise<string> {
        const settings = this.read.getEnvironmentReader().getSettings();
        const url = await settings.getValueById('backend-url');

        if (!url || typeof url !== 'string') {
            throw new Error(ERRORS.SETTING_NOT_CONFIGURED('backend-url'));
        }

        return url.replace(/\/+$/, '');
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
        const baseUrl = await this.getBackendUrl();
        const apiKey = await this.getApiKey();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await this.http.post(`${baseUrl}${path}`, {
            data,
            headers,
            timeout: 60000,
        });

        if (response.statusCode >= 400) {
            throw new Error(ERRORS.BACKEND_ERROR(response.statusCode));
        }

        return response;
    }
}
