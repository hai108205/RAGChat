import {
    IHttp,
    ILogger,
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
import { readMaxHistory } from '../utils/SettingReader';
import { buildCallbackUrl } from '../utils/CallbackUrl';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

/**
 * /ask slash command — answers questions using RAG (Retrieval-Augmented Generation).
 *
 * Architecture note:
 * Rocket.Chat Apps Engine (Deno runtime) enforces a strict 10-second timeout on
 * slash command execution. Since RAG queries with embedding retrieval and LLM
 * generation can exceed this budget (e.g. 5-20s), AskCommand uses an asynchronous
 * enqueue pattern:
 * 1. Posts an instant placeholder message ('Đang tra cứu tài liệu...').
 * 2. Enqueues the chat task to the Node.js backend integration queue (returns HTTP 202 in <1s).
 * 3. Command finishes immediately, safely releasing the Deno execution thread.
 * 4. The backend processes the query and notifies CallbackEndpoint.ts when done to upsert the placeholder.
 */
export class AskCommand implements ISlashCommand {
    public command = COMMANDS.ASK;
    public i18nParamsExample = '"your question"';
    public i18nDescription = 'Ask RAGChat a question using document knowledge';
    public providesPreview = false;

    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('AskCommand');
        } else {
            this.logger = new Logger(logger, 'AskCommand');
        }
    }

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const startTime = Date.now();
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();
        const threadId = context.getThreadId();
        const requestId = createRequestId('ask');

        if (args.length === 0) {
            this.logger.rejected('ask', 'Missing question argument in /ask command', {
                event: 'request.rejected',
                requestId,
                roomId: room.id,
                userId: sender.id,
                threadId,
            });
            await sendMessage(read, modify, room, Formatter.usageCommand(COMMANDS.ASK, '"your question"'), undefined, threadId);
            return;
        }

        const query = args.join(' ');

        this.logger.started('ask', {
            event: 'request.started',
            requestId,
            roomId: room.id,
            userId: sender.id,
            threadId,
            details: { queryLength: query.length },
        });

        // Instant feedback for RAG call
        const placeholderId = await sendPlaceholderMessage(
            read, modify, room,
            '🔍 _Đang tra cứu tài liệu và suy nghĩ câu trả lời..._',
            threadId,
        );

        try {
            const client = new BackendClient(http, read, this.logger);
            const sessionStore = new SessionStore(read, persis);

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

            const history = await sessionStore.getHistory(sender.id, room.id, threadId, maxHistory);
            const callbackUrl = await buildCallbackUrl(read);

            // Enqueue async job to Node backend.
            const response = await client.askAsync(
                query,
                sender.id,
                room.id,
                threadId,
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
                roomId: room.id,
                userId: sender.id,
                threadId,
                details: { placeholderId, status: response.status },
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;

            this.logger.failed('ask', error, {
                event: 'request.failed',
                requestId,
                durationMs,
                roomId: room.id,
                userId: sender.id,
                threadId,
                errorMessage: message,
            });

            if (placeholderId) {
                try {
                    await updateMessage(placeholderId, read, modify, message, undefined);
                } catch {
                    await sendMessage(read, modify, room, message, undefined, threadId);
                }
            } else {
                await sendMessage(read, modify, room, message, undefined, threadId);
            }
        }
    }
}
