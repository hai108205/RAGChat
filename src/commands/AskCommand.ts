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
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { readBoolean, readMaxHistory } from '../utils/SettingReader';
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
        const threadId = context.getThreadId();

        if (args.length === 0) {
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.ASK, '"your question"'), undefined, threadId);
            return;
        }

        const query = args.join(' ');

        // Instant feedback for potentially long RAG call
        const placeholderId = await sendPlaceholderMessage(
            read, modify, room,
            '🔍 _Đang tra cứu tài liệu và suy nghĩ câu trả lời..._',
            threadId,
        );

        try {
            const client = new BackendClient(http, read);
            const sessionStore = new SessionStore(read, persis);

            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = readMaxHistory(await settings.getValueById('max-history'));

            const history = await sessionStore.getHistory(sender.id, room.id, threadId, maxHistory);
            const response = await client.ask(query, sender.id, room.id, history);

            await sessionStore.addMessages(sender.id, room.id, threadId, [
                { role: 'user', content: query, timestamp: Date.now() },
                { role: 'assistant', content: response.answer, timestamp: Date.now() },
            ], maxHistory);

            const enableCitations = readBoolean(await settings.getValueById('enable-citations'));
            const attachment = enableCitations
                ? Formatter.formatSources(response.sources)
                : undefined;

            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, response.answer, attachment);
            } else {
                await sendMessage(read, modify, room, response.answer, attachment, threadId);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, message, undefined);
            } else {
                await sendMessage(read, modify, room, message);
            }
        }
    }
}
