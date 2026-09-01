"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchCommand = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
class SearchCommand {
    constructor() {
        this.command = Commands_1.COMMANDS.SEARCH;
        this.i18nParamsExample = '"search query"';
        this.i18nDescription = 'Search documents in the knowledge base';
        this.providesPreview = false;
    }
    async executor(context, read, modify, http, _persis) {
        const args = context.getArguments();
        const room = context.getRoom();
        const sender = context.getSender();
        const threadId = context.getThreadId();
        if (args.length === 0) {
            await (0, MessageHelper_1.sendMessage)(read, modify, room, Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.SEARCH, '"query"'), undefined, threadId);
            return;
        }
        const query = args.join(' ');
        const placeholderId = await (0, MessageHelper_1.sendPlaceholderMessage)(read, modify, room, '🔍 _Đang tìm kiếm tài liệu..._', threadId);
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const results = await client.search(query, 5, sender.id, room.id);
            const sources = results.map((r) => ({
                title: r.title,
                snippet: r.snippet,
                relevance: r.relevance,
            }));
            const attachment = Formatter_1.Formatter.formatSources(sources);
            const answer = `Search results for: **${query}**`;
            if (placeholderId) {
                await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, answer, attachment);
            }
            else {
                await (0, MessageHelper_1.sendMessage)(read, modify, room, answer, attachment, threadId);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                try {
                    await (0, MessageHelper_1.updateMessage)(placeholderId, read, modify, message);
                }
                catch (_a) {
                    await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
                }
            }
            else {
                await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
            }
        }
    }
}
exports.SearchCommand = SearchCommand;
