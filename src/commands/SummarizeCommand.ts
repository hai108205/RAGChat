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
import { Formatter } from '../utils/Formatter';
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

/**
 * /summarize slash command — generates concise summaries of provided text blocks.
 */
export class SummarizeCommand implements ISlashCommand {
    public command = COMMANDS.SUMMARIZE;
    public i18nParamsExample = '"text to summarize"';
    public i18nDescription = 'Summarize the provided text';
    public providesPreview = false;

    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('SummarizeCommand');
        } else {
            this.logger = new Logger(logger, 'SummarizeCommand');
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
        const requestId = createRequestId('sum');

        if (args.length === 0) {
            this.logger.rejected('summarize', 'Missing text argument in /summarize command', {
                event: 'summarize.rejected',
                requestId,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
            await sendMessage(
                read,
                modify,
                room,
                Formatter.usageCommand(COMMANDS.SUMMARIZE, '"text"'),
                undefined,
                threadId,
            );
            return;
        }

        const text = args.join(' ');

        this.logger.started('summarize', {
            event: 'summarize.started',
            requestId,
            roomId: room.id,
            userId: sender.id,
            threadId,
            details: { textLength: text.length },
        });

        // 1. Instant typing/placeholder message
        const placeholderId = await sendPlaceholderMessage(
            read,
            modify,
            room,
            '🔍 _Đang tóm tắt văn bản..._',
            threadId,
        );

        try {
            // 2. Call backend summarization endpoint
            const client = new BackendClient(http, read, this.logger);
            const summary = await client.summarize(text, requestId);
            const answer = `**Summary:**\n\n${summary}`;

            // 3. Upsert placeholder with summary
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, answer);
            } else {
                await sendMessage(read, modify, room, answer, undefined, threadId);
            }

            this.logger.completed('summarize', {
                event: 'summarize.completed',
                requestId,
                durationMs: Date.now() - startTime,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;

            this.logger.failed('summarize', error, {
                event: 'summarize.failed',
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
