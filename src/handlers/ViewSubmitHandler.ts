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
                    await client.deleteSource(sourceId, workspaceId, roomId, 'room', requestId);

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

        return context.getInteractionResponder().successResponse();
    }
}
