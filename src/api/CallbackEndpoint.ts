import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    IApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';
import { SessionStore } from '../persistence/sessionStore';
import { saveMessageActionPayload } from '../persistence/messagePayloadStore';
import { CitationSource, Formatter } from '../utils/Formatter';
import { Logger } from '../utils/Logger';
import { sendMessage, updateMessage } from '../utils/MessageHelper';
import { readBoolean, readMaxHistory } from '../utils/SettingReader';
import { asNonEmptyString } from '../utils/Validator';
import { buildActionButtonsBlock } from '../uikit';

// In-memory set for deduplicating recent callback request IDs (bounded FIFO)
const processedRequests = new Set<string>();

/**
 * Webhook callback REST API endpoint for the Node.js RAG backend.
 *
 * Route: POST /api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback
 *
 * Architecture Role:
 * The backend processes heavy RAG operations (document parsing, chunking, embedding generation, LLM streaming)
 * asynchronously in background workers. Once a job finishes or fails, the backend triggers this webhook callback.
 *
 * Supported Events:
 * - `chat_completed`: Upserts the original placeholder message with final LLM answer & citations,
 *                     then appends the turn to persistent session history.
 * - `chat_failed`: Upserts the placeholder with an error message.
 * - `indexing_complete`: Sends a notification in the room confirming document indexing.
 * - `indexing_failed`: Sends an error notification in the room explaining why indexing failed.
 */
export class CallbackEndpoint extends ApiEndpoint implements IApiEndpoint {
    public path = 'callback';

    /**
     * Handles incoming POST webhook notifications from backend.
     */
    public async post(
        request: IApiRequest,
        _endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        _http: IHttp,
        persis: IPersistence,
    ): Promise<IApiResponse> {
        const logger = new Logger(this.app.getLogger(), 'CallbackEndpoint');
        const body = request.content as Record<string, unknown>;

        // 1. Authentication check:
        // Validate the shared integration token (or legacy api-key) if configured.
        if (!(await this.authorize(request, read))) {
            logger.warn('Rejected unauthenticated callback from backend');
            return {
                status: 401,
                content: { error: 'Unauthorized' },
            };
        }

        logger.info('Received callback event', { event: body.event, room_id: body.room_id });

        const event = body.event as string | undefined;
        const userId = body.user_id as string | undefined;
        const roomId = body.room_id as string | undefined;
        const message = body.message as string | undefined;
        const requestId = body.request_id as string | undefined;

        // 2. Validate mandatory envelope fields
        if (!event || !userId || !roomId) {
            return {
                status: 400,
                content: { error: 'Missing required fields: event, user_id, room_id' },
            };
        }

        // 3. Idempotency guard:
        // Prevents processing the same callback twice in case of network retries.
        if (requestId && processedRequests.has(requestId)) {
            logger.info('Duplicate callback ignored', { requestId });
            return {
                status: 200,
                content: { status: 'ok', detail: 'duplicate ignored' },
            };
        }

        try {
            const user = await read.getUserReader().getById(userId);
            const room = await read.getRoomReader().getById(roomId);

            if (!user || !room) {
                return {
                    status: 404,
                    content: { error: 'User or room not found' },
                };
            }

            const settings = read.getEnvironmentReader().getSettings();

            // 4. Dispatch event logic
            switch (event) {
                case 'chat_completed': {
                    const placeholderId = body.placeholder_id as string | undefined;
                    const threadId = body.thread_id as string | undefined;
                    const query = body.query as string | undefined;
                    const answer = asNonEmptyString(body.answer, 'Không nhận được câu trả lời.');
                    const rawSources = (body.sources as Array<Record<string, unknown>>) || [];

                    // Normalize sources from backend
                    const sources: CitationSource[] = rawSources.map((s) => {
                        let relevance = typeof s.relevance === 'number' ? s.relevance : 0;
                        if (typeof s.score === 'number' && !s.relevance) {
                            relevance = (s.score as number) > 1 ? (s.score as number) / 100 : (s.score as number);
                        }
                        return {
                            title: (s.title as string) || (s.heading as string) || 'Document',
                            snippet: (s.snippet as string) || (s.chunkText as string) || (s.body as string) || '',
                            pageUrl: (s.pageUrl as string) || (s.url as string) || '',
                            relevance: isNaN(relevance) ? 0 : relevance,
                        };
                    });

                    // Check if citations are enabled by administrator
                    const enableCitations = readBoolean(await settings.getValueById('enable-citations'));
                    const attachment = enableCitations && sources.length > 0
                        ? Formatter.formatSources(sources)
                        : undefined;

                    // Persist heavy fields (rawMarkdown, sources, query) so button values stay small.
                    // Buttons only carry `{ action, messageId, ... }`; the interaction handler
                    // looks up the full payload from App Persistence.
                    if (placeholderId) {
                        try {
                            await saveMessageActionPayload(persis, {
                                messageId: placeholderId,
                                chatMessageId: body.chat_message_id as string | undefined,
                                query,
                                rawMarkdown: answer,
                                sources,
                                sourcesCount: sources.length,
                                createdAt: Date.now(),
                            });
                        } catch (persistErr) {
                            logger.warn('Failed to persist message action payload', persistErr);
                        }
                    }

                    // Build interactive action buttons block (👍, 👎, 🔄, 📋, 🔍)
                    const blockBuilder = modify.getCreator().getBlockBuilder();
                    buildActionButtonsBlock(blockBuilder, {
                        messageId: placeholderId,
                        chatMessageId: body.chat_message_id as string | undefined,
                        query,
                        sourcesCount: sources.length,
                    });

                    // Update placeholder message in-place or fallback to sending a new message
                    if (placeholderId) {
                        try {
                            await updateMessage(placeholderId, read, modify, answer, attachment, blockBuilder);
                        } catch {
                            await sendMessage(read, modify, room, answer, attachment, threadId);
                        }
                    } else {
                        await sendMessage(read, modify, room, answer, attachment, threadId);
                    }

                    // Append user query + assistant answer to persistent session history
                    if (query) {
                        const sessionStore = new SessionStore(read, persis);
                        const maxHistory = readMaxHistory(await settings.getValueById('max-history'));
                        await sessionStore.addMessages(userId, roomId, threadId, [
                            { role: 'user', content: query, timestamp: Date.now() },
                            { role: 'assistant', content: answer, timestamp: Date.now() },
                        ], maxHistory);
                    }
                    break;
                }

                case 'chat_failed': {
                    const placeholderId = body.placeholder_id as string | undefined;
                    const threadId = body.thread_id as string | undefined;
                    const error = asNonEmptyString(body.error, 'Không thể hoàn thành câu trả lời.');
                    const errorMsg = `❌ **Lỗi phản hồi:** ${error}`;

                    if (placeholderId) {
                        try {
                            await updateMessage(placeholderId, read, modify, errorMsg, undefined);
                        } catch {
                            await sendMessage(read, modify, room, errorMsg, undefined, threadId);
                        }
                    } else {
                        await sendMessage(read, modify, room, errorMsg, undefined, threadId);
                    }
                    break;
                }

                case 'indexing_complete': {
                    const docName = (body.document_name as string) || (body.filename as string) || 'Unknown';
                    const chunksCount = (body.chunks_count as number) || 0;
                    await sendMessage(
                        read, modify, room,
                        `✅ **Document Indexed:** \`${docName}\` (${chunksCount} chunks)`,
                        undefined,
                        body.thread_id as string | undefined,
                    );
                    break;
                }

                case 'indexing_failed': {
                    const docName = (body.document_name as string) || (body.filename as string) || 'Unknown';
                    const error = (body.error as string) || 'Unknown error';
                    await sendMessage(
                        read, modify, room,
                        `❌ **Indexing Failed:** \`${docName}\` — ${error}`,
                        undefined,
                        body.thread_id as string | undefined,
                    );
                    break;
                }

                default: {
                    if (message) {
                        await sendMessage(read, modify, room, message);
                    } else {
                        logger.warn(`Unknown callback event: ${event}`);
                    }
                }
            }

            // 5. Track request ID in bounded cache
            if (requestId) {
                processedRequests.add(requestId);
                if (processedRequests.size > 1000) {
                    const firstItem = processedRequests.values().next().value;
                    if (firstItem) {
                        processedRequests.delete(firstItem);
                    }
                }
            }

            return {
                status: 200,
                content: { status: 'ok' },
            };
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Callback processing failed';
            logger.error('Callback processing exception', errMsg);
            return {
                status: 500,
                content: { error: errMsg },
            };
        }
    }

    /**
     * Health check endpoint for GET requests.
     */
    public async get(
        _request: IApiRequest,
        _endpoint: IApiEndpointInfo,
        _read: IRead,
        _modify: IModify,
        _http: IHttp,
        _persis: IPersistence,
    ): Promise<IApiResponse> {
        return {
            status: 200,
            content: { status: 'RAGChat Callback Endpoint active' },
        };
    }

    /**
     * Validates the incoming Authorization Bearer token against `integration-token` or `api-key`.
     *
     * Returns `false` when:
     * - no token is configured AND `allow-unauthenticated-callbacks-dev` is not enabled
     * - the request does not carry `Authorization: Bearer <expected-token>`
     */
    private async authorize(request: IApiRequest, read: IRead): Promise<boolean> {
        const settings = read.getEnvironmentReader().getSettings();

        let expectedToken = '';
        try {
            const intToken = await settings.getValueById('integration-token');
            if (typeof intToken === 'string' && intToken.trim().length > 0) {
                expectedToken = intToken.trim();
            }
        } catch {
            // Setting might not exist yet
        }

        if (!expectedToken) {
            const apiKey = await settings.getValueById('api-key');
            if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
                expectedToken = apiKey.trim();
            }
        }

        if (!expectedToken) {
            // No token configured — only allow when the explicit dev-mode flag is set.
            let devAllowed = false;
            try {
                const flag = await settings.getValueById('allow-unauthenticated-callbacks-dev');
                devAllowed = flag === true;
            } catch {
                devAllowed = false;
            }

            if (devAllowed) {
                const logger = new Logger(this.app.getLogger(), 'CallbackEndpoint');
                logger.warn(
                    '[DEV MODE] Accepting unauthenticated callback — ' +
                    'no integration-token/api-key configured and allow-unauthenticated-callbacks-dev=true.',
                );
                return true;
            }

            return false;
        }

        const headers = request.headers || {};
        const authHeader = headers['Authorization'] ?? headers['authorization'];
        return typeof authHeader === 'string' && authHeader === `Bearer ${expectedToken}`;
    }
}