"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExplainCommand = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
class ExplainCommand {
    constructor() {
        this.command = Commands_1.COMMANDS.EXPLAIN;
        this.i18nParamsExample = '"concept to explain"';
        this.i18nDescription = 'Explain a concept in simple terms';
        this.providesPreview = false;
    }
    async executor(context, read, modify, http, _persis) {
        const args = context.getArguments();
        const room = context.getRoom();
        const threadId = context.getThreadId();
        if (args.length === 0) {
            await (0, MessageHelper_1.sendMessage)(read, modify, room, Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.EXPLAIN, '"concept"'), undefined, threadId);
            return;
        }
        const concept = args.join(' ');
        const placeholderId = await (0, MessageHelper_1.sendPlaceholderMessage)(read, modify, room, '🔍 _Đang phân tích và chuẩn bị giải thích..._', threadId);
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const explanation = await client.explain(concept);
            const answer = `**${concept}:**\n\n${explanation}`;
            if (placeholderId) {
                await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, answer);
            }
            else {
                await (0, MessageHelper_1.sendMessage)(read, modify, room, answer, undefined, threadId);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, message);
            }
            else {
                await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
            }
        }
    }
}
exports.ExplainCommand = ExplainCommand;
