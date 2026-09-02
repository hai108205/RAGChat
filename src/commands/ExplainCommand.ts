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
 * /explain slash command — explains concepts or technical terms in simple language.
 */
export class ExplainCommand implements ISlashCommand {
    public command = COMMANDS.EXPLAIN;
    public i18nParamsExample = '"concept to explain"';
    public i18nDescription = 'Explain a concept in simple terms';
    public providesPreview = false;

    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('ExplainCommand');
        } else {
            this.logger = new Logger(logger, 'ExplainCommand');
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
        const requestId = createRequestId('exp');

        if (args.length === 0) {
            this.logger.rejected('explain', 'Missing concept argument in /explain command', {
                event: 'explain.rejected',
                requestId,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
            await sendMessage(
                read,
                modify,
                room,
                Formatter.usageCommand(COMMANDS.EXPLAIN, '"concept"'),
                undefined,
                threadId,
            );
            return;
        }

        const concept = args.join(' ');

        this.logger.started('explain', {
            event: 'explain.started',
            requestId,
            roomId: room.id,
            userId: sender.id,
            threadId,
            details: { conceptLength: concept.length },
        });

        // 1. Send instant typing/placeholder message
        const placeholderId = await sendPlaceholderMessage(
            read,
            modify,
            room,
            '🔍 _Đang phân tích và chuẩn bị giải thích..._',
            threadId,
        );

        try {
            // 2. Call backend LLM explanation endpoint
            const client = new BackendClient(http, read, this.logger);
            const explanation = await client.explain(concept, requestId);
            const answer = `**${concept}:**\n\n${explanation}`;

            // 3. Upsert placeholder with result
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, answer);
            } else {
                await sendMessage(read, modify, room, answer, undefined, threadId);
            }

            this.logger.completed('explain', {
                event: 'explain.completed',
                requestId,
                durationMs: Date.now() - startTime,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;

            this.logger.failed('explain', error, {
                event: 'explain.failed',
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
