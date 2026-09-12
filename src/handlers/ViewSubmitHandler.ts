import {
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IUIKitResponse,
    UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { BackendClient } from '../lib/BackendClient';
import { sendNotification } from '../utils/MessageHelper';
import { Logger } from '../utils/Logger';
import { createRequestId } from '../utils/RequestId';
import { RagSettingsStore, ROOM_RAG_PROMPT_MAX_CHARACTERS } from '../persistence/ragSettingsStore';
import { RagSettingsActionId } from '../uikit/modals/RagSettingsModal';

/**
 * Handles Rocket.Chat UIKit modal form submissions.
 *
 * Implements 2-step safe document deletion confirmations and future modal actions.
 */
export class ViewSubmitHandler {
    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('ViewSubmitHandler');
        } else {
            this.logger = new Logger(logger, 'ViewSubmitHandler');
        }
    }

    public async handleViewSubmit(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const startTime = Date.now();
        const data = context.getInteractionData();
        const { view, user, room } = data;

        // 1. Confirm Delete Source Modal Submission
        if (view.id === 'confirm-delete-source' || view.id.startsWith('confirm-delete:') || view.id.startsWith('confirm-delete')) {
            const state = (view.state as any) || {};

            let sourceId = state.sourceId || (view as any).clear?.value;
            if (!sourceId && view.id.startsWith('confirm-delete:')) {
                sourceId = view.id.replace(/^confirm-delete:/, '').trim();
            }

            const roomId = state.roomId || room?.id;
            const filename = state.filename || sourceId;
            const requestId = createRequestId('del');

            if (sourceId && roomId) {
                this.logger.started('delete_source', {
                    event: 'source.delete.started',
                    requestId,
                    roomId,
                    userId: user.id,
                    details: { sourceId, filename },
                });

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

                try {
                    const canManage = Boolean(
                        (user as any).roles?.some((r: string) => ['admin', 'moderator', 'owner', 'leader'].includes(r.toLowerCase())),
                    );
                    await client.deleteSource(sourceId, workspaceId, roomId, 'room', requestId, {
                        actorRocketUserId: user.id,
                        canManageSources: canManage,
                    });

                    this.logger.completed('delete_source', {
                        event: 'source.delete.completed',
                        requestId,
                        durationMs: Date.now() - startTime,
                        roomId,
                        userId: user.id,
                        details: { sourceId, filename },
                    });

                    const targetRoom = room || (await read.getRoomReader().getById(roomId));
                    if (targetRoom) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            targetRoom,
                            `🗑️ Đã xoá vĩnh viễn tài liệu **\`${filename}\`** (ID: \`${sourceId}\`) khỏi Knowledge Base.`,
                        );
                    }
                } catch (err: any) {
                    const durationMs = Date.now() - startTime;
                    this.logger.failed('delete_source', err, {
                        event: 'source.delete.failed',
                        requestId,
                        durationMs,
                        roomId,
                        userId: user.id,
                        details: { sourceId, filename },
                    });

                    const targetRoom = room || (await read.getRoomReader().getById(roomId));
                    if (targetRoom) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            targetRoom,
                            `❌ Lỗi khi xoá tài liệu: ${err.message || 'Lỗi hệ thống'}`,
                        );
                    }
                }
            } else {
                this.logger.warn('Missing sourceId or roomId in confirm-delete modal submission', {
                    event: 'source.delete.rejected',
                    requestId,
                    details: { sourceId, roomId },
                });
            }

            return context.getInteractionResponder().successResponse();
        }

        // 2. RAG Settings Modal Submission
        if (view.id === 'rag-settings-modal' || view.id.startsWith('rag-settings:')) {
            const state = (view.state as any) || {};
            const roomId = room?.id || state.roomId;
            const targetRoom = room || (roomId ? await read.getRoomReader().getById(roomId) : undefined);
            const requestId = createRequestId('rag-settings');

            // 1. Authorization check: must be admin, moderator, owner, or leader
            const roles = (user as any).roles || [];
            const canManage = Boolean(
                roles.some((r: string) => ['admin', 'moderator', 'owner', 'leader'].includes(r.toLowerCase())),
            );

            if (!canManage) {
                this.logger.warn('Unauthorized attempt to modify room RAG settings', {
                    event: 'rag_settings.denied',
                    requestId,
                    roomId,
                    userId: user.id,
                });
                if (targetRoom) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        targetRoom,
                        '⛔ Bạn không có quyền thay đổi cấu hình RAG của phòng này (yêu cầu quyền admin/moderator).',
                    );
                }
                return context.getInteractionResponder().errorResponse();
            }

            if (!roomId) {
                return context.getInteractionResponder().errorResponse();
            }

            // 2. Extract values from state
            const modelVal = state[RagSettingsActionId.MODEL_SELECT]?.value;
            const searchModeVal = state[RagSettingsActionId.SEARCH_MODE_SELECT]?.value;
            const topKVal = state[RagSettingsActionId.TOP_K_SELECT]?.value;
            const thresholdVal = state[RagSettingsActionId.THRESHOLD_SELECT]?.value;
            const promptVal = state[RagSettingsActionId.SYSTEM_PROMPT_INPUT]?.value;

            // 3. Validate prompt bounds
            if (typeof promptVal === 'string' && promptVal.length > ROOM_RAG_PROMPT_MAX_CHARACTERS) {
                if (targetRoom) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        targetRoom,
                        `❌ Chỉ dẫn hệ thống (System Prompt) không được vượt quá ${ROOM_RAG_PROMPT_MAX_CHARACTERS} ký tự.`,
                    );
                }
                return context.getInteractionResponder().errorResponse();
            }

            // 4. Verify against backend capabilities
            const client = new BackendClient(http, read, this.logger);
            const capabilities = await client.getRoomRagCapabilities(requestId);

            if (searchModeVal && !capabilities.availableSearchModes.includes(searchModeVal as any)) {
                if (targetRoom) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        targetRoom,
                        `❌ Chế độ tìm kiếm '${searchModeVal}' hiện chưa được hỗ trợ trên hệ thống backend (chế độ khả dụng: ${capabilities.availableSearchModes.join(', ')}).`,
                    );
                }
                return context.getInteractionResponder().errorResponse();
            }

            // 5. Parse and persist
            const topKNum = topKVal ? Number(topKVal) : 5;
            const threshNum = thresholdVal ? Number(thresholdVal) : 0.6;

            const store = new RagSettingsStore(read, _persistence);
            try {
                await store.setRoomSettings(roomId, {
                    model: modelVal,
                    searchMode: searchModeVal,
                    topK: topKNum as any,
                    similarityThreshold: threshNum as any,
                    systemPrompt: promptVal,
                }, user.id);

                this.logger.completed('rag_settings_submit', {
                    event: 'rag_settings.updated',
                    requestId,
                    roomId,
                    userId: user.id,
                });

                if (targetRoom) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        targetRoom,
                        `✅ Đã cập nhật thành công cấu hình RAG cho phòng này:\n• Mô hình AI: \`${modelVal || 'Mặc định'}\`\n• Chế độ tìm kiếm: \`${searchModeVal || 'hybrid'}\`\n• Top-K: \`${topKNum}\` chunks\n• Ngưỡng tương đồng: \`${threshNum}\``,
                    );
                }
            } catch (err: any) {
                this.logger.failed('rag_settings_submit', err, {
                    event: 'rag_settings.failed',
                    requestId,
                    roomId,
                    userId: user.id,
                });
                if (targetRoom) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        targetRoom,
                        `❌ Lỗi khi lưu cấu hình RAG: ${err.message || 'Lỗi không xác định'}`,
                    );
                }
                return context.getInteractionResponder().errorResponse();
            }

            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }
}
