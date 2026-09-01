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
            const settings = read.getEnvironmentReader().getSettings();
            let workspaceId = 'default';
            try {
                const wsSetting = await settings.getValueById('workspace-id');
                if (typeof wsSetting === 'string' && wsSetting.trim()) {
                    workspaceId = wsSetting.trim();
                }
            }
            catch (_a) {
            }
            const requestId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            await client.uploadBase64({
                workspaceId,
                rocketUserId: file.userId || '',
                roomId: file.rid || '',
                filename: file.name,
                contentBase64: content.toString('base64'),
                contentType: file.type || 'application/octet-stream',
                requestId,
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
