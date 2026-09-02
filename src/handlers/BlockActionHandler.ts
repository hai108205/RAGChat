import {
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IUIKitResponse,
    UIKitBlockInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { BackendClient } from '../lib/BackendClient';
import { loadMessageActionPayload } from '../persistence/messagePayloadStore';
import { sendMessage, sendNotification, sendPlaceholderMessage, sendMessageWithBlocks } from '../utils/MessageHelper';
import { buildConfirmDeleteModal } from '../uikit/modals/ConfirmDeleteModal';
import { buildSourceDetailModal } from '../uikit/modals/SourceDetailModal';
import { buildRawMarkdownModal } from '../uikit/modals/RawMarkdownModal';
import { buildDocumentListBlocks } from '../uikit';
import { CitationSource } from '../utils/Formatter';
import { buildCallbackUrl } from '../utils/CallbackUrl';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';

export class BlockActionHandler {
    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('BlockActionHandler');
        } else {
            this.logger = new Logger(logger, 'BlockActionHandler');
        }
    }

    public async handleBlockAction(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const startTime = Date.now();
        const data = context.getInteractionData();
        const { actionId, user, room, value, message } = data;

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

        const roomId = room?.id || message?.room?.id || '';

        // 1. Feedback handling (👍 / 👎)
        if (
            actionId.startsWith('feedback:') ||
            actionId.startsWith('feedback_') ||
            actionId === 'feedback-thumbs-up' ||
            actionId === 'feedback-thumbs-down'
        ) {
            const rating = (actionId.includes('negative') || actionId.includes('down') || actionId === 'feedback-thumbs-down')
                ? 'negative'
                : 'positive';

            let chatMessageId: string | undefined;
            let messageId: string | undefined = message?.id;

            if (value) {
                try {
                    const parsed = JSON.parse(value);
                    if (parsed.chatMessageId) chatMessageId = parsed.chatMessageId;
                    if (parsed.messageId) messageId = parsed.messageId;
                } catch {
                    if (value.startsWith('chatmsg:')) {
                        chatMessageId = value.replace(/^chatmsg:/, '');
                    } else if (value.trim()) {
                        messageId = value.trim();
                    }
                }
            }

            const requestId = createRequestId('fb');
            this.logger.started('feedback', {
                event: 'feedback.started',
                requestId,
                roomId,
                userId: user.id,
                details: { rating, messageId, chatMessageId },
            });

            try {
                await client.submitFeedback({
                    messageId,
                    chatMessageId,
                    rating,
                    rocketUserId: user.id,
                    workspaceId,
                    roomId,
                }, requestId);

                this.logger.completed('feedback', {
                    event: 'feedback.completed',
                    requestId,
                    durationMs: Date.now() - startTime,
                    roomId,
                    userId: user.id,
                    details: { rating },
                });

                if (room) {
                    const emoji = rating === 'positive' ? '👍' : '👎';
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `Cảm ơn bạn đã gửi đánh giá ${emoji}! Phản hồi của bạn giúp cải thiện chất lượng RAG.`,
                    );
                }
            } catch (err: any) {
                const durationMs = Date.now() - startTime;
                this.logger.failed('feedback', err, {
                    event: 'feedback.failed',
                    requestId,
                    durationMs,
                    roomId,
                    userId: user.id,
                });

                if (room) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `Không thể lưu đánh giá: ${err.message || 'Lỗi kết nối backend'}`,
                    );
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        // 2. Regenerate answer (🔄)
        if (
            actionId.startsWith('regenerate:') ||
            actionId.startsWith('regenerate_') ||
            actionId === 'regenerate' ||
            actionId === 'action-regenerate' ||
            actionId === 'action:regenerate'
        ) {
            let query = '';
            let targetThreadId = message?.threadId;
            let payloadMessageId: string | undefined;

            if (value) {
                try {
                    const parsed = JSON.parse(value);
                    if (parsed.query) query = parsed.query;
                    if (parsed.threadId) targetThreadId = parsed.threadId;
                    if (parsed.messageId) payloadMessageId = parsed.messageId;
                } catch {
                    query = value;
                }
            }

            if (!query && payloadMessageId) {
                try {
                    const stored = await loadMessageActionPayload(read, payloadMessageId);
                    if (stored?.query) {
                        query = stored.query;
                    }
                } catch {
                    // Fall through to message.text fallback
                }
            }

            if (!query && message?.text) {
                query = message.text;
            }

            const requestId = createRequestId('regen');

            if (!query && room) {
                this.logger.rejected('regenerate', 'Original query not found for regenerate', {
                    event: 'request.rejected',
                    requestId,
                    roomId,
                    userId: user.id,
                });
                await sendNotification(
                    read,
                    modify,
                    user,
                    room,
                    '⚠️ Không tìm thấy câu hỏi ban đầu để tạo lại câu trả lời.',
                );
                return context.getInteractionResponder().successResponse();
            }

            if (room) {
                this.logger.started('regenerate', {
                    event: 'request.started',
                    requestId,
                    roomId: room.id,
                    userId: user.id,
                    threadId: targetThreadId,
                    details: { queryLength: query.length },
                });

                const placeholderId = await sendPlaceholderMessage(
                    read,
                    modify,
                    room,
                    '🔄 _Đang tra cứu lại và tối ưu câu trả lời mới..._',
                    targetThreadId,
                );

                const callbackUrl = await buildCallbackUrl(read);

                try {
                    const response = await client.askAsync(
                        query,
                        user.id,
                        room.id,
                        targetThreadId,
                        placeholderId,
                        [],
                        requestId,
                        workspaceId,
                        callbackUrl,
                    );

                    this.logger.accepted('regenerate', {
                        event: 'request.accepted',
                        requestId,
                        jobId: response.job_id,
                        durationMs: Date.now() - startTime,
                        roomId: room.id,
                        userId: user.id,
                        threadId: targetThreadId,
                        details: { placeholderId, status: response.status },
                    });
                } catch (err: any) {
                    const durationMs = Date.now() - startTime;
                    this.logger.failed('regenerate', err, {
                        event: 'request.failed',
                        requestId,
                        durationMs,
                        roomId: room.id,
                        userId: user.id,
                    });

                    const errMsg = `❌ Lỗi khi tạo lại câu trả lời: ${err.message || 'Lỗi hệ thống'}`;
                    if (placeholderId) {
                        await sendNotification(read, modify, user, room, errMsg);
                    }
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        // 3. Inspect retrieved chunks / source document (🔍)
        if (
            actionId.startsWith('inspect_source:') ||
            actionId.startsWith('inspect_chunk:') ||
            actionId.startsWith('inspect_chunks:') ||
            actionId.startsWith('inspect-chunks:') ||
            actionId === 'inspect_source' ||
            actionId === 'inspect_chunk' ||
            actionId === 'inspect_chunks' ||
            actionId === 'inspect-chunks' ||
            actionId === 'action:inspect_chunks'
        ) {
            const requestId = createRequestId('inspect');
            this.logger.started('inspect_source', {
                event: 'inspect.started',
                requestId,
                roomId,
                userId: user.id,
            });
            const isDocumentInspect =
                actionId.startsWith('inspect_source:') || actionId === 'inspect_source';

            let sources: CitationSource[] = [];
            let sourceFilename = 'Tài liệu trích dẫn';
            let sourceIdFromValue: string | undefined;
            let messageIdFromValue: string | undefined;
            let parsedMeta: { title?: string; page?: number; score?: number; filename?: string } = {};

            if (value) {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        sources = parsed;
                    } else if (parsed && Array.isArray(parsed.sources)) {
                        sources = parsed.sources;
                    } else if (parsed && typeof parsed === 'object') {
                        if (typeof parsed.sourceId === 'string') sourceIdFromValue = parsed.sourceId;
                        if (typeof parsed.messageId === 'string') messageIdFromValue = parsed.messageId;
                        if (typeof parsed.title === 'string') parsedMeta.title = parsed.title;
                        if (typeof parsed.filename === 'string') parsedMeta.filename = parsed.filename;
                        if (typeof parsed.page === 'number') parsedMeta.page = parsed.page;
                        if (typeof parsed.score === 'number') parsedMeta.score = parsed.score;
                    }
                } catch {
                    if (value.trim()) {
                        sourceIdFromValue = value.trim();
                    }
                }
            }

            if (sources.length === 0 && !isDocumentInspect && messageIdFromValue) {
                try {
                    const stored = await loadMessageActionPayload(read, messageIdFromValue);
                    if (stored?.sources && stored.sources.length > 0) {
                        sources = stored.sources;
                    }
                } catch {
                    // Fall through
                }
            }

            const targetSourceId =
                sourceIdFromValue ||
                actionId.replace(/^(inspect_source:|inspect_chunk:|inspect_chunks:|inspect-chunks:)/, '');

            if (sources.length === 0 && targetSourceId && targetSourceId !== actionId) {
                try {
                    const docList = await client.listSources(workspaceId, roomId);
                    const matched = docList.find((d) => d.id === targetSourceId.trim());
                    if (matched) {
                        sourceFilename = parsedMeta.filename || parsedMeta.title || matched.filename;
                        sources = [
                            {
                                title: matched.filename,
                                snippet:
                                    `Tài liệu: ${matched.filename} | Chunks: ${matched.chunksCount ?? matched.totalPages ?? 0} | Status: ${matched.status}` +
                                    `\n\n_Đang hiển thị metadata. Backend không cung cấp raw chunk content qua integration endpoint._`,
                                page: matched.totalPages,
                                relevance: 1.0,
                            },
                        ];
                    }
                } catch {
                    // Fallback to empty modal
                }
            }

            if (!isDocumentInspect && sources.length === 0 && parsedMeta.title) {
                sources = [
                    {
                        title: parsedMeta.title,
                        snippet: `_Không có nội dung chunk chi tiết trong payload. Xem nguồn đầy đủ trong /rag docs._`,
                        page: parsedMeta.page,
                        relevance: parsedMeta.score ?? 0,
                    },
                ];
                sourceFilename = parsedMeta.filename || parsedMeta.title;
            }

            const modalView = buildSourceDetailModal({
                filename: sourceFilename,
                sourceId: targetSourceId !== actionId ? targetSourceId : undefined,
                chunks: sources.map((s, idx) => ({
                    chunkIndex: idx + 1,
                    text: s.snippet || '',
                    score: s.relevance,
                    page: s.page,
                })),
                chunksCount: sources.length,
            });

            this.logger.completed('inspect_source', {
                event: 'inspect.completed',
                requestId,
                durationMs: Date.now() - startTime,
                roomId,
                userId: user.id,
                details: { isDocumentInspect, sourcesCount: sources.length },
            });

            return context.getInteractionResponder().openModalViewResponse(modalView);
        }

        // 4. Copy raw Markdown (📋)
        if (
            actionId.startsWith('copy_markdown:') ||
            actionId.startsWith('copy-markdown:') ||
            actionId === 'copy_markdown' ||
            actionId === 'copy-markdown' ||
            actionId === 'action:copy_markdown'
        ) {
            const requestId = createRequestId('copy-markdown');
            this.logger.started('copy_markdown', {
                event: 'copy_markdown.started',
                requestId,
                roomId,
                userId: user.id,
            });
            let markdownContent = '';
            let copyMessageId: string | undefined = message?.id;

            if (value) {
                try {
                    const parsed = JSON.parse(value);
                    if (parsed.rawMarkdown) markdownContent = parsed.rawMarkdown;
                    else if (parsed.text) markdownContent = parsed.text;
                    else if (parsed.rawText) markdownContent = parsed.rawText;
                    if (parsed.messageId) copyMessageId = parsed.messageId;
                } catch {
                    markdownContent = value;
                }
            }

            if (!markdownContent && copyMessageId) {
                try {
                    const stored = await loadMessageActionPayload(read, copyMessageId);
                    if (stored?.rawMarkdown) {
                        markdownContent = stored.rawMarkdown;
                    }
                } catch {
                    // Fall through
                }
            }

            if (!markdownContent) {
                markdownContent = message?.text || '';
            }

            const modalView = buildRawMarkdownModal({
                rawMarkdown: markdownContent,
                messageId: copyMessageId,
            });

            this.logger.completed('copy_markdown', {
                event: 'copy_markdown.completed',
                requestId,
                durationMs: Date.now() - startTime,
                roomId,
                userId: user.id,
            });

            return context.getInteractionResponder().openModalViewResponse(modalView);
        }

        // 5. Delete source button click -> opens ConfirmDeleteModal (🗑️)
        if (
            actionId.startsWith('delete_source:') ||
            actionId.startsWith('delete-source:') ||
            actionId === 'delete_source' ||
            actionId === 'delete-source'
        ) {
            const requestId = createRequestId('delete-source-modal');
            this.logger.started('delete_source_modal', {
                event: 'delete_source.modal_started',
                requestId,
                roomId,
                userId: user.id,
            });
            let sourceId = actionId.replace(/^(delete_source:|delete-source:)/, '');
            if (!sourceId || sourceId === 'delete_source' || sourceId === 'delete-source') {
                sourceId = value || '';
            }

            if (sourceId && room) {
                const modalView = buildConfirmDeleteModal({
                    sourceId,
                    roomId: room.id,
                });

                this.logger.completed('delete_source_modal', {
                    event: 'delete_source.modal_opened',
                    requestId,
                    durationMs: Date.now() - startTime,
                    roomId: room.id,
                    userId: user.id,
                    details: { sourceId },
                });

                return context.getInteractionResponder().openModalViewResponse(modalView);
            }

            this.logger.rejected('delete_source_modal', 'Missing source ID or room context', {
                event: 'delete_source.modal_rejected',
                requestId,
                roomId,
                userId: user.id,
            });
            return context.getInteractionResponder().successResponse();
        }

        // 6. Suggestion chips click
        if (
            actionId.startsWith('suggestion_chip:') ||
            actionId.startsWith('suggestion-chip:') ||
            actionId.startsWith('chip:') ||
            actionId === 'suggestion_chip'
        ) {
            const promptQuery = (value || '').trim();

            if (promptQuery && room) {
                if (promptQuery === '/rag docs' || promptQuery.toLowerCase() === 'quản lý tài liệu') {
                    try {
                        const sources = await client.listSources(workspaceId, room.id);
                        if (!sources || sources.length === 0) {
                            await sendMessage(
                                read,
                                modify,
                                room,
                                '📚 *Knowledge Base*\n\n_Chưa có tài liệu nào được lập chỉ mục trong phòng này._',
                            );
                            return context.getInteractionResponder().successResponse();
                        }

                        const docsBlockBuilder = modify.getCreator().getBlockBuilder();
                        buildDocumentListBlocks(docsBlockBuilder, sources, {
                            showDeleteButton: true,
                            showInspectButton: true,
                            roomId: room.id,
                        });
                        await sendMessageWithBlocks(
                            read,
                            modify,
                            room,
                            `Knowledge Base (${sources.length} tai lieu)`,
                            docsBlockBuilder,
                        );

                        this.logger.completed('suggestion_chip', {
                            event: 'suggestion_chip.completed',
                            durationMs: Date.now() - startTime,
                            roomId: room.id,
                            userId: user.id,
                            details: { action: 'docs', sourcesCount: sources.length },
                        });

                        return context.getInteractionResponder().successResponse();

                    } catch (err: any) {
                        this.logger.failed('suggestion_chip', err, {
                            event: 'suggestion_chip.failed',
                            durationMs: Date.now() - startTime,
                            roomId: room.id,
                            userId: user.id,
                        });

                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `❌ Lỗi khi tải danh sách tài liệu: ${err.message || 'Lỗi kết nối'}`,
                        );
                    }
                    return context.getInteractionResponder().successResponse();
                }

                // Normal question prompt from chip
                const requestId = createRequestId('chip');

                this.logger.started('suggestion_chip', {
                    event: 'request.started',
                    requestId,
                    roomId: room.id,
                    userId: user.id,
                    details: { promptQueryLength: promptQuery.length },
                });

                const placeholderId = await sendPlaceholderMessage(
                    read,
                    modify,
                    room,
                    `💡 _"${promptQuery}"_\n🔍 _Đang tra cứu tài liệu..._`,
                );

                const callbackUrl = await buildCallbackUrl(read);

                try {
                    const response = await client.askAsync(
                        promptQuery,
                        user.id,
                        room.id,
                        undefined,
                        placeholderId,
                        [],
                        requestId,
                        workspaceId,
                        callbackUrl,
                    );

                    this.logger.accepted('suggestion_chip', {
                        event: 'request.accepted',
                        requestId,
                        jobId: response.job_id,
                        durationMs: Date.now() - startTime,
                        roomId: room.id,
                        userId: user.id,
                        details: { placeholderId, status: response.status },
                    });
                } catch (err: any) {
                    const durationMs = Date.now() - startTime;
                    this.logger.failed('suggestion_chip', err, {
                        event: 'request.failed',
                        requestId,
                        durationMs,
                        roomId: room.id,
                        userId: user.id,
                    });

                    const errMsg = `❌ Lỗi khi gửi câu hỏi: ${err.message || 'Lỗi hệ thống'}`;
                    if (placeholderId) {
                        await sendNotification(read, modify, user, room, errMsg);
                    }
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        // 7. Prune Old Version (Superseded/Duplicate Docs)
        if (
            actionId.startsWith('prune_old_version:') ||
            actionId.startsWith('prune-superseded:') ||
            actionId === 'prune_old_version'
        ) {
            let oldSourceId = actionId.replace(/^(prune_old_version:|prune-superseded:)/, '');
            if (!oldSourceId || oldSourceId === 'prune_old_version') {
                oldSourceId = value || '';
            }

            if (oldSourceId && room) {
                const requestId = createRequestId('prune');
                this.logger.started('prune_old_version', {
                    event: 'source.delete.started',
                    requestId,
                    roomId: room.id,
                    userId: user.id,
                    details: { sourceId: oldSourceId },
                });

                try {
                    await client.deleteSource(oldSourceId, workspaceId, room.id, 'room', requestId);
                    this.logger.completed('prune_old_version', {
                        event: 'source.delete.completed',
                        requestId,
                        durationMs: Date.now() - startTime,
                        roomId: room.id,
                        userId: user.id,
                        details: { sourceId: oldSourceId },
                    });

                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `🗑️ Đã dọn dẹp và xoá bản tài liệu cũ thành công (ID: \`${oldSourceId}\`).`,
                    );
                } catch (err: any) {
                    const durationMs = Date.now() - startTime;
                    this.logger.failed('prune_old_version', err, {
                        event: 'source.delete.failed',
                        requestId,
                        durationMs,
                        roomId: room.id,
                        userId: user.id,
                        details: { sourceId: oldSourceId },
                    });

                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `❌ Lỗi khi xoá bản tài liệu cũ: ${err.message || 'Lỗi hệ thống'}`,
                    );
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        // 8. Keep both versions
        if (
            actionId.startsWith('keep_both_versions:') ||
            actionId.startsWith('keep-both:') ||
            actionId === 'keep_both_versions' ||
            actionId === 'keep-both'
        ) {
            const requestId = createRequestId('keep-both');
            this.logger.started('keep_both_versions', {
                event: 'upload.keep_both_versions.started',
                requestId,
                roomId,
                userId: user.id,
            });
            if (room) {
                this.logger.completed('keep_both_versions', {
                    event: 'upload.keep_both_versions',
                    requestId,
                    durationMs: Date.now() - startTime,
                    roomId: room.id,
                    userId: user.id,
                });

                await sendNotification(
                    read,
                    modify,
                    user,
                    room,
                    '📁 Đã giữ lại cả hai phiên bản tài liệu trong Knowledge Base.',
                );
            }
            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }
}
