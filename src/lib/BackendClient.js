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
    async askAsync(query, userId, roomId, threadId, placeholderId, history, requestId, workspaceId, callbackUrl) {
        const reqId = requestId || `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const payload = {
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
            const data = this.extractData(response);
            return {
                status: (data === null || data === void 0 ? void 0 : data.status) || 'accepted',
                job_id: (data === null || data === void 0 ? void 0 : data.jobId) || (data === null || data === void 0 ? void 0 : data.job_id) || `job-${reqId}`,
                request_id: (data === null || data === void 0 ? void 0 : data.requestId) || (data === null || data === void 0 ? void 0 : data.request_id) || reqId,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async listDocuments(workspaceId, roomId, threadId) {
        try {
            const queryParams = [];
            if (workspaceId)
                queryParams.push(`workspaceId=${encodeURIComponent(workspaceId)}`);
            if (roomId)
                queryParams.push(`roomId=${encodeURIComponent(roomId)}`);
            if (threadId)
                queryParams.push(`threadId=${encodeURIComponent(threadId)}`);
            const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
            const response = await this.get(`/api/v1/integrations/rocketchat/stats${queryString}`);
            const data = this.extractData(response);
            return (data === null || data === void 0 ? void 0 : data.documents) || [];
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async uploadBase64(payload) {
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/sources/base64', payload);
            const data = this.extractData(response);
            return {
                status: (data === null || data === void 0 ? void 0 : data.status) || 'accepted',
                sourceId: data === null || data === void 0 ? void 0 : data.sourceId,
                jobId: data === null || data === void 0 ? void 0 : data.jobId,
                requestId: (data === null || data === void 0 ? void 0 : data.requestId) || payload.requestId,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async summarize(text) {
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/utilities/completion', {
                operation: 'summarize',
                text,
            });
            const data = this.extractData(response);
            return (data === null || data === void 0 ? void 0 : data.result) || (data === null || data === void 0 ? void 0 : data.summary) || 'No summary generated.';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async explain(concept) {
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/utilities/completion', {
                operation: 'explain',
                concept,
            });
            const data = this.extractData(response);
            return (data === null || data === void 0 ? void 0 : data.result) || (data === null || data === void 0 ? void 0 : data.explanation) || 'No explanation generated.';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async translate(text, targetLang = 'vi') {
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/utilities/completion', {
                operation: 'translate',
                text,
                targetLang,
            });
            const data = this.extractData(response);
            return (data === null || data === void 0 ? void 0 : data.result) || (data === null || data === void 0 ? void 0 : data.translation) || 'No translation generated.';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async search(query, topK = 5, _userId, roomId) {
        try {
            const response = await this.post('/api/v1/integrations/rocketchat/utilities/completion', {
                operation: 'search',
                query,
                topK,
                roomId,
            });
            const data = this.extractData(response);
            return (data === null || data === void 0 ? void 0 : data.results) || [];
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    async ask(query, userId, roomId, _history) {
        try {
            const reqId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const response = await this.post('/api/v1/integrations/rocketchat/utilities/completion', {
                operation: 'explain',
                concept: query,
                roomId,
            });
            const data = this.extractData(response);
            return {
                answer: (data === null || data === void 0 ? void 0 : data.result) || (data === null || data === void 0 ? void 0 : data.explanation) || 'No answer received.',
                sources: [],
                model: 'node-backend',
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            throw new Error(message);
        }
    }
    extractData(response) {
        const raw = response.data;
        if (raw && typeof raw === 'object') {
            const envelope = raw;
            if (envelope.data !== undefined) {
                return envelope.data;
            }
            return raw;
        }
        if (response.content) {
            try {
                const parsed = JSON.parse(response.content);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.data !== undefined) {
                        return parsed.data;
                    }
                    return parsed;
                }
            }
            catch (_a) {
            }
        }
        return {};
    }
    async getBackendUrl() {
        const settings = this.read.getEnvironmentReader().getSettings();
        const url = await settings.getValueById('backend-url');
        if (!url || typeof url !== 'string' || !Validator_1.Validator.isValidUrl(url.trim())) {
            throw new Error(Errors_1.ERRORS.SETTING_NOT_CONFIGURED('backend-url'));
        }
        return url.trim().replace(/\/+$/, '');
    }
    async getIntegrationToken() {
        const settings = this.read.getEnvironmentReader().getSettings();
        try {
            const integrationToken = await settings.getValueById('integration-token');
            if (typeof integrationToken === 'string' && integrationToken.trim().length > 0) {
                return integrationToken.trim();
            }
        }
        catch (_a) {
        }
        const apiKey = await settings.getValueById('api-key');
        return typeof apiKey === 'string' ? apiKey.trim() : '';
    }
    async post(path, data) {
        const url = `${await this.getBackendUrl()}${path}`;
        const headers = await this.buildHeaders();
        const response = await this.http.post(url, {
            data,
            headers,
            timeout: 60000,
        });
        this.assertSuccess(response);
        return response;
    }
    async get(path) {
        const url = `${await this.getBackendUrl()}${path}`;
        const headers = await this.buildHeaders();
        const response = await this.http.get(url, {
            headers,
            timeout: 60000,
        });
        this.assertSuccess(response);
        return response;
    }
    assertSuccess(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            let errorDetail = '';
            if (response.data && typeof response.data === 'object') {
                const env = response.data;
                if (env.message) {
                    errorDetail = env.message;
                }
                else if (env.detail) {
                    errorDetail = env.detail;
                }
                else if (env.error) {
                    errorDetail = env.error;
                }
                else if (Array.isArray(env.errors) && env.errors.length > 0) {
                    errorDetail = env.errors
                        .map((e) => (typeof e === 'object' && e !== null && 'message' in e ? e.message : String(e)))
                        .join(', ');
                }
            }
            else if (response.content) {
                try {
                    const parsed = JSON.parse(response.content);
                    if (parsed && typeof parsed === 'object') {
                        errorDetail = parsed.message || parsed.detail || parsed.error || '';
                        if (!errorDetail && Array.isArray(parsed.errors)) {
                            errorDetail = parsed.errors.join(', ');
                        }
                    }
                }
                catch (_a) {
                    errorDetail = response.content.slice(0, 150);
                }
            }
            if (errorDetail) {
                throw new Error(`Backend error (${response.statusCode}): ${errorDetail}`);
            }
            throw new Error(Errors_1.ERRORS.BACKEND_ERROR(response.statusCode));
        }
    }
    async buildHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        const token = await this.getIntegrationToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }
}
exports.BackendClient = BackendClient;
