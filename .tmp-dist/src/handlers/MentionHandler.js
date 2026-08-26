"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MentionHandler = void 0;
const rooms_1 = require("@rocket.chat/apps-engine/definition/rooms");
const BackendClient_1 = require("../lib/BackendClient");
const sessionStore_1 = require("../persistence/sessionStore");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
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
        const question = this.stripMention(message.text || '', appUser.username).trim();
        if (!question) {
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatHelpMessage(), undefined, message.threadId);
            return;
        }
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const sessionStore = new sessionStore_1.SessionStore(read, persistence);
            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (await settings.getValueById('max-history'));
            const history = await sessionStore.getHistory(message.sender.id, maxHistory);
            const response = await client.ask(question, message.sender.id, message.room.id, history);
            await sessionStore.addMessage(message.sender.id, {
                role: 'user',
                content: question,
                timestamp: Date.now(),
            }, maxHistory);
            await sessionStore.addMessage(message.sender.id, {
                role: 'assistant',
                content: response.answer,
                timestamp: Date.now(),
            }, maxHistory);
            const enableCitations = await settings.getValueById('enable-citations');
            const attachment = enableCitations
                ? Formatter_1.Formatter.formatSources(response.sources)
                : undefined;
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, response.answer, attachment, message.threadId);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, errMsg, undefined, message.threadId);
        }
    }
    isMentioned(text, botUsername) {
        const mention = new RegExp(`@${this.escapeRegExp(botUsername)}\\b`, 'i');
        return mention.test(text) || text.trim().startsWith(Commands_1.BOT_PREFIX);
    }
    stripMention(text, botUsername) {
        const mention = new RegExp(`@${this.escapeRegExp(botUsername)}\\b`, 'gi');
        let stripped = text.replace(mention, '');
        if (stripped.trim().startsWith(Commands_1.BOT_PREFIX)) {
            stripped = stripped.trim().slice(Commands_1.BOT_PREFIX.length);
        }
        return stripped;
    }
    escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.MentionHandler = MentionHandler;
