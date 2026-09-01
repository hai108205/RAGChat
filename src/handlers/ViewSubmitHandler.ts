import {
    IHttp,
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

/**
 * Handles Rocket.Chat UIKit modal form submissions.
 *
 * Implements 2-step safe document deletion confirmations and future modal actions.
 */
export class ViewSubmitHandler {
    public async handleViewSubmit(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const logger = new Logger(null, 'ViewSubmitHandler');
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

            if (sourceId && roomId) {
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

                try {
                    await client.deleteSource(sourceId, workspaceId, roomId, 'room');
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
                    logger.error('Failed to delete source via modal submit', err);
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
                logger.warn('Missing sourceId or roomId in confirm-delete modal submission', { sourceId, roomId });
            }

            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }
}
