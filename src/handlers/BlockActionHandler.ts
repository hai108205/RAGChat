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
import { sendNotification } from '../utils/MessageHelper';

export class BlockActionHandler {
    public async handleBlockAction(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
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
            // Default
        }

        // 1. Feedback handling (thumbs up / thumbs down)
        if (actionId.startsWith('feedback:') || actionId === 'feedback-thumbs-up' || actionId === 'feedback-thumbs-down') {
            const rating = (actionId.includes('negative') || actionId === 'feedback-thumbs-down')
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
                    roomId: room?.id,
                });

                if (room) {
                    const emoji = rating === 'positive' ? '👍' : '👎';
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `Cảm ơn bạn đã gửi đánh giá ${emoji}!`,
                    );
                }
            } catch (err: any) {
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

        // 2. Source Deletion handling
        if (actionId.startsWith('delete_source:') || actionId.startsWith('delete-source:') || actionId === 'delete_source') {
            let sourceId = actionId.replace(/^(delete_source:|delete-source:)/, '');
            if (!sourceId || sourceId === 'delete_source') {
                sourceId = value || '';
            }

            if (sourceId && room) {
                try {
                    await client.deleteSource(sourceId, workspaceId, room.id, 'room');
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `🗑️ Đã xoá tài liệu thành công.`,
                    );
                } catch (err: any) {
                    await sendNotification(
                        read,
                        modify,
                        user,
                        room,
                        `❌ Lỗi khi xoá tài liệu: ${err.message || 'Lỗi hệ thống'}`,
                    );
                }
            }

            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }
}
