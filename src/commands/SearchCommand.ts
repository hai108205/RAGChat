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
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';

/**
 * /search slash command — performs semantic search across indexed document chunks.
 */
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
        const sender = context.getSender();
        const threadId = context.getThreadId();

        if (args.length === 0) {
            await sendMessage(
                read,
                modify,
                room,
                Formatter.usageCommand(COMMANDS.SEARCH, '"query"'),
                undefined,
                threadId,
            );
            return;
        }

        const query = args.join(' ');

        // 1. Send instant typing/placeholder message
        const placeholderId = await sendPlaceholderMessage(
            read,
            modify,
            room,
            '🔍 _Đang tìm kiếm tài liệu..._',
            threadId,
        );

        try {
            // 2. Call backend semantic search endpoint
            const client = new BackendClient(http, read);
            const results = await client.search(query, 5, sender.id, room.id);

            const sources: CitationSource[] = results.map((r) => ({
                title: r.title,
                snippet: r.snippet,
                relevance: r.relevance,
            }));

            const attachment = Formatter.formatSources(sources);
            const answer = `Search results for: **${query}**`;

            // 3. Upsert placeholder with formatted search results
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, answer, attachment);
            } else {
                await sendMessage(read, modify, room, answer, attachment, threadId);
            }
        } catch (error: unknown) {
            // 4. Safe error handling with editor validation and fallback
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                try {
                    await updateMessage(placeholderId, read, modify, message);
                } catch {
                    await sendMessage(read, modify, room, message, undefined, threadId);
                }
            } else {
                await sendMessage(read, modify, room, message, undefined, threadId);
            }
        }
    }
}
