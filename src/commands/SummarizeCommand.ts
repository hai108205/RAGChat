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

export class SummarizeCommand implements ISlashCommand {
    public command = COMMANDS.SUMMARIZE;
    public i18nParamsExample = '"text to summarize"';
    public i18nDescription = 'Summarize the provided text';
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
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.SUMMARIZE, '"text"'), undefined, threadId);
            return;
        }

        const text = args.join(' ');

        const placeholderId = await sendPlaceholderMessage(
            read, modify, room,
            '🔍 _Đang tóm tắt văn bản..._',
            threadId,
        );

        try {
            const client = new BackendClient(http, read);
            const summary = await client.summarize(text);
            const answer = `**Summary:**\n\n${summary}`;

            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, answer);
            } else {
                await sendMessage(read, modify, room, answer, undefined, threadId);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, message);
            } else {
                await sendMessage(read, modify, room, message, undefined, threadId);
            }
        }
    }
}
