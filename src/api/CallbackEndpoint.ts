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
        const body = (request.content || {}) as Record<string, unknown>;

        const bodyData = (body.data || {}) as Record<string, unknown>;
        const event = (body.event as string | undefined) || (bodyData.event as string | undefined);
        const userId = (body.user_id as string | undefined) || (bodyData.user_id as string | undefined);
        const roomId = (body.room_id as string | undefined) || (bodyData.room_id as string | undefined);
        const message = (body.message as string | undefined) || (bodyData.message as string | undefined);
        const requestId = (body.request_id as string | undefined) || (body.requestId as string | undefined) || (bodyData.request_id as string | undefined);
        const jobId = (body.job_id as string | undefined) || (body.jobId as string | undefined) || (bodyData.job_id as string | undefined);

        // 1. Authentication check:
        // Validate the shared integration token (or legacy api-key) if configured.
        if (!(await this.authorize(request, read))) {
            logger.rejected('callback', 'Unauthorized callback request', {
                event: 'callback.rejected',
                statusCode: 401,
                requestId,
                roomId,
                userId,
            });
            return {
                status: 401,
                content: { error: 'Unauthorized' },
            };
        }

        logger.debug('Received callback event', {
            event: 'callback.received',
            operation: 'callback',
            phase: 'in_progress',
            requestId,
            jobId,
            roomId,
            userId,
            details: { callbackEvent: event },
        });

        // 2. Validate mandatory envelope fields
        if (!event || !userId || !roomId) {
            logger.rejected('callback', 'Missing required fields: event, user_id, room_id', {
                event: 'callback.rejected',
                statusCode: 400,
                requestId,
                details: { hasEvent: Boolean(event), hasUserId: Boolean(userId), hasRoomId: Boolean(roomId) },
            });
            return {
                status: 400,
                content: { error: 'Missing required fields: event, user_id, room_id' },
            };
        }

        // 3. Idempotency guard:
        // Prevents processing the same callback twice in case of network retries.
        if (requestId && processedRequests.has(requestId)) {
            logger.duplicate('callback', {
                event: 'callback.duplicate',
                requestId,
                jobId,
                roomId,
                userId,
            });
            return {
                status: 200,
                content: { status: 'ok', detail: 'duplicate ignored' },
            };
        }

        try {
            const user = await read.getUserReader().getById(userId);
            const room = await read.getRoomReader().getById(roomId);

            if (!user || !room) {
                logger.failed('callback', new Error('User or room not found'), {
                    event: 'callback.failed',
                    statusCode: 404,
                    requestId,
                    jobId,
                    roomId,
                    userId,
                });
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
                        } catch (persistErr: unknown) {
                            const err = persistErr instanceof Error ? persistErr : new Error(String(persistErr));
                            logger.warn('Failed to persist message action payload', {
                                event: 'persistence.failed',
                                operation: 'saveMessageActionPayload',
                                requestId,
                                errorMessage: err.message,
                            });
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
                            logger.warn('Placeholder update failed, falling back to new message', {
                                event: 'ui.fallback',
                                operation: 'updateMessage',
                                requestId,
                                roomId,
                            });
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

                    logger.completed('ask', {
                        event: 'callback.completed',
                        operation: 'ask',
                        phase: 'complete',
                        outcome: 'success',
                        requestId,
                        jobId,
                        roomId,
                        userId,
                        threadId,
                        details: { sourcesCount: sources.length, hasPlaceholder: Boolean(placeholderId) },
                    });
                    break;
                }

                case 'chat_failed': {
                    const placeholderId = (body.placeholder_id as string | undefined) || (bodyData.placeholder_id as string | undefined);
                    const threadId = (body.thread_id as string | undefined) || (bodyData.thread_id as string | undefined);
                    const error = asNonEmptyString(body.error || bodyData.error, 'Không thể hoàn thành câu trả lời.');
                    const errorCode = asNonEmptyString(body.error_code || bodyData.error_code || bodyData.errorCode, 'CHAT_FAILED');
                    const errorMsg = `❌ **Lỗi phản hồi:** ${error}`;

                    if (placeholderId) {
                        try {
                            await updateMessage(placeholderId, read, modify, errorMsg, undefined);
                        } catch {
                            logger.warn('Placeholder update failed, falling back to new message', {
                                event: 'ui.fallback',
                                operation: 'updateMessage',
                                requestId,
                                roomId,
                            });
                            await sendMessage(read, modify, room, errorMsg, undefined, threadId);
                        }
                    } else {
                        await sendMessage(read, modify, room, errorMsg, undefined, threadId);
                    }

                    logger.failed('ask', new Error(error), {
                        event: 'callback.failed',
                        operation: 'ask',
                        phase: 'fail',
                        outcome: 'failure',
                        requestId,
                        jobId,
                        roomId,
                        userId,
                        threadId,
                        errorCode,
                        errorMessage: error,
                    });
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

                    logger.completed('upload', {
                        event: 'index.completed',
                        operation: 'upload',
                        phase: 'complete',
                        outcome: 'success',
                        requestId,
                        jobId,
                        roomId,
                        userId,
                        details: { filename: docName, chunksCount },
                    });
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

                    logger.failed('upload', new Error(error), {
                        event: 'index.failed',
                        operation: 'upload',
                        phase: 'fail',
                        outcome: 'failure',
                        requestId,
                        jobId,
                        roomId,
                        userId,
                        errorMessage: error,
                        details: { filename: docName },
                    });
                    break;
                }

                default: {
                    if (message) {
                        await sendMessage(read, modify, room, message);
                    } else {
                        logger.warn(`Unknown callback event: ${event}`, {
                            event: 'callback.unknown',
                            requestId,
                            details: { eventName: event },
                        });
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
            logger.failed('callback', error, {
                event: 'callback.failed',
                statusCode: 500,
                requestId,
                jobId,
                roomId,
                userId,
            });
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