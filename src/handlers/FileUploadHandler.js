"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileUploadHandler = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const MessageHelper_1 = require("../utils/MessageHelper");
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.pptx', '.csv', '.xlsx', '.html'];
class FileUploadHandler {
    async executePreFileUpload(context, read, http, _persis, modify) {
        const { file, content } = context;
        const ext = this.getExtension(file.name);
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            return;
        }
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            await client.post('/api/documents/base64', {
                filename: file.name,
                content_base64: content.toString('base64'),
                content_type: file.type || 'application/octet-stream',
                user_id: file.userId || '',
                room_id: file.rid || '',
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Indexing request failed';
            const room = await read.getRoomReader().getById(file.rid);
            if (!room) {
                return;
            }
            await (0, MessageHelper_1.sendMessage)(read, modify, room, `⚠️ Could not queue **\`${file.name}\`** for indexing: ${message}`);
        }
    }
    getExtension(filename) {
        const index = filename.lastIndexOf('.');
        return index === -1 ? '' : filename.slice(index).toLowerCase();
    }
}
exports.FileUploadHandler = FileUploadHandler;
