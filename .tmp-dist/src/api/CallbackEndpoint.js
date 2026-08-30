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
        logger.info('Received callback', body);
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
                case 'summary_complete': {
                    const summary = message || 'No summary available.';
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, summary);
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
}
exports.CallbackEndpoint = CallbackEndpoint;
