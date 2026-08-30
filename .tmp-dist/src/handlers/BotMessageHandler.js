"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotMessageHandler = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const sessionStore_1 = require("../persistence/sessionStore");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
class BotMessageHandler {
    async executePostMessageSentToBot(message, read, http, persistence, modify) {
        if (!message.text || !message.text.trim()) {
            return;
        }
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser || message.sender.id === appUser.id) {
            return;
        }
        const text = message.text.trim();
        if (text.startsWith(Commands_1.BOT_PREFIX)) {
            const rest = text.slice(Commands_1.BOT_PREFIX.length).trim();
            await this.handleBotCommand(rest, message, read, http, persistence, modify);
            return;
        }
        await this.handleQuestion(text, message, read, http, persistence, modify);
    }
    async handleBotCommand(input, message, read, http, persistence, modify) {
        if (!input) {
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatHelpMessage(), undefined, message.threadId);
            return;
        }
        const [subCommand] = input.split(/\s+/);
        switch (subCommand.toLowerCase()) {
            case Commands_1.BOT_SUB_COMMANDS.START: {
                await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatWelcomeMessage(), undefined, message.threadId);
                break;
            }
            case Commands_1.BOT_SUB_COMMANDS.STATS: {
                await this.handleStats(message, read, http, modify);
                break;
            }
            case Commands_1.BOT_SUB_COMMANDS.CLEAR: {
                const sessionStore = new sessionStore_1.SessionStore(read, persistence);
                const hasHistory = await sessionStore.hasHistory(message.sender.id);
                if (hasHistory) {
                    await sessionStore.clearHistory(message.sender.id);
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Errors_1.ERRORS.HISTORY_CLEARED, undefined, message.threadId);
                }
                else {
                    await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Errors_1.ERRORS.EMPTY_HISTORY, undefined, message.threadId);
                }
                break;
            }
            case Commands_1.BOT_SUB_COMMANDS.HELP: {
                await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatHelpMessage(), undefined, message.threadId);
                break;
            }
            default: {
                await (0, MessageHelper_1.sendMessage)(read, modify, message.room, `Unknown command: \`${input}\`. Type \`${Commands_1.BOT_PREFIX} help\` for available commands.`, undefined, message.threadId);
            }
        }
    }
    async handleStats(message, read, http, modify) {
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const documents = await client.listDocuments();
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, Formatter_1.Formatter.formatStats(documents), undefined, message.threadId);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, message.room, errMsg, undefined, message.threadId);
        }
    }
    async handleQuestion(text, message, read, http, persistence, modify) {
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const sessionStore = new sessionStore_1.SessionStore(read, persistence);
            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (await settings.getValueById('max-history'));
            const history = await sessionStore.getHistory(message.sender.id, maxHistory);
            const response = await client.ask(text, message.sender.id, message.room.id, history);
            await sessionStore.addMessage(message.sender.id, {
                role: 'user',
                content: text,
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
}
exports.BotMessageHandler = BotMessageHandler;
