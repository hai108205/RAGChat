import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import { BackendClient } from '../lib/BackendClient';
import { Formatter, CitationSource } from '../utils/Formatter';
import { sendMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';

export class SearchCommand implements ISlashCommand {
    public command = COMMANDS.SEARCH;
    public i18nParamsExample = '"search query"';
    public i18nDescription = 'Search documents in the knowledge base';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        _persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const room = context.getRoom();

        if (args.length === 0) {
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.SEARCH, '"query"'));
            return;
        }

        const query = args.join(' ');

        try {
            const client = new BackendClient(http, read);
            const results = await client.search(query);

            const sources: CitationSource[] = results.map((r) => ({
                title: r.title,
                snippet: r.snippet,
                relevance: r.relevance,
            }));

            const attachment = Formatter.formatSources(sources);
            await sendMessage(read, modify, room, `Search results for: **${query}**`, attachment);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, room, message);
        }
    }
}
