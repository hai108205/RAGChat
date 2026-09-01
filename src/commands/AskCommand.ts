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
import { readMaxHistory } from '../utils/SettingReader';
import { buildCallbackUrl } from '../utils/CallbackUrl';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';

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

        // Instant feedback for RAG call
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
            const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const callbackUrl = await buildCallbackUrl(read);

            // Enqueue async job to Node backend.
            // Executor terminates immediately in < 2 seconds, avoiding Rocket.Chat 10s Deno timeout.
            // Backend processes the query and updates the placeholder via CallbackEndpoint.
            await client.askAsync(
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
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
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
