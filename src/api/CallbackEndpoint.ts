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
import { CallbackReceiptStore } from '../persistence/callbackReceiptStore';
import { CallbackEvent, validateCallbackEvent } from '../types/CallbackEvents';
import { CitationSource, Formatter } from '../utils/Formatter';
import { Logger } from '../utils/Logger';
import { sendMessage, updateMessage } from '../utils/MessageHelper';
import { readBoolean, readMaxHistory } from '../utils/SettingReader';
import { asNonEmptyString } from '../utils/Validator';
import { buildActionButtonsBlock } from '../uikit';

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
 * - `indexing_complete`: Sends/updates confirmation of document indexing.
 * - `indexing_failed`: Sends/updates error explanation of why indexing failed.
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

        // 1. Authentication check:
        // Validate the shared integration token (or legacy api-key) if configured.
        if (!(await this.authorize(request, read))) {
            logger.rejected('callback', 'Unauthorized callback request', {
                event: 'callback.rejected',
                statusCode: 401,
            });
            return {
                status: 401,
                content: { error: 'Unauthorized' },
            };
        }

        // 2. Parse & Validate callback event via discriminated union
        let eventData: CallbackEvent;
        try {
            eventData = validateCallbackEvent(request.content);
        } catch (valErr: unknown) {
            const errorMsg = valErr instanceof Error ? valErr.message : 'Invalid callback event payload';
            logger.rejected('callback', errorMsg, {
                event: 'callback.rejected',
                statusCode: 400,
                details: { error: errorMsg },
            });
            return {
                status: 400,
                content: { error: errorMsg },
            };
        }

        const { event, userId, roomId, requestId, jobId, threadId } = eventData;

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

        // 3. Idempotency guard via CallbackReceiptStore (Apps-Engine persistence)
        const receiptStore = new CallbackReceiptStore(read, persis);
        const receiptKey = jobId || requestId;

        const claimResult = await receiptStore.claim(receiptKey, event, {
            jobId,
            requestId,
            placeholderId: (eventData as any).placeholderId,
        });

        if (claimResult.isDuplicate) {
            logger.duplicate('callback', {
                event: 'callback.duplicate',
                requestId,
                jobId,
                roomId,
                userId,
                details: { status: claimResult.receipt.status, event },
            });
            return {
                status: 200,
                content: { status: 'ok', detail: 'duplicate ignored' },
            };
        }

        if (claimResult.isConflicting) {
            logger.warn('Conflicting callback event rejected after terminal status', {
                event: 'callback.conflict',
                statusCode: 409,
                requestId,
                jobId,
                roomId,
                userId,
                details: {
                    existingStatus: claimResult.receipt.status,
                    existingEvent: claimResult.receipt.event,
                    incomingEvent: event,
                },
            });
            return {
                status: 409,
                content: {
                    error: `Conflict: Terminal event already recorded for this job (${claimResult.receipt.event})`,
                    status: 'conflict',
                },
            };
        }

        try {
            const user = await read.getUserReader().getById(userId);
            const room = await read.getRoomReader().getById(roomId);

            if (!user || !room) {
                await receiptStore.markFailed(receiptKey, event, 'User or room not found');
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

            // 4. Dispatch typed event logic
            switch (eventData.event) {
                case 'chat_completed': {
                    const placeholderId = eventData.placeholderId || undefined;
                    const query = eventData.query;
                    const answer = asNonEmptyString(eventData.answer, 'Không nhận được câu trả lời.');
                    const sources = eventData.sources || [];

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
                                chatMessageId: eventData.chatMessageId || undefined,
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
                        chatMessageId: eventData.chatMessageId || undefined,
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
                            await sendMessage(read, modify, room, answer, attachment, threadId || undefined);
                        }
                    } else {
                        await sendMessage(read, modify, room, answer, attachment, threadId || undefined);
                    }
                    await receiptStore.updateCheckpoint(receiptKey, 'PLACEHOLDER_UPDATED');

                    // Append user query + assistant answer to persistent session history once (turnId = requestId)
                    if (query) {
                        const sessionStore = new SessionStore(read, persis);
                        const maxHistory = readMaxHistory(await settings.getValueById('max-history'));
                        await sessionStore.addMessagesOnce(requestId, userId, roomId, threadId || undefined, [
                            { role: 'user', content: query, timestamp: Date.now(), turnId: requestId },
                            { role: 'assistant', content: answer, timestamp: Date.now(), turnId: requestId },
                        ], maxHistory);
                        await receiptStore.updateCheckpoint(receiptKey, 'SESSION_SAVED');
                    }

                    await receiptStore.markCompleted(receiptKey, 'chat_completed', {
                        sourcesCount: sources.length,
                        hasPlaceholder: Boolean(placeholderId),
                    });

                    logger.completed('ask', {
                        event: 'callback.completed',
                        operation: 'ask',
                        phase: 'complete',
                        outcome: 'success',
                        requestId,
                        jobId,
                        roomId,
                        userId,
                        threadId: threadId || undefined,
                        details: { sourcesCount: sources.length, hasPlaceholder: Boolean(placeholderId) },
                    });
                    break;
                }

                case 'chat_failed': {
                    const placeholderId = eventData.placeholderId || undefined;
                    const error = asNonEmptyString(eventData.error, 'Không thể hoàn thành câu trả lời.');
                    const errorCode = asNonEmptyString(eventData.errorCode, 'CHAT_FAILED');
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
                            await sendMessage(read, modify, room, errorMsg, undefined, threadId || undefined);
                        }
                    } else {
                        await sendMessage(read, modify, room, errorMsg, undefined, threadId || undefined);
                    }
                    await receiptStore.updateCheckpoint(receiptKey, 'PLACEHOLDER_UPDATED');

                    await receiptStore.markFailed(receiptKey, 'chat_failed', error, { errorCode });

                    logger.failed('ask', new Error(error), {
                        event: 'callback.failed',
                        operation: 'ask',
                        phase: 'fail',
                        outcome: 'failure',
                        requestId,
                        jobId,
                        roomId,
                        userId,
                        threadId: threadId || undefined,
                        errorCode,
                        errorMessage: error,
                    });
                    break;
                }

                case 'indexing_complete': {
                    const docName = eventData.documentName || 'Unknown';
                    const chunksCount = eventData.chunksCount || 0;
                    const placeholderId = eventData.placeholderId || undefined;
                    const text = `✅ **Document Indexed:** \`${docName}\` (${chunksCount} chunks)`;

                    if (placeholderId) {
                        try {
                            await updateMessage(placeholderId, read, modify, text, undefined);
                        } catch {
                            logger.warn('Indexing placeholder update failed, falling back to new message', {
                                event: 'ui.fallback',
                                operation: 'updateMessage',
                                requestId,
                                roomId,
                            });
                            await sendMessage(read, modify, room, text, undefined, threadId || undefined);
                        }
                    } else {
                        await sendMessage(read, modify, room, text, undefined, threadId || undefined);
                    }
                    await receiptStore.updateCheckpoint(receiptKey, 'PLACEHOLDER_UPDATED');

                    await receiptStore.markCompleted(receiptKey, 'indexing_complete', {
                        filename: docName,
                        chunksCount,
                    });

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
                    const docName = eventData.documentName || 'Unknown';
                    const error = eventData.error || 'Unknown error';
                    const placeholderId = eventData.placeholderId || undefined;
                    const text = `❌ **Indexing Failed:** \`${docName}\` — ${error}`;

                    if (placeholderId) {
                        try {
                            await updateMessage(placeholderId, read, modify, text, undefined);
                        } catch {
                            logger.warn('Indexing placeholder update failed, falling back to new message', {
                                event: 'ui.fallback',
                                operation: 'updateMessage',
                                requestId,
                                roomId,
                            });
                            await sendMessage(read, modify, room, text, undefined, threadId || undefined);
                        }
                    } else {
                        await sendMessage(read, modify, room, text, undefined, threadId || undefined);
                    }
                    await receiptStore.updateCheckpoint(receiptKey, 'PLACEHOLDER_UPDATED');

                    await receiptStore.markFailed(receiptKey, 'indexing_failed', error, { filename: docName });

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
            }

            return {
                status: 200,
                content: { status: 'ok' },
            };
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Callback processing failed';
            await receiptStore.updateCheckpoint(receiptKey, 'PROCESSING_ERROR', { error: errMsg });

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