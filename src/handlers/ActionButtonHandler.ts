import {
    IHttp,
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
    public async handleActionButton(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const logger = new Logger(null, 'ActionButtonHandler');
        const data = context.getInteractionData();
        const { actionId, user, room, message, threadId } = data;

        if (!room) {
            return context.getInteractionResponder().errorResponse();
        }

        const client = new BackendClient(http, read);
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
                    let contentToSummarize = message?.text?.trim() || '';

                    // If message is part of a thread, gather all messages in the thread
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
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Không tìm thấy nội dung văn bản để tóm tắt.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    const placeholderId = await sendPlaceholderMessage(
                        read,
                        modify,
                        room,
                        '📝 _Đang thu thập và tóm tắt nội dung hội thoại..._',
                        effectiveThreadId,
                    );

                    try {
                        const summary = await client.summarize(contentToSummarize);
                        const responseText = `📝 **Tóm tắt nội dung:**\n\n${summary}`;

                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, responseText);
                        } else {
                            await sendMessage(read, modify, room, responseText, undefined, effectiveThreadId);
                        }
                    } catch (summaryErr: any) {
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
                    const messageText = message?.text?.trim();
                    if (!messageText) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Tin nhắn không có nội dung để gửi cho AI.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    const placeholderId = await sendPlaceholderMessage(
                        read,
                        modify,
                        room,
                        '🔍 _Đang phân tích ngữ cảnh tin nhắn và tra cứu tài liệu..._',
                        effectiveThreadId,
                    );

                    const requestId = `action-ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                    const callbackUrl = await buildCallbackUrl(read);

                    try {
                        await client.askAsync(
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
                    } catch (askErr: any) {
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
                    const messageText = message?.text?.trim();
                    if (!messageText) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            '⚠️ Tin nhắn không có nội dung để dịch.',
                        );
                        return context.getInteractionResponder().successResponse();
                    }

                    const placeholderId = await sendPlaceholderMessage(
                        read,
                        modify,
                        room,
                        '🌐 _Đang dịch tin nhắn..._',
                        effectiveThreadId,
                    );

                    try {
                        const translated = await client.translate(messageText, 'vi');
                        const responseText = `🌐 **Bản dịch (Tiếng Việt):**\n\n${translated}`;

                        if (placeholderId) {
                            await updateMessage(placeholderId, read, modify, responseText);
                        } else {
                            await sendMessage(read, modify, room, responseText, undefined, effectiveThreadId);
                        }
                    } catch (transErr: any) {
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
                    const messageText = message?.text?.trim();
                    if (!messageText) {
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
                    const requestId = `idx-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    const callbackUrl = await buildCallbackUrl(read);

                    try {
                        await client.uploadBase64({
                            workspaceId,
                            rocketUserId: user.id,
                            roomId: room.id,
                            filename,
                            contentBase64,
                            contentType: 'text/plain',
                            requestId,
                            callbackUrl,
                        });

                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `📚 Đã xếp hàng tin nhắn \`${filename}\` để lập chỉ mục vào Knowledge Base.`,
                        );
                    } catch (indexErr: any) {
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
                    logger.warn(`Unhandled actionId in ActionButtonHandler: ${actionId}`);
            }
        } catch (error: any) {
            logger.error(`Error processing action button ${actionId}`, error);
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
