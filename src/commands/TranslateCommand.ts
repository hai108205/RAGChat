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
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BackendClient } from '../lib/BackendClient';
import { Formatter } from '../utils/Formatter';
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

const SUPPORTED_LANGS: Record<string, string> = {
    vi: 'Vietnamese',
    en: 'English',
    fr: 'French',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    de: 'German',
    es: 'Spanish',
};

/**
 * /translate slash command — translates text into a specified language (defaults to Vietnamese).
 */
export class TranslateCommand implements ISlashCommand {
    public command = COMMANDS.TRANSLATE;
    public i18nParamsExample = '[lang] "text"';
    public i18nDescription = 'Translate text to another language';
    public providesPreview = false;

    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('TranslateCommand');
        } else {
            this.logger = new Logger(logger, 'TranslateCommand');
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
        const requestId = createRequestId('trans');

        if (args.length === 0) {
            this.logger.rejected('translate', 'Missing arguments in /translate command', {
                event: 'translate.rejected',
                requestId,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
            await this.sendUsage(read, modify, room, threadId);
            return;
        }

        let targetLang = 'vi';
        let text: string;

        const firstArg = args[0].toLowerCase();

        // 1. Language code detection:
        // Only treat the first token as a language code when there is remaining
        // text after it — `/translate en hello` selects `en`, while `/translate en`
        // (as the whole input) is translated as prose to the default Vietnamese.
        if (args.length > 1 && SUPPORTED_LANGS[firstArg]) {
            targetLang = firstArg;
            text = args.slice(1).join(' ');
        } else {
            text = args.join(' ');
        }

        if (!text) {
            this.logger.rejected('translate', 'Empty text in /translate command', {
                event: 'translate.rejected',
                requestId,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
            await this.sendUsage(read, modify, room, threadId);
            return;
        }

        this.logger.started('translate', {
            event: 'translate.started',
            requestId,
            roomId: room.id,
            userId: sender.id,
            threadId,
            details: { targetLang, textLength: text.length },
        });

        // 2. Instant typing/placeholder message
        const placeholderId = await sendPlaceholderMessage(
            read,
            modify,
            room,
            '🔍 _Đang dịch văn bản..._',
            threadId,
        );

        try {
            // 3. Call backend translation endpoint
            const client = new BackendClient(http, read, this.logger);
            const translation = await client.translate(text, targetLang, requestId);

            const langName = SUPPORTED_LANGS[targetLang] || targetLang;
            const answer = `**${langName}:**\n\n${translation}`;

            // 4. Upsert placeholder with translated content
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, answer);
            } else {
                await sendMessage(read, modify, room, answer, undefined, threadId);
            }

            this.logger.completed('translate', {
                event: 'translate.completed',
                requestId,
                durationMs: Date.now() - startTime,
                roomId: room.id,
                userId: sender.id,
                threadId,
                details: { targetLang },
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;

            this.logger.failed('translate', error, {
                event: 'translate.failed',
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

    private async sendUsage(
        read: IRead,
        modify: IModify,
        room: IRoom | unknown,
        threadId?: string,
    ): Promise<void> {
        const langList = Object.entries(SUPPORTED_LANGS)
            .map(([code, name]) => `\`${code}\` = ${name}`)
            .join(', ');

        const usage = [
            Formatter.usageCommand(COMMANDS.TRANSLATE, '[lang] "text"'),
            '',
            `**Supported languages:** ${langList}`,
            '',
            '_Default target language: Vietnamese (vi)_',
        ].join('\n');

        await sendMessage(read, modify, room, usage, undefined, threadId);
    }
}
