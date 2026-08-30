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
        if (args.length === 0) {
            await (0, MessageHelper_1.sendMessage)(read, modify, room, Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.EXPLAIN, '"concept"'));
            return;
        }
        const concept = args.join(' ');
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const explanation = await client.explain(concept);
            await (0, MessageHelper_1.sendMessage)(read, modify, room, `**${concept}:**\n\n${explanation}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, message);
        }
    }
}
exports.ExplainCommand = ExplainCommand;
