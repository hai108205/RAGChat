import {
    IHttp,
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

export class BlockActionHandler {
    public async handleBlockAction(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const logger = new Logger(null, 'BlockActionHandler');
        const data = context.getInteractionData();
        const { actionId, user, room, value, message } = data;

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

        const roomId = room?.id || message?.room?.id || '';

        // 1. Feedback handling (ðŸ‘ / ðŸ‘Ž)
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

            try {
                await client.submitFeedback({
                    messageId,
                    chatMessageId,
                    rating,
                    rocketUserId: user.id,
                    workspaceId,
                    roomId,
                });

                if (room) {
                    const emoji = rating === 'positive' ? 'ðŸ‘' : 'ðŸ‘Ž';
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `Cáº£m Æ¡n báº¡n Ä‘Ã£ gá»­i Ä‘Ã¡nh giÃ¡ ${emoji}! Pháº£n há»“i cá»§a báº¡n giÃºp cáº£i thiá»‡n cháº¥t lÆ°á»£ng RAG.`,
                    );
                }
            } catch (err: any) {
                logger.error('Failed to submit feedback', err);
                if (room) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `KhÃ´ng thá»ƒ lÆ°u Ä‘Ã¡nh giÃ¡: ${err.message || 'Lá»—i káº¿t ná»‘i backend'}`,
                    );
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        // 2. Regenerate answer (ðŸ”„)
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

            // New-style payload only carries `{ action, messageId }` â€” read the
            // original query from App Persistence.
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

            if (!query && room) {
                await sendNotification(
                    read,
                    modify,
                    user,
                    room,
                    'âš ï¸ KhÃ´ng tÃ¬m tháº¥y cÃ¢u há»i ban Ä‘áº§u Ä‘á»ƒ táº¡o láº¡i cÃ¢u tráº£ lá»i.',
                );
                return context.getInteractionResponder().successResponse();
            }

            if (room) {
                const placeholderId = await sendPlaceholderMessage(
                    read,
                    modify,
                    room,
                    'ðŸ”„ _Äang tra cá»©u láº¡i vÃ  tá»‘i Æ°u cÃ¢u tráº£ lá»i má»›i..._',
                    targetThreadId,
                );

                const requestId = `regen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                const callbackUrl = await buildCallbackUrl(read);

                try {
                    await client.askAsync(
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
                } catch (err: any) {
                    const errMsg = `âŒ Lá»—i khi táº¡o láº¡i cÃ¢u tráº£ lá»i: ${err.message || 'Lá»—i há»‡ thá»‘ng'}`;
                    if (placeholderId) {
                        await sendNotification(read, modify, user, room, errMsg);
                    }
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        // 3. Inspect retrieved chunks / source document (ðŸ”)
        // Accepts: inspect_source:<id>, inspect_chunk:<id>, inspect_chunks:<id>,
        //          inspect-chunks:<id>, inspect_chunks, inspect-chunks, action:inspect_chunks
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
            const isDocumentInspect =
                actionId.startsWith('inspect_source:') || actionId === 'inspect_source';

            let sources: CitationSource[] = [];
            let sourceFilename = 'TÃ i liá»‡u trÃ­ch dáº«n';
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
                        // { sourceId, filename, title, page, score, chunkId, messageId, ... }
                        if (typeof parsed.sourceId === 'string') sourceIdFromValue = parsed.sourceId;
                        if (typeof parsed.messageId === 'string') messageIdFromValue = parsed.messageId;
                        if (typeof parsed.title === 'string') parsedMeta.title = parsed.title;
                        if (typeof parsed.filename === 'string') parsedMeta.filename = parsed.filename;
                        if (typeof parsed.page === 'number') parsedMeta.page = parsed.page;
                        if (typeof parsed.score === 'number') parsedMeta.score = parsed.score;
                    }
                } catch {
                    // Raw string fallback â€” treat as sourceId
                    if (value.trim()) {
                        sourceIdFromValue = value.trim();
                    }
                }
            }

            // New-style inspect payload carries only `{ action, messageId, sourcesCount }`.
            // Load the citation sources from App Persistence.
            if (sources.length === 0 && !isDocumentInspect && messageIdFromValue) {
                try {
                    const stored = await loadMessageActionPayload(read, messageIdFromValue);
                    if (stored?.sources && stored.sources.length > 0) {
                        sources = stored.sources;
                    }
                } catch {
                    // Fall through to legacy / empty handling
                }
            }

            // If value is a source ID (raw or JSON), fetch document metadata and render
            // a metadata-only modal. The backend integration endpoint does not expose
            // raw chunk content per source, so we do not pretend to have it.
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
                                    `TÃ i liá»‡u: ${matched.filename} | Chunks: ${matched.chunksCount ?? matched.totalPages ?? 0} | Status: ${matched.status}` +
                                    `\n\n_Äang hiá»ƒn thá»‹ metadata. Backend khÃ´ng cung cáº¥p raw chunk content qua integration endpoint._`,
                                page: matched.totalPages,
                                relevance: 1.0,
                            },
                        ];
                    }
                } catch {
                    // Fallback to empty modal below
                }
            }

            // Citation-level inspect (from ActionButtonsBlock) carries full sources array
            if (!isDocumentInspect && sources.length === 0 && parsedMeta.title) {
                sources = [
                    {
                        title: parsedMeta.title,
                        snippet: `_KhÃ´ng cÃ³ ná»™i dung chunk chi tiáº¿t trong payload. Xem nguá»“n Ä‘áº§y Ä‘á»§ trong /rag docs._`,
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

            return context.getInteractionResponder().openModalViewResponse(modalView);
        }

        // 4. Copy raw Markdown (ðŸ“‹)
        if (
            actionId.startsWith('copy_markdown:') ||
            actionId.startsWith('copy-markdown:') ||
            actionId === 'copy_markdown' ||
            actionId === 'copy-markdown' ||
            actionId === 'action:copy_markdown'
        ) {
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

            // New-style payload only carries `{ action, messageId }` â€” fetch the
            // full raw markdown from App Persistence.
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

            return context.getInteractionResponder().openModalViewResponse(modalView);
        }

        // 5. Delete source button click -> opens ConfirmDeleteModal (ðŸ—‘ï¸)
        if (
            actionId.startsWith('delete_source:') ||
            actionId.startsWith('delete-source:') ||
            actionId === 'delete_source' ||
            actionId === 'delete-source'
        ) {
            let sourceId = actionId.replace(/^(delete_source:|delete-source:)/, '');
            if (!sourceId || sourceId === 'delete_source' || sourceId === 'delete-source') {
                sourceId = value || '';
            }

            if (sourceId && room) {
                const modalView = buildConfirmDeleteModal({
                    sourceId,
                    roomId: room.id,
                });
                return context.getInteractionResponder().openModalViewResponse(modalView);
            }

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
                if (promptQuery === '/rag docs' || promptQuery.toLowerCase() === 'quáº£n lÃ½ tÃ i liá»‡u') {
                    try {
                        const sources = await client.listSources(workspaceId, room.id);
                        if (!sources || sources.length === 0) {
                            await sendMessage(
                                read,
                                modify,
                                room,
                                'ðŸ“š *Knowledge Base*\n\n_ChÆ°a cÃ³ tÃ i liá»‡u nÃ o Ä‘Æ°á»£c láº­p chá»‰ má»¥c trong phÃ²ng nÃ y._',
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
                        return context.getInteractionResponder().successResponse();

                    } catch (err: any) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `âŒ Lá»—i khi táº£i danh sÃ¡ch tÃ i liá»‡u: ${err.message || 'Lá»—i káº¿t ná»‘i'}`,
                        );
                    }
                    return context.getInteractionResponder().successResponse();
                }

                // Normal question prompt from chip
                const placeholderId = await sendPlaceholderMessage(
                    read,
                    modify,
                    room,
                    `ðŸ’¡ _"${promptQuery}"_\nðŸ” _Äang tra cá»©u tÃ i liá»‡u..._`,
                );

                const requestId = `chip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                const callbackUrl = await buildCallbackUrl(read);

                try {
                    await client.askAsync(
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
                } catch (err: any) {
                    const errMsg = `âŒ Lá»—i khi gá»­i cÃ¢u há»i: ${err.message || 'Lá»—i há»‡ thá»‘ng'}`;
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
                try {
                    await client.deleteSource(oldSourceId, workspaceId, room.id, 'room');
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `ðŸ—‘ï¸ ÄÃ£ dá»n dáº¹p vÃ  xoÃ¡ báº£n tÃ i liá»‡u cÅ© thÃ nh cÃ´ng (ID: \`${oldSourceId}\`).`,
                    );
                } catch (err: any) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `âŒ Lá»—i khi xoÃ¡ báº£n tÃ i liá»‡u cÅ©: ${err.message || 'Lá»—i há»‡ thá»‘ng'}`,
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
            if (room) {
                await sendNotification(
                    read,
                    modify,
                    user,
                    room,
                    'ðŸ“ ÄÃ£ giá»¯ láº¡i cáº£ hai phiÃªn báº£n tÃ i liá»‡u trong Knowledge Base.',
                );
            }
            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }
}
