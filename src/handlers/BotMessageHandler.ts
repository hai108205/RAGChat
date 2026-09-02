import {
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IPostMessageSentToBot } from '@rocket.chat/apps-engine/definition/messages/IPostMessageSentToBot';
import { BackendClient } from '../lib/BackendClient';
import { SessionStore } from '../persistence/sessionStore';
import { Formatter } from '../utils/Formatter';
import { sendMessage, sendMessageWithBlocks, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { readMaxHistory } from '../utils/SettingReader';
import { buildCallbackUrl } from '../utils/CallbackUrl';
import { ERRORS } from '../constants/Errors';
import { BOT_PREFIX, BOT_SUB_COMMANDS } from '../constants/Commands';
import { addSuggestionChipsBlocks } from '../uikit';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

/**
 * Event handler for direct messages (1-on-1 DMs) sent to the App bot user.
 *
 * Implements `IPostMessageSentToBot`.
 *
 * Capabilities:
 * - Bot command dispatcher: `@ai start`, `@ai stats`, `@ai clear`, `@ai help`
 * - RAG Q&A with conversational memory and asynchronous background dispatch
 * - Self-loop suppression (ignores messages from the App user itself)
 */
export class BotMessageHandler implements IPostMessageSentToBot {
    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('BotMessageHandler');
        } else {
            this.logger = new Logger(logger, 'BotMessageHandler');
        }
    }

    /**
     * Main entry point for direct messages sent to the bot.
     */
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

        // Prevent infinite loops by ignoring messages authored by the bot itself
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser || message.sender.id === appUser.id) {
            return;
        }

        const text = message.text.trim();

        // Check if message is a bot sub-command (e.g. `@ai clear` or `@ai stats`)
        if (text.startsWith(BOT_PREFIX)) {
            const rest = text.slice(BOT_PREFIX.length).trim();
            await this.handleBotCommand(rest, message, read, http, persistence, modify);
            return;
        }

        // Process standard conversational question
        await this.handleQuestion(text, message, read, http, persistence, modify);
    }

    /**
     * Routes and handles `@ai <subcommand>` invocations.
     */
    private async handleBotCommand(
        input: string,
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const startTime = Date.now();
        const requestId = createRequestId('botcmd');

        if (!input) {
            await sendMessage(read, modify, message.room, Formatter.formatHelpMessage(), undefined, message.threadId);
            return;
        }

        const [subCommand] = input.split(/\s+/);
        const commandLower = subCommand.toLowerCase();

        this.logger.started('bot_command', {
            event: 'bot.command.started',
            requestId,
            roomId: message.room.id,
            userId: message.sender.id,
            threadId: message.threadId,
            details: { subCommand: commandLower },
        });

        switch (commandLower) {
            case BOT_SUB_COMMANDS.START: {
                const blockBuilder = modify.getCreator().getBlockBuilder();
                blockBuilder.addSectionBlock({
                    text: blockBuilder.newMarkdownTextObject(Formatter.formatWelcomeMessage()),
                });
                addSuggestionChipsBlocks(blockBuilder);
                await sendMessageWithBlocks(read, modify, message.room, Formatter.formatWelcomeMessage(), blockBuilder, message.threadId);
                this.logger.completed('bot_command', { event: 'bot.command.completed', requestId, durationMs: Date.now() - startTime });
                break;
            }

            case BOT_SUB_COMMANDS.STATS: {
                await this.handleStats(message, read, http, modify, requestId);
                this.logger.completed('bot_command', { event: 'bot.command.completed', requestId, durationMs: Date.now() - startTime });
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
                this.logger.completed('bot_command', { event: 'bot.command.completed', requestId, durationMs: Date.now() - startTime, details: { hadHistory: hasHistory } });
                break;
            }

            case BOT_SUB_COMMANDS.HELP: {
                const blockBuilder = modify.getCreator().getBlockBuilder();
                blockBuilder.addSectionBlock({
                    text: blockBuilder.newMarkdownTextObject(Formatter.formatHelpMessage()),
                });
                addSuggestionChipsBlocks(blockBuilder);
                await sendMessageWithBlocks(read, modify, message.room, Formatter.formatHelpMessage(), blockBuilder, message.threadId);
                this.logger.completed('bot_command', { event: 'bot.command.completed', requestId, durationMs: Date.now() - startTime });
                break;
            }

            default: {
                this.logger.rejected('bot_command', `Unknown subcommand: ${commandLower}`, { event: 'bot.command.rejected', requestId });
                await sendMessage(
                    read,
                    modify,
                    message.room,
                    `Unknown command: \`${input}\`. Type \`${BOT_PREFIX} help\` for available commands.`,
                    undefined,
                    message.threadId,
                );
            }
        }
    }

    /**
     * Fetches and displays knowledge base indexing statistics from Node backend.
     */
    private async handleStats(
        message: IMessage,
        read: IRead,
        http: IHttp,
        modify: IModify,
        requestId?: string,
    ): Promise<void> {
        try {
            const client = new BackendClient(http, read, this.logger);
            const settings = read.getEnvironmentReader().getSettings();
            let workspaceId = 'default';
            try {
                const wsSetting = await settings.getValueById('workspace-id');
                if (typeof wsSetting === 'string' && wsSetting.trim()) {
                    workspaceId = wsSetting.trim();
                }
            } catch {
                // Default workspace
            }

            const documents = await client.listDocuments(workspaceId, message.room.id, message.threadId, requestId);
            await sendMessage(read, modify, message.room, Formatter.formatStats(documents), undefined, message.threadId);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, message.room, errMsg, undefined, message.threadId);
        }
    }

    /**
     * Handles regular text questions sent directly to the bot in DM.
     * Uses the async integration job pattern to guarantee instant response and avoid Deno runtime timeouts.
     */
    private async handleQuestion(
        text: string,
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const startTime = Date.now();
        const requestId = createRequestId('dm');

        this.logger.started('ask', {
            event: 'request.started',
            requestId,
            roomId: message.room.id,
            userId: message.sender.id,
            threadId: message.threadId,
            details: { textLength: text.length },
        });

        // 1. Instant feedback message returned in <100ms
        const placeholderId = await sendPlaceholderMessage(
            read, modify, message.room,
            '🔍 _Đang tra cứu tài liệu và suy nghĩ câu trả lời..._',
            message.threadId,
        );

        try {
            const client = new BackendClient(http, read, this.logger);
            const sessionStore = new SessionStore(read, persistence);

            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = readMaxHistory(await settings.getValueById('max-history'));
            let workspaceId = 'default';
            try {
                const wsSetting = await settings.getValueById('workspace-id');
                if (typeof wsSetting === 'string' && wsSetting.trim()) {
                    workspaceId = wsSetting.trim();
                }
            } catch {
                // Default workspace
            }

            const history = await sessionStore.getHistory(message.sender.id, message.room.id, message.threadId, maxHistory);
            const callbackUrl = await buildCallbackUrl(read);

            // 2. Enqueue async job to backend — results return via CallbackEndpoint
            const response = await client.askAsync(
                text,
                message.sender.id,
                message.room.id,
                message.threadId,
                placeholderId,
                history,
                requestId,
                workspaceId,
                callbackUrl,
            );

            this.logger.accepted('ask', {
                event: 'request.accepted',
                requestId,
                jobId: response.job_id,
                durationMs: Date.now() - startTime,
                roomId: message.room.id,
                userId: message.sender.id,
                threadId: message.threadId,
                details: { placeholderId, status: response.status },
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;

            this.logger.failed('ask', error, {
                event: 'request.failed',
                requestId,
                durationMs,
                roomId: message.room.id,
                userId: message.sender.id,
                threadId: message.threadId,
                errorMessage: errMsg,
            });

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
}
