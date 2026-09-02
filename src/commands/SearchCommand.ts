import {
    IHttp,
    ILogger,
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
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

/**
 * /search slash command — performs semantic search across indexed document chunks.
 */
export class SearchCommand implements ISlashCommand {
    public command = COMMANDS.SEARCH;
    public i18nParamsExample = '"search query"';
    public i18nDescription = 'Search documents in the knowledge base';
    public providesPreview = false;

    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('SearchCommand');
        } else {
            this.logger = new Logger(logger, 'SearchCommand');
        }
    }

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        _persis: IPersistence,
    ): Promise<void> {
        const startTime = Date.now();
        const args = context.getArguments();
        const room = context.getRoom();
        const sender = context.getSender();
        const threadId = context.getThreadId();
        const requestId = createRequestId('search');

        if (args.length === 0) {
            this.logger.rejected('search', 'Missing query in /search command', {
                event: 'search.rejected',
                requestId,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
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

        this.logger.started('search', {
            event: 'search.started',
            requestId,
            roomId: room.id,
            userId: sender.id,
            threadId,
            details: { queryLength: query.length },
        });

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
            const client = new BackendClient(http, read, this.logger);
            const results = await client.search(query, 5, sender.id, room.id, requestId, { threadId });

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

            this.logger.completed('search', {
                event: 'search.completed',
                requestId,
                durationMs: Date.now() - startTime,
                roomId: room.id,
                userId: sender.id,
                threadId,
                details: { resultsCount: results.length },
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;

            this.logger.failed('search', error, {
                event: 'search.failed',
                requestId,
                durationMs,
                roomId: room.id,
                userId: sender.id,
                threadId,
                errorMessage: message,
            });

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
