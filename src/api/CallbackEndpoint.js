"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallbackEndpoint = void 0;
const api_1 = require("@rocket.chat/apps-engine/definition/api");
const Logger_1 = require("../utils/Logger");
const MessageHelper_1 = require("../utils/MessageHelper");
class CallbackEndpoint extends api_1.ApiEndpoint {
    constructor() {
        super(...arguments);
        this.path = 'callback';
    }
    async post(request, endpoint, read, modify, http, persis) {
        const logger = new Logger_1.Logger(this.app.getLogger(), 'CallbackEndpoint');
        const body = request.content;
        if (!(await this.authorize(request, read))) {
            logger.warn('Rejected unauthenticated callback');
            return {
                status: 401,
                content: { error: 'Unauthorized' },
            };
        }
        logger.info('Received callback', { event: body.event, room_id: body.room_id });
        const event = body.event;
        const userId = body.user_id;
        const roomId = body.room_id;
        const message = body.message;
        if (!event || !userId || !roomId) {
            return {
                status: 400,
                content: { error: 'Missing required fields: event, user_id, room_id' },
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
            switch (event) {
                case 'indexing_complete': {
                    const docName = body.document_name || 'Unknown';
                    const chunksCount = body.chunks_count || 0;
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, `✅ **Document Indexed:** \`${docName}\` (${chunksCount} chunks)`);
                    break;
                }
                case 'indexing_failed': {
                    const docName = body.document_name || 'Unknown';
                    const error = body.error || 'Unknown error';
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, `❌ **Indexing Failed:** \`${docName}\` — ${error}`);
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
            return {
                status: 200,
                content: { status: 'ok' },
            };
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Callback processing failed';
            logger.error('Callback error', errMsg);
            return {
                status: 500,
                content: { error: errMsg },
            };
        }
    }
    async get(_request, _endpoint, _read, _modify, _http, _persis) {
        return {
            status: 200,
            content: { status: 'RAGChat Callback Endpoint' },
        };
    }
    async authorize(request, read) {
        var _a;
        const settings = read.getEnvironmentReader().getSettings();
        const expectedKey = await settings.getValueById('api-key');
        const configured = typeof expectedKey === 'string' && expectedKey.length > 0;
        if (!configured) {
            return true;
        }
        const headers = request.headers || {};
        const authHeader = (_a = headers['Authorization']) !== null && _a !== void 0 ? _a : headers['authorization'];
        return typeof authHeader === 'string' && authHeader === `Bearer ${expectedKey}`;
    }
}
exports.CallbackEndpoint = CallbackEndpoint;
