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

export class ViewSubmitHandler {
    public async handleViewSubmit(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const { view, user, room } = data;

        if (view.id === 'confirm-delete-source') {
            const state = (view.state as any) || {};
            const sourceId = state.sourceId || (view as any).clear?.value;
            const roomId = state.roomId || room?.id;

            if (sourceId && roomId) {
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

                try {
                    await client.deleteSource(sourceId, workspaceId, roomId, 'room');
                    if (room) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `🗑️ Đã xoá tài liệu thành công.`,
                        );
                    }
                } catch (err: any) {
                    if (room) {
                        await sendNotification(
                            read,
                            modify,
                            user,
                            room,
                            `❌ Lỗi khi xoá tài liệu: ${err.message || 'Lỗi hệ thống'}`,
                        );
                    }
                }
            }
        }

        return context.getInteractionResponder().successResponse();
    }
}
