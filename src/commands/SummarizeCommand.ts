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
import { sendMessage } from '../utils/MessageHelper';
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

        if (args.length === 0) {
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.SUMMARIZE, '"text"'));
            return;
        }

        const text = args.join(' ');

        try {
            const client = new BackendClient(http, read);
            const summary = await client.summarize(text);
            await sendMessage(read, modify, room, `**Summary:**\n\n${summary}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, room, message);
        }
    }
}
