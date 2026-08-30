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
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const sessionStore = new sessionStore_1.SessionStore(read, persis);
            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (0, SettingReader_1.readMaxHistory)(await settings.getValueById('max-history'));
            const history = await sessionStore.getHistory(sender.id, room.id, threadId, maxHistory);
            const response = await client.ask(query, sender.id, room.id, history);
            await sessionStore.addMessages(sender.id, room.id, threadId, [
                { role: 'user', content: query, timestamp: Date.now() },
                { role: 'assistant', content: response.answer, timestamp: Date.now() },
            ], maxHistory);
            const enableCitations = (0, SettingReader_1.readBoolean)(await settings.getValueById('enable-citations'));
            const attachment = enableCitations
                ? Formatter_1.Formatter.formatSources(response.sources)
                : undefined;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, response.answer, attachment, threadId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, message);
        }
    }
}
exports.AskCommand = AskCommand;
