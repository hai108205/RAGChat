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

        if (args.length === 0) {
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.EXPLAIN, '"concept"'));
            return;
        }

        const concept = args.join(' ');

        try {
            const client = new BackendClient(http, read);
            const explanation = await client.explain(concept);
            await sendMessage(read, modify, room, `**${concept}:**\n\n${explanation}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, room, message);
        }
    }
}
