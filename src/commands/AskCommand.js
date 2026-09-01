"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AskCommand = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const sessionStore_1 = require("../persistence/sessionStore");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const SettingReader_1 = require("../utils/SettingReader");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
class AskCommand {
    constructor() {
        this.command = Commands_1.COMMANDS.ASK;
        this.i18nParamsExample = '"your question"';
        this.i18nDescription = 'Ask RAGChat a question using document knowledge';
        this.providesPreview = false;
    }
    async executor(context, read, modify, http, persis) {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();
        const threadId = context.getThreadId();
        if (args.length === 0) {
            await (0, MessageHelper_1.sendMessage)(read, modify, room, Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.ASK, '"your question"'), undefined, threadId);
            return;
        }
        const query = args.join(' ');
        const placeholderId = await (0, MessageHelper_1.sendPlaceholderMessage)(read, modify, room, '🔍 _Đang tra cứu tài liệu và suy nghĩ câu trả lời..._', threadId);
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const sessionStore = new sessionStore_1.SessionStore(read, persis);
            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (0, SettingReader_1.readMaxHistory)(await settings.getValueById('max-history'));
            let workspaceId = 'default';
            try {
                const wsSetting = await settings.getValueById('workspace-id');
                if (typeof wsSetting === 'string' && wsSetting.trim()) {
                    workspaceId = wsSetting.trim();
                }
            }
            catch (_a) {
            }
            const history = await sessionStore.getHistory(sender.id, room.id, threadId, maxHistory);
            const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            await client.askAsync(query, sender.id, room.id, threadId, placeholderId, history, requestId, workspaceId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                try {
                    await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, message, undefined);
                }
                catch (_b) {
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
                }
            }
            else {
                await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
            }
        }
    }
}
exports.AskCommand = AskCommand;
