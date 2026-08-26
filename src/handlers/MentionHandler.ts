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
import { sendMessage, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { readBoolean, readMaxHistory } from '../utils/SettingReader';
import { ERRORS } from '../constants/Errors';
import { BOT_PREFIX, BOT_SUB_COMMANDS } from '../constants/Commands';

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

        // `@ai <command>` in a channel is a command, not a question. Detect it
        // from the raw text (before mention stripping), then route so
        // `clear`/`stats`/`help`/`start` act here exactly as they do in DMs.
        const command = this.detectCommand(message.text || '', appUser.username);
        if (command) {
            await this.runCommand(command, message, read, http, persistence, modify);
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
                question,
                message.sender.id,
                message.room.id,
                history,
            );

            await sessionStore.addMessages(message.sender.id, message.room.id, message.threadId, [
                { role: 'user', content: question, timestamp: Date.now() },
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

    private async runCommand(
        command: string,
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        switch (command) {
            case BOT_SUB_COMMANDS.START: {
                await sendMessage(read, modify, message.room, Formatter.formatWelcomeMessage(), undefined, message.threadId);
                break;
            }

            case BOT_SUB_COMMANDS.HELP: {
                await sendMessage(read, modify, message.room, Formatter.formatHelpMessage(), undefined, message.threadId);
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

            case BOT_SUB_COMMANDS.STATS: {
                try {
                    const client = new BackendClient(http, read);
                    const documents = await client.listDocuments();
                    await sendMessage(read, modify, message.room, Formatter.formatStats(documents), undefined, message.threadId);
                } catch (error: unknown) {
                    const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
                    await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
                }
                break;
            }
        }
    }

    /**
     * Extract a bot sub-command from a raw channel message, or ``undefined``
     * when the message is a plain question. Matches ``@ai clear`` directly and
     * ``@bot @ai clear`` (mention followed by the command prefix).
     */
    private detectCommand(text: string, botUsername: string): string | undefined {
        const trimmed = text.trim();
        if (!trimmed) {
            return undefined;
        }

        const mention = new RegExp(`^@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'i');
        const bare = trimmed.replace(mention, '').trim();

        const command = new RegExp(`^${this.escapeRegExp(BOT_PREFIX)}(?=$|[\\s])`, 'i');
        if (!command.test(bare)) {
            return undefined;
        }

        const token = bare.replace(command, '').trim().split(/\s+/)[0].toLowerCase();
        return Object.values(BOT_SUB_COMMANDS).includes(token as any) ? token : undefined;
    }

    private isMentioned(text: string, botUsername: string): boolean {
        const trimmed = text.trim();
        // Explicit `@bot` mention — the boundary uses a lookahead so a trailing
        // non-word character (hyphen, dot, etc.) still terminates the match.
        const botMention = new RegExp(`@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'i');
        // Prefix command: `@ai ...` can appear anywhere in the message now.
        const prefixMention = new RegExp(`(^|\\s)${this.escapeRegExp(BOT_PREFIX)}(?=$|[\\s,.;:'"!?])`, 'i');
        return botMention.test(trimmed) || prefixMention.test(trimmed);
    }

    private stripMention(text: string, botUsername: string): string {
        const botMention = new RegExp(`@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'gi');
        const prefixMention = new RegExp(`(^|\\s)${this.escapeRegExp(BOT_PREFIX)}(?=$|[\\s,.;:'"!?])`, 'gi');
        return text
            .replace(botMention, '')
            .replace(prefixMention, '')
            .trim();
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
