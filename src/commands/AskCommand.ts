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
import { SessionStore } from '../persistence/sessionStore';
import { Formatter } from '../utils/Formatter';
import { sendMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';

export class AskCommand implements ISlashCommand {
    public command = COMMANDS.ASK;
    public i18nParamsExample = '"your question"';
    public i18nDescription = 'Ask RAGChat a question using document knowledge';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        if (args.length === 0) {
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.ASK, '"your question"'));
            return;
        }

        const query = args.join(' ');

        try {
            const client = new BackendClient(http, read);
            const sessionStore = new SessionStore(read, persis);

            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (await settings.getValueById('max-history')) as number;

            const history = await sessionStore.getHistory(sender.id, maxHistory);
            const response = await client.ask(query, sender.id, room.id, history);

            await sessionStore.addMessage(sender.id, {
                role: 'user',
                content: query,
                timestamp: Date.now(),
            }, maxHistory);

            await sessionStore.addMessage(sender.id, {
                role: 'assistant',
                content: response.answer,
                timestamp: Date.now(),
            }, maxHistory);

            const enableCitations = await settings.getValueById('enable-citations');
            const attachment = enableCitations
                ? Formatter.formatSources(response.sources)
                : undefined;

            await sendMessage(read, modify, room, response.answer, attachment);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, room, message);
        }
    }
}
