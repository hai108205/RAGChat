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
        if (args.length === 0) {
            await (0, MessageHelper_1.sendMessage)(read, modify, room, Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.SEARCH, '"query"'));
            return;
        }
        const query = args.join(' ');
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const results = await client.search(query);
            const sources = results.map((r) => ({
                title: r.title,
                snippet: r.snippet,
                relevance: r.relevance,
            }));
            const attachment = Formatter_1.Formatter.formatSources(sources);
            await (0, MessageHelper_1.sendMessage)(read, modify, room, `Search results for: **${query}**`, attachment);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, message);
        }
    }
}
exports.SearchCommand = SearchCommand;
