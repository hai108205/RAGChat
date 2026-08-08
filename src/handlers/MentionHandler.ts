import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages/IPostMessageSent';
import { BackendClient } from '../lib/BackendClient';
import { SessionStore } from '../persistence/sessionStore';
import { Formatter } from '../utils/Formatter';
import { sendMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { BOT_PREFIX } from '../constants/Commands';

/**
 * Handles @mentions of the bot in channels and groups.
 * DMs are handled by BotMessageHandler (IPostMessageSentToBot).
 */
export class MentionHandler implements IPostMessageSent {
    public async checkPostMessageSent(
        message: IMessage,
        read: IRead,
        _http?: IHttp,
    ): Promise<boolean> {
        if (!message.text || !message.text.trim()) {
            return false;
        }

        // DMs go through IPostMessageSentToBot instead
        if (message.room.type === RoomType.DIRECT_MESSAGE) {
            return false;
        }

        const appUser = await read.getUserReader().getAppUser();
        if (!appUser || message.sender.id === appUser.id) {
            return false;
        }

        return this.isMentioned(message.text, appUser.username);
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser) {
            return;
        }

        const question = this.stripMention(message.text || '', appUser.username).trim();
        if (!question) {
            await sendMessage(
                read, modify, message.room,
                Formatter.formatHelpMessage(),
                undefined,
                message.threadId,
            );
            return;
        }

        try {
            const client = new BackendClient(http, read);
            const sessionStore = new SessionStore(read, persistence);

            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (await settings.getValueById('max-history')) as number;

            const history = await sessionStore.getHistory(message.sender.id, maxHistory);
            const response = await client.ask(
                question,
                message.sender.id,
                message.room.id,
                history,
            );

            await sessionStore.addMessage(message.sender.id, {
                role: 'user',
                content: question,
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

            await sendMessage(read, modify, message.room, response.answer, attachment, message.threadId);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
        }
    }

    private isMentioned(text: string, botUsername: string): boolean {
        const mention = new RegExp(`@${this.escapeRegExp(botUsername)}\\b`, 'i');
        return mention.test(text) || text.trim().startsWith(BOT_PREFIX);
    }

    private stripMention(text: string, botUsername: string): string {
        const mention = new RegExp(`@${this.escapeRegExp(botUsername)}\\b`, 'gi');
        let stripped = text.replace(mention, '');
        if (stripped.trim().startsWith(BOT_PREFIX)) {
            stripped = stripped.trim().slice(BOT_PREFIX.length);
        }
        return stripped;
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
