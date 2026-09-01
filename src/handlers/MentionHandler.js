"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MentionHandler = void 0;
const rooms_1 = require("@rocket.chat/apps-engine/definition/rooms");
const BackendClient_1 = require("../lib/BackendClient");
const sessionStore_1 = require("../persistence/sessionStore");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const SettingReader_1 = require("../utils/SettingReader");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
class MentionHandler {
    async checkPostMessageSent(message, read, _http) {
        if (!message.text || !message.text.trim()) {
            return false;
        }
        if (message.room.type === rooms_1.RoomType.DIRECT_MESSAGE) {
            return false;
        }
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser || message.sender.id === appUser.id) {
            return false;
        }
        return this.isMentioned(message.text, appUser.username);
    }
    async executePostMessageSent(message, read, http, persistence, modify) {
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser) {
            return;
        }
        const command = this.detectCommand(message.text || '', appUser.username);
        if (command) {
            await this.runCommand(command, message, read, http, persistence, modify);
            return;
        }
        const question = this.stripMention(message.text || '', appUser.username).trim();
        if (!question) {
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatHelpMessage(), undefined, message.threadId);
            return;
        }
        const placeholderId = await (0, MessageHelper_1.sendPlaceholderMessage)(read, modify, message.room, '🔍 _Đang tra cứu tài liệu và suy nghĩ câu trả lời..._', message.threadId);
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const sessionStore = new sessionStore_1.SessionStore(read, persistence);
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
            const history = await sessionStore.getHistory(message.sender.id, message.room.id, message.threadId, maxHistory);
            const requestId = `mention-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            await client.askAsync(question, message.sender.id, message.room.id, message.threadId, placeholderId, history, requestId, workspaceId);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                try {
                    await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, errMsg, undefined);
                }
                catch (_b) {
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, errMsg, undefined, message.threadId);
                }
            }
            else {
                await (0, MessageHelper_1.sendMessage)(read, modify, message.room, errMsg, undefined, message.threadId);
            }
        }
    }
    async runCommand(command, message, read, http, persistence, modify) {
        switch (command) {
            case Commands_1.BOT_SUB_COMMANDS.START: {
                await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatWelcomeMessage(), undefined, message.threadId);
                break;
            }
            case Commands_1.BOT_SUB_COMMANDS.HELP: {
                await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatHelpMessage(), undefined, message.threadId);
                break;
            }
            case Commands_1.BOT_SUB_COMMANDS.CLEAR: {
                const sessionStore = new sessionStore_1.SessionStore(read, persistence);
                const hasHistory = await sessionStore.hasHistory(message.sender.id, message.room.id, message.threadId);
                if (hasHistory) {
                    await sessionStore.clearHistory(message.sender.id, message.room.id, message.threadId);
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Errors_1.ERRORS.HISTORY_CLEARED, undefined, message.threadId);
                }
                else {
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Errors_1.ERRORS.EMPTY_HISTORY, undefined, message.threadId);
                }
                break;
            }
            case Commands_1.BOT_SUB_COMMANDS.STATS: {
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
                    const documents = await client.listDocuments(workspaceId, message.room.id, message.threadId);
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatStats(documents), undefined, message.threadId);
                }
                catch (error) {
                    const errMsg = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, errMsg, undefined, message.threadId);
                }
                break;
            }
        }
    }
    detectCommand(text, botUsername) {
        const trimmed = text.trim();
        if (!trimmed) {
            return undefined;
        }
        const mention = new RegExp(`^@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'i');
        const bare = trimmed.replace(mention, '').trim();
        const command = new RegExp(`^${this.escapeRegExp(Commands_1.BOT_PREFIX)}(?=$|[\\s])`, 'i');
        if (!command.test(bare)) {
            return undefined;
        }
        const token = bare.replace(command, '').trim().split(/\s+/)[0].toLowerCase();
        return Object.values(Commands_1.BOT_SUB_COMMANDS).includes(token) ? token : undefined;
    }
    isMentioned(text, botUsername) {
        const trimmed = text.trim();
        const botMention = new RegExp(`@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'i');
        const prefixMention = new RegExp(`(^|\\s)${this.escapeRegExp(Commands_1.BOT_PREFIX)}(?=$|[\\s,.;:'"!?])`, 'i');
        return botMention.test(trimmed) || prefixMention.test(trimmed);
    }
    stripMention(text, botUsername) {
        const botMention = new RegExp(`@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'gi');
        const prefixMention = new RegExp(`(^|\\s)${this.escapeRegExp(Commands_1.BOT_PREFIX)}(?=$|[\\s,.;:'"!?])`, 'gi');
        return text
            .replace(botMention, '')
            .replace(prefixMention, '')
            .trim();
    }
    escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.MentionHandler = MentionHandler;
