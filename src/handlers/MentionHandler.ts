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
import { readMaxHistory } from '../utils/SettingReader';
import { ERRORS } from '../constants/Errors';
import { BOT_PREFIX, BOT_SUB_COMMANDS } from '../constants/Commands';

/**
 * Handles @mentions of the bot in public and private channels / discussions.
 * Direct messages (DMs) are handled separately by `BotMessageHandler` (IPostMessageSentToBot).
 *
 * Implements `IPostMessageSent`.
 *
 * Capabilities:
 * - Two-phase gate execution (`checkPostMessageSent` -> `executePostMessageSent`)
 * - Mentions filtering: `@bot username` or prefix `@ai`
 * - Sub-command execution in channels (`@ai clear`, `@ai stats`, `@ai help`, `@ai start`)
 * - RAG Q&A with async background worker dispatch and citation attachment updates
 */
export class MentionHandler implements IPostMessageSent {
    /**
     * Gate method: Determines whether this handler should execute for the incoming message.
     */
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

    /**
     * Main action method executed when `checkPostMessageSent` returns true.
     */
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

        // 1. Detect sub-commands (e.g. `@ai clear` or `@bot @ai clear`)
        const command = this.detectCommand(message.text || '', appUser.username);
        if (command) {
            await this.runCommand(command, message, read, http, persistence, modify);
            return;
        }

        // 2. Strip bot mention to extract the actual user question
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

        // 3. Instant feedback placeholder in channel/thread
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
            const requestId = `mention-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

            // 4. Enqueue async job to ARQ worker — results return via CallbackEndpoint
            await client.askAsync(
                question,
                message.sender.id,
                message.room.id,
                message.threadId,
                placeholderId,
                history,
                requestId,
            );
        } catch (error: unknown) {
            // 5. Fallback error handling
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            if (placeholderId) {
                try {
                    await updateMessage(placeholderId, read, modify, errMsg, undefined);
                } catch {
                    await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
                }
            } else {
                await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
            }
        }
    }

    /**
     * Executes sub-commands in channels.
     */
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
     * Extract a bot sub-command from a raw channel message, or `undefined`
     * when the message is a plain question.
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

    /**
     * Checks if the message explicitly mentions the bot username or uses the @ai prefix.
     */
    private isMentioned(text: string, botUsername: string): boolean {
        const trimmed = text.trim();
        const botMention = new RegExp(`@${this.escapeRegExp(botUsername)}(?=$|[\\s,.;:'"!?])`, 'i');
        const prefixMention = new RegExp(`(^|\\s)${this.escapeRegExp(BOT_PREFIX)}(?=$|[\\s,.;:'"!?])`, 'i');
        return botMention.test(trimmed) || prefixMention.test(trimmed);
    }

    /**
     * Strips bot mentions and prefixes from message text to extract the clean question.
     */
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

