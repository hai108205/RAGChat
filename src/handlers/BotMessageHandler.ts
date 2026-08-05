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
import { sendMessage } from '../utils/MessageHelper';
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
        _http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        if (!input) {
            await sendMessage(read, modify, message.room, Formatter.formatHelpMessage());
            return;
        }

        const [subCommand] = input.split(/\s+/);

        switch (subCommand.toLowerCase()) {
            case BOT_SUB_COMMANDS.CLEAR: {
                const sessionStore = new SessionStore(read, persistence);
                const hasHistory = await sessionStore.hasHistory(message.sender.id);
                if (hasHistory) {
                    await sessionStore.clearHistory(message.sender.id);
                    await sendMessage(read, modify, message.room, ERRORS.HISTORY_CLEARED);
                } else {
                    await sendMessage(read, modify, message.room, ERRORS.EMPTY_HISTORY);
                }
                break;
            }

            case BOT_SUB_COMMANDS.HELP: {
                await sendMessage(read, modify, message.room, Formatter.formatHelpMessage());
                break;
            }

            default: {
                await sendMessage(
                    read, modify, message.room,
                    `Unknown command: \`${input}\`. Type \`${BOT_PREFIX} help\` for available commands.`,
                );
            }
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
        try {
            const client = new BackendClient(http, read);
            const sessionStore = new SessionStore(read, persistence);

            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (await settings.getValueById('max-history')) as number;

            const history = await sessionStore.getHistory(message.sender.id, maxHistory);
            const response = await client.ask(
                text,
                message.sender.id,
                message.room.id,
                history,
            );

            await sessionStore.addMessage(message.sender.id, {
                role: 'user',
                content: text,
                timestamp: Date.now(),
            }, maxHistory);

            await sessionStore.addMessage(message.sender.id, {
                role: 'assistant',
                content: response.answer,
                timestamp: Date.now(),
            }, maxHistory);

            const enableCitations = await settings.getValueById('enable-citations');
            const attachment = enableCitations
                ? Formatter.formatSources(response.sources)
                : undefined;

            await sendMessage(read, modify, message.room, response.answer, attachment);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, message.room, errMsg);
        }
    }
}
