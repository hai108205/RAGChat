"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallbackEndpoint = void 0;
const api_1 = require("@rocket.chat/apps-engine/definition/api");
const sessionStore_1 = require("../persistence/sessionStore");
const Formatter_1 = require("../utils/Formatter");
const Logger_1 = require("../utils/Logger");
const MessageHelper_1 = require("../utils/MessageHelper");
const SettingReader_1 = require("../utils/SettingReader");
const Validator_1 = require("../utils/Validator");
const processedRequests = new Set();
class CallbackEndpoint extends api_1.ApiEndpoint {
    constructor() {
        super(...arguments);
        this.path = 'callback';
    }
    async post(request, _endpoint, read, modify, _http, persis) {
        const logger = new Logger_1.Logger(this.app.getLogger(), 'CallbackEndpoint');
        const body = request.content;
        if (!(await this.authorize(request, read))) {
            logger.warn('Rejected unauthenticated callback from backend');
            return {
                status: 401,
                content: { error: 'Unauthorized' },
            };
        }
        logger.info('Received callback event', { event: body.event, room_id: body.room_id });
        const event = body.event;
        const userId = body.user_id;
        const roomId = body.room_id;
        const message = body.message;
        const requestId = body.request_id;
        if (!event || !userId || !roomId) {
            return {
                status: 400,
                content: { error: 'Missing required fields: event, user_id, room_id' },
            };
        }
        if (requestId && processedRequests.has(requestId)) {
            logger.info('Duplicate callback ignored', { requestId });
            return {
                status: 200,
                content: { status: 'ok', detail: 'duplicate ignored' },
            };
        }
        try {
            const user = await read.getUserReader().getById(userId);
            const room = await read.getRoomReader().getById(roomId);
            if (!user || !room) {
                return {
                    status: 404,
                    content: { error: 'User or room not found' },
                };
            }
            const settings = read.getEnvironmentReader().getSettings();
            switch (event) {
                case 'chat_completed': {
                    const placeholderId = body.placeholder_id;
                    const threadId = body.thread_id;
                    const query = body.query;
                    const answer = (0, Validator_1.asNonEmptyString)(body.answer, 'Không nhận được câu trả lời.');
                    const rawSources = body.sources || [];
                    const sources = rawSources.map((s) => {
                        let relevance = typeof s.relevance === 'number' ? s.relevance : 0;
                        if (typeof s.score === 'number' && !s.relevance) {
                            relevance = s.score > 1 ? s.score / 100 : s.score;
                        }
                        return {
                            title: s.title || s.heading || 'Document',
                            snippet: s.snippet || s.chunkText || s.body || '',
                            pageUrl: s.pageUrl || s.url || '',
                            relevance: isNaN(relevance) ? 0 : relevance,
                        };
                    });
                    const enableCitations = (0, SettingReader_1.readBoolean)(await settings.getValueById('enable-citations'));
                    const attachment = enableCitations && sources.length > 0
                        ? Formatter_1.Formatter.formatSources(sources)
                        : undefined;
                    if (placeholderId) {
                        try {
                            await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, answer, attachment);
                        }
                        catch (_a) {
                            await (0, MessageHelper_1.sendMessage)(read, modify, room, answer, attachment, threadId);
                        }
                    }
                    else {
                        await (0, MessageHelper_1.sendMessage)(read, modify, room, answer, attachment, threadId);
                    }
                    if (query) {
                        const sessionStore = new sessionStore_1.SessionStore(read, persis);
                        const maxHistory = (0, SettingReader_1.readMaxHistory)(await settings.getValueById('max-history'));
                        await sessionStore.addMessages(userId, roomId, threadId, [
                            { role: 'user', content: query, timestamp: Date.now() },
                            { role: 'assistant', content: answer, timestamp: Date.now() },
                        ], maxHistory);
                    }
                    break;
                }
                case 'chat_failed': {
                    const placeholderId = body.placeholder_id;
                    const threadId = body.thread_id;
                    const error = (0, Validator_1.asNonEmptyString)(body.error, 'Không thể hoàn thành câu trả lời.');
                    const errorMsg = `❌ **Lỗi phản hồi:** ${error}`;
                    if (placeholderId) {
                        try {
                            await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, errorMsg, undefined);
                        }
                        catch (_b) {
                            await (0, MessageHelper_1.sendMessage)(read, modify, room, errorMsg, undefined, threadId);
                        }
                    }
                    else {
                        await (0, MessageHelper_1.sendMessage)(read, modify, room, errorMsg, undefined, threadId);
                    }
                    break;
                }
                case 'indexing_complete': {
                    const docName = body.document_name || body.filename || 'Unknown';
                    const chunksCount = body.chunks_count || 0;
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, `✅ **Document Indexed:** \`${docName}\` (${chunksCount} chunks)`, undefined, body.thread_id);
                    break;
                }
                case 'indexing_failed': {
                    const docName = body.document_name || body.filename || 'Unknown';
                    const error = body.error || 'Unknown error';
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, `❌ **Indexing Failed:** \`${docName}\` — ${error}`, undefined, body.thread_id);
                    break;
                }
                default: {
                    if (message) {
                        await (0, MessageHelper_1.sendMessage)(read, modify, room, message);
                    }
                    else {
                        logger.warn(`Unknown callback event: ${event}`);
                    }
                }
            }
            if (requestId) {
                processedRequests.add(requestId);
                if (processedRequests.size > 1000) {
                    const firstItem = processedRequests.values().next().value;
                    if (firstItem) {
                        processedRequests.delete(firstItem);
                    }
                }
            }
            return {
                status: 200,
                content: { status: 'ok' },
            };
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Callback processing failed';
            logger.error('Callback processing exception', errMsg);
            return {
                status: 500,
                content: { error: errMsg },
            };
        }
    }
    async get(_request, _endpoint, _read, _modify, _http, _persis) {
        return {
            status: 200,
            content: { status: 'RAGChat Callback Endpoint active' },
        };
    }
    async authorize(request, read) {
        var _a;
        const settings = read.getEnvironmentReader().getSettings();
        let expectedToken = '';
        try {
            const intToken = await settings.getValueById('integration-token');
            if (typeof intToken === 'string' && intToken.trim().length > 0) {
                expectedToken = intToken.trim();
            }
        }
        catch (_b) {
        }
        if (!expectedToken) {
            const apiKey = await settings.getValueById('api-key');
            if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
                expectedToken = apiKey.trim();
            }
        }
        if (!expectedToken) {
            return true;
        }
        const headers = request.headers || {};
        const authHeader = (_a = headers['Authorization']) !== null && _a !== void 0 ? _a : headers['authorization'];
        return typeof authHeader === 'string' && authHeader === `Bearer ${expectedToken}`;
    }
}
exports.CallbackEndpoint = CallbackEndpoint;
