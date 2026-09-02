import {
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IUIKitResponse,
    UIKitActionButtonInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { BackendClient } from '../lib/BackendClient';
import { sendMessage, sendNotification, sendPlaceholderMessage, updateMessage } from '../utils/MessageHelper';
import { buildCallbackUrl } from '../utils/CallbackUrl';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

/**
 * Handles Rocket.Chat UI Action Button interactions triggered from the message context menu
 * (right-click / meatball menu on a message, context: UIActionButtonContext.MESSAGE_ACTION).
 *
 * Supported Actions:
 * 1. `action-summarize-thread`: Collects thread messages or message content, summarizes via LLM backend.
 * 2. `action-ask-ai-context`: Uses the message content as query premise and dispatches RAG askAsync.
 * 3. `action-translate-message`: Translates message content to target language (Vietnamese by default).
 * 4. `action-index-message`: Takes message content, encodes to Base64, and queues for Knowledge Base indexing.
 */
export class ActionButtonHandler {
    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('ActionButtonHandler');
        } else {
            this.logger = new Logger(logger, 'ActionButtonHandler');
        }
    }

    public async handleActionButton(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const startTime = Date.now();
        const data = context.getInteractionData();
        const { actionId, user, room, message, threadId } = data;

        if (!room) {
            return context.getInteractionResponder().errorResponse();
        }

        const client = new BackendClient(http, read, this.logger);
        let workspaceId = 'default';
        try {
            const wsSetting = await read.getEnvironmentReader().getSettings().getValueById('workspace-id');
            if (typeof wsSetting === 'string' && wsSetting.trim()) {
                workspaceId = wsSetting.trim();
            }
        } catch {
            // Default workspace
        }

        const effectiveThreadId = threadId || message?.threadId || message?.id;

        try {
            switch (actionId) {
                // 1. Summarize Thread / Message Action
                case 'action-summarize-thread': {
                    const requestId = createRequestId('act-sum');
                    let contentToSummarize = message?.text?.trim() || '';

                    if (effectiveThreadId) {
                        try {
                            const threadMessages = await read.getThreadReader().getThreadById(effectiveThreadId);
                            if (threadMessages && threadMessages.length > 0) {
                                contentToSummarize = threadMessages
                                    .map((m) => `${m.sender?.username || m.sender?.name || 'User'}: ${m.text || ''}`)
                                    .filter((line) => line.trim().length > 0)
                                    .join('\n');
                            }
                        } catch {
                            // Fall back to the single message text
                        }
                    }

                    if (!contentToSummarize) {
                        this.logger.rejected('action_summarize', 'No content to summarize', {
                            event: 'action.summarize.rejected',
                            requestId,
                            roomId: room.id,
                            userId: user.id,
                        });
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Không tìm thấy nội dung văn bản để tóm tắt.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    this.logger.started('action_summarize', {
                        event: 'action.summarize.started',
                        requestId,
                        roomId: room.id,
                        userId: user.id,
                        details: { contentLength: contentToSummarize.length },
                    });

                    const placeholderId = await sendPlaceholderMessage(
                        read,
                        modify,
                        room,
                        '📝 _Đang thu thập và tóm tắt nội dung hội thoại..._',
                        effectiveThreadId,
                    );

                    try {
                        const summary = await client.summarize(contentToSummarize, requestId);
                        const responseText = `📝 **Tóm tắt nội dung:**\n\n${summary}`;

                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, responseText);
                        } else {
                            await sendMessage(read, modify, room, responseText, undefined, effectiveThreadId);
                        }

                        this.logger.completed('action_summarize', {
                            event: 'action.summarize.completed',
                            requestId,
                            durationMs: Date.now() - startTime,
                            roomId: room.id,
                            userId: user.id,
                        });
                    } catch (summaryErr: any) {
                        const durationMs = Date.now() - startTime;
                        this.logger.failed('action_summarize', summaryErr, {
                            event: 'action.summarize.failed',
                            requestId,
                            durationMs,
                            roomId: room.id,
                            userId: user.id,
                        });

                        const errMessage = `❌ Lỗi khi tóm tắt: ${summaryErr.message || 'Lỗi hệ thống'}`;
                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, errMessage);
                        } else {
                            await sendNotification(read, modify, user, room, errMessage);
                        }
                    }
                    break;
                }

                // 2. Ask AI about Message Context Action
                case 'action-ask-ai-context': {
                    const requestId = createRequestId('action-ask');
                    const messageText = message?.text?.trim();
                    if (!messageText) {
                        this.logger.rejected('action_ask', 'Empty message text', {
                            event: 'request.rejected',
                            requestId,
                            roomId: room.id,
                            userId: user.id,
                        });
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Tin nhắn không có nội dung để gửi cho AI.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    this.logger.started('action_ask', {
                        event: 'request.started',
                        requestId,
                        roomId: room.id,
                        userId: user.id,
                        threadId: effectiveThreadId,
                        details: { textLength: messageText.length },
                    });

                    const placeholderId = await sendPlaceholderMessage(
                        read,
                        modify,
                        room,
                        '🔍 _Đang phân tích ngữ cảnh tin nhắn và tra cứu tài liệu..._',
                        effectiveThreadId,
                    );

                    const callbackUrl = await buildCallbackUrl(read);

                    try {
                        const response = await client.askAsync(
                            messageText,
                            user.id,
                            room.id,
                            effectiveThreadId,
                            placeholderId,
                            [],
                            requestId,
                            workspaceId,
                            callbackUrl,
                        );

                        this.logger.accepted('action_ask', {
                            event: 'request.accepted',
                            requestId,
                            jobId: response.job_id,
                            durationMs: Date.now() - startTime,
                            roomId: room.id,
                            userId: user.id,
                            threadId: effectiveThreadId,
                            details: { placeholderId, status: response.status },
                        });
                    } catch (askErr: any) {
                        const durationMs = Date.now() - startTime;
                        this.logger.failed('action_ask', askErr, {
                            event: 'request.failed',
                            requestId,
                            durationMs,
                            roomId: room.id,
                            userId: user.id,
                        });

                        const errMessage = `❌ Không thể gửi câu hỏi sang AI backend: ${askErr.message || 'Lỗi hệ thống'}`;
                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, errMessage);
                        } else {
                            await sendNotification(read, modify, user, room, errMessage);
                        }
                    }
                    break;
                }

                // 3. Translate Message Action
                case 'action-translate-message': {
                    const requestId = createRequestId('act-trans');
                    const messageText = message?.text?.trim();
                    if (!messageText) {
                        this.logger.rejected('action_translate', 'Empty message text', {
                            event: 'action.translate.rejected',
                            requestId,
                            roomId: room.id,
                            userId: user.id,
                        });
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Tin nhắn không có nội dung để dịch.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    this.logger.started('action_translate', {
                        event: 'action.translate.started',
                        requestId,
                        roomId: room.id,
                        userId: user.id,
                        details: { textLength: messageText.length },
                    });

                    const placeholderId = await sendPlaceholderMessage(
                        read,
                        modify,
                        room,
                        '🌐 _Đang dịch tin nhắn..._',
                        effectiveThreadId,
                    );

                    try {
                        const translated = await client.translate(messageText, 'vi', requestId);
                        const responseText = `🌐 **Bản dịch (Tiếng Việt):**\n\n${translated}`;

                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, responseText);
                        } else {
                            await sendMessage(read, modify, room, responseText, undefined, effectiveThreadId);
                        }

                        this.logger.completed('action_translate', {
                            event: 'action.translate.completed',
                            requestId,
                            durationMs: Date.now() - startTime,
                            roomId: room.id,
                            userId: user.id,
                        });
                    } catch (transErr: any) {
                        const durationMs = Date.now() - startTime;
                        this.logger.failed('action_translate', transErr, {
                            event: 'action.translate.failed',
                            requestId,
                            durationMs,
                            roomId: room.id,
                            userId: user.id,
                        });

                        const errMessage = `❌ Lỗi khi dịch tin nhắn: ${transErr.message || 'Lỗi hệ thống'}`;
                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, errMessage);
                        } else {
                            await sendNotification(read, modify, user, room, errMessage);
                        }
                    }
                    break;
                }

                // 4. Index Message to Knowledge Base Action
                case 'action-index-message': {
                    const requestId = createRequestId('idx-msg');
                    const messageText = message?.text?.trim();
                    if (!messageText) {
                        this.logger.rejected('action_index_message', 'Empty message text', {
                            event: 'action.index_message.rejected',
                            requestId,
                            roomId: room.id,
                            userId: user.id,
                        });
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Tin nhắn rỗng, không thể lập chỉ mục vào Knowledge Base.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    const msgId = message?.id || `${Date.now()}`;
                    const filename = `snippet-${msgId.slice(0, 8)}.txt`;
                    const contentBase64 = Buffer.from(messageText, 'utf-8').toString('base64');
                    const callbackUrl = await buildCallbackUrl(read);

                    this.logger.started('action_index_message', {
                        event: 'index.started',
                        requestId,
                        roomId: room.id,
                        userId: user.id,
                        details: { filename },
                    });

                    try {
                        const uploadRes = await client.uploadBase64({
                            workspaceId,
                            rocketUserId: user.id,
                            roomId: room.id,
                            filename,
                            contentBase64,
                            contentType: 'text/plain',
                            requestId,
                            callbackUrl,
                        });

                        this.logger.accepted('action_index_message', {
                            event: 'index.accepted',
                            requestId,
                            jobId: uploadRes.jobId,
                            durationMs: Date.now() - startTime,
                            roomId: room.id,
                            userId: user.id,
                            details: { filename, sourceId: uploadRes.sourceId },
                        });

                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `📚 Đã xếp hàng tin nhắn \`${filename}\` để lập chỉ mục vào Knowledge Base.`,
                        );
                    } catch (indexErr: any) {
                        const durationMs = Date.now() - startTime;
                        this.logger.failed('action_index_message', indexErr, {
                            event: 'index.failed',
                            requestId,
                            durationMs,
                            roomId: room.id,
                            userId: user.id,
                            details: { filename },
                        });

                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `❌ Lỗi khi lưu tin nhắn vào Knowledge Base: ${indexErr.message || 'Lỗi hệ thống'}`,
                        );
                    }
                    break;
                }

                default:
                    this.logger.warn(`Unhandled actionId in ActionButtonHandler: ${actionId}`, {
                        event: 'action.unhandled',
                        details: { actionId },
                    });
            }
        } catch (error: any) {
            this.logger.failed('handleActionButton', error, {
                event: 'action.unhandled_error',
                durationMs: Date.now() - startTime,
                roomId: room.id,
                userId: user.id,
                details: { actionId },
            });

            await sendNotification(
                read,
                modify,
                user,
                room,
                `❌ Lỗi xử lý thao tác: ${error.message || 'Lỗi không xác định'}`,
            );
        }

        return context.getInteractionResponder().successResponse();
    }
}
