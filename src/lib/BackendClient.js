"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendClient = void 0;
const Errors_1 = require("../constants/Errors");
const Validator_1 = require("../utils/Validator");
class BackendClient {
    constructor(http, read) {
        this.http = http;
        this.read = read;
    }
    async ask(query, userId, roomId, history) {
        try {
            const response = await this.post('/api/chat', {
                query,
                user_id: userId,
                room_id: roomId,
                history: history || [],
            });
            const data = this.asData(response);
            return {
                answer: data.answer || 'No answer received.',
                sources: data.sources || [],
                model: data.model || 'unknown',
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async search(query, topK = 5, userId, roomId) {
        try {
            const response = await this.post('/api/search', {
                query,
                top_k: topK,
                user_id: userId,
                room_id: roomId,
            });
            const data = this.asData(response);
            return data.results || [];
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async summarize(text) {
        try {
            const response = await this.post('/api/summarize', { text });
            return this.asData(response).summary || 'No summary generated.';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async explain(concept) {
        try {
            const response = await this.post('/api/explain', { concept });
            return this.asData(response).explanation || 'No explanation generated.';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async listDocuments() {
        try {
            const response = await this.get('/api/documents');
            const data = this.asData(response);
            return data.documents || [];
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async translate(text, targetLang = 'vi') {
        try {
            const response = await this.post('/api/translate', {
                text,
                target_lang: targetLang,
            });
            return this.asData(response).translation || 'No translation generated.';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    asData(response) {
        const data = response.data;
        return data && typeof data === 'object' ? data : {};
    }
    async getBackendUrl() {
        const settings = this.read.getEnvironmentReader().getSettings();
        const url = await settings.getValueById('backend-url');
        if (!url || typeof url !== 'string' || !Validator_1.Validator.isValidUrl(url.trim())) {
            throw new Error(Errors_1.ERRORS.SETTING_NOT_CONFIGURED('backend-url'));
        }
        return url.trim().replace(/\/+$/, '');
    }
    async getApiKey() {
        const settings = this.read.getEnvironmentReader().getSettings();
        const key = await settings.getValueById('api-key');
        return typeof key === 'string' ? key : '';
    }
    async post(path, data) {
        const response = await this.http.post(`${await this.getBackendUrl()}${path}`, {
            data,
            headers: await this.buildHeaders(),
            timeout: 60000,
        });
        this.assertSuccess(response);
        return response;
    }
    async get(path) {
        const response = await this.http.get(`${await this.getBackendUrl()}${path}`, {
            headers: await this.buildHeaders(),
            timeout: 60000,
        });
        this.assertSuccess(response);
        return response;
    }
    assertSuccess(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(Errors_1.ERRORS.BACKEND_ERROR(response.statusCode));
        }
    }
    async buildHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        const apiKey = await this.getApiKey();
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        return headers;
    }
}
exports.BackendClient = BackendClient;
