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
import { Formatter } from '../utils/Formatter';
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';

/**
 * /explain slash command — explains concepts or technical terms in simple language.
 */
export class ExplainCommand implements ISlashCommand {
    public command = COMMANDS.EXPLAIN;
    public i18nParamsExample = '"concept to explain"';
    public i18nDescription = 'Explain a concept in simple terms';
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
        const threadId = context.getThreadId();

        if (args.length === 0) {
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
            const client = new BackendClient(http, read);
            const explanation = await client.explain(concept);
            const answer = `**${concept}:**\n\n${explanation}`;

            // 3. Upsert placeholder with result
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, answer);
            } else {
                await sendMessage(read, modify, room, answer, undefined, threadId);
            }
        } catch (error: unknown) {
            // 4. Safe error handling with editor validation and message fallback
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
