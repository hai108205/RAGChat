import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IPostMessageSentToBot } from '@rocket.chat/apps-engine/definition/messages/IPostMessageSentToBot';
import { BackendClient } from '../lib/BackendClient';
import { SessionStore } from '../persistence/sessionStore';
import { Formatter } from '../utils/Formatter';
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { readBoolean, readMaxHistory } from '../utils/SettingReader';
import { ERRORS } from '../constants/Errors';
import { BOT_PREFIX, BOT_SUB_COMMANDS } from '../constants/Commands';

export class BotMessageHandler implements IPostMessageSentToBot {
    public async executePostMessageSentToBot(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        if (!message.text || !message.text.trim()) {
            return;
        }

        const appUser = await read.getUserReader().getAppUser();
        if (!appUser || message.sender.id === appUser.id) {
            return;
        }

        const text = message.text.trim();

        if (text.startsWith(BOT_PREFIX)) {
            const rest = text.slice(BOT_PREFIX.length).trim();
            await this.handleBotCommand(rest, message, read, http, persistence, modify);
            return;
        }

        await this.handleQuestion(text, message, read, http, persistence, modify);
    }

    private async handleBotCommand(
        input: string,
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        if (!input) {
            await sendMessage(read, modify, message.room, Formatter.formatHelpMessage(), undefined, message.threadId);
            return;
        }

        const [subCommand] = input.split(/\s+/);

        switch (subCommand.toLowerCase()) {
            case BOT_SUB_COMMANDS.START: {
                await sendMessage(read, modify, message.room, Formatter.formatWelcomeMessage(), undefined, message.threadId);
                break;
            }

            case BOT_SUB_COMMANDS.STATS: {
                await this.handleStats(message, read, http, modify);
                break;
            }

            case BOT_SUB_COMMANDS.CLEAR: {
                const sessionStore = new SessionStore(read, persistence);
                const hasHistory = await sessionStore.hasHistory(message.sender.id, message.room.id, message.threadId);
                if (hasHistory) {
                    await sessionStore.clearHistory(message.sender.id, message.room.id, message.threadId);
                    await sendMessage(read, modify, message.room, ERRORS.HISTORY_CLEARED, undefined, message.threadId);
                } else {
                    await sendMessage(read, modify, message.room, ERRORS.EMPTY_HISTORY, undefined, message.threadId);
                }
                break;
            }

            case BOT_SUB_COMMANDS.HELP: {
                await sendMessage(read, modify, message.room, Formatter.formatHelpMessage(), undefined, message.threadId);
                break;
            }

            default: {
                await sendMessage(read, modify, message.room, `Unknown command: \`${input}\`. Type \`${BOT_PREFIX} help\` for available commands.`, undefined, message.threadId);
            }
        }
    }

    private async handleStats(
        message: IMessage,
        read: IRead,
        http: IHttp,
        modify: IModify,
    ): Promise<void> {
        try {
            const client = new BackendClient(http, read);
            const documents = await client.listDocuments();
            await sendMessage(read, modify, message.room, Formatter.formatStats(documents), undefined, message.threadId);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
        }
    }

    private async handleQuestion(
        text: string,
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        // Instant feedback so user never sees "still loading" for 3–20s
        const placeholderId = await sendPlaceholderMessage(
            read, modify, message.room,
            '🔍 _Đang tra cứu tài liệu và suy nghĩ câu trả lời..._',
            message.threadId,
        );

        try {
            const client = new BackendClient(http, read);
            const sessionStore = new SessionStore(read, persistence);

            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = readMaxHistory(await settings.getValueById('max-history'));

            const history = await sessionStore.getHistory(message.sender.id, message.room.id, message.threadId, maxHistory);
            const response = await client.ask(
                text,
                message.sender.id,
                message.room.id,
                history,
            );

            await sessionStore.addMessages(message.sender.id, message.room.id, message.threadId, [
                { role: 'user', content: text, timestamp: Date.now() },
                { role: 'assistant', content: response.answer, timestamp: Date.now() },
            ], maxHistory);

            const enableCitations = readBoolean(await settings.getValueById('enable-citations'));
            const attachment = enableCitations
                ? Formatter.formatSources(response.sources)
                : undefined;

            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, response.answer, attachment);
            } else {
                await sendMessage(read, modify, message.room, response.answer, attachment, message.threadId);
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                await updateMessage(placeholderId, read, modify, errMsg, undefined);
            } else {
                await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
            }
        }
    }
}
