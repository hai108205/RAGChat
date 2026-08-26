"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarizeCommand = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
class SummarizeCommand {
    constructor() {
        this.command = Commands_1.COMMANDS.SUMMARIZE;
        this.i18nParamsExample = '"text to summarize"';
        this.i18nDescription = 'Summarize the provided text';
        this.providesPreview = false;
    }
    async executor(context, read, modify, http, _persis) {
        const args = context.getArguments();
        const room = context.getRoom();
        const threadId = context.getThreadId();
        if (args.length === 0) {
            await (0, MessageHelper_1.sendMessage)(read, modify, room, Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.SUMMARIZE, '"text"'), undefined, threadId);
            return;
        }
        const text = args.join(' ');
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const summary = await client.summarize(text);
            await (0, MessageHelper_1.sendMessage)(read, modify, room, `**Summary:**\n\n${summary}`, undefined, threadId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
        }
    }
}
exports.SummarizeCommand = SummarizeCommand;
