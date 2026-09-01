import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import {
    BlockBuilder,
    ButtonStyle,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';

/**
 * Parameters for building the ConfirmDelete modal view.
 */
export interface IConfirmDeleteModalParams {
    appId?: string;
    sourceId: string;
    filename?: string;
    roomId?: string;
    chunksCount?: number;
    viewId?: string;
    customTitle?: string;
    customWarning?: string;
}

/**
 * Builds an IUIKitModalViewParam for safe 2-step confirmation of document deletion.
 * Supports both object params and positional params (modify, sourceId, roomId, filename, chunksCount).
 */
export function buildConfirmDeleteModal(
    paramOrModify: IConfirmDeleteModalParams | IModify,
    sourceIdArg?: string,
    roomIdArg?: string,
    filenameArg?: string,
    chunksCountArg?: number,
): IUIKitModalViewParam {
    let params: IConfirmDeleteModalParams;

    if (typeof paramOrModify === 'object' && 'getCreator' in paramOrModify) {
        // Called with (modify, sourceId, roomId, filename, chunksCount)
        params = {
            sourceId: sourceIdArg || '',
            roomId: roomIdArg,
            filename: filenameArg,
            chunksCount: chunksCountArg,
        };
    } else {
        params = paramOrModify as IConfirmDeleteModalParams;
    }

    const {
        appId = 'ragchat',
        sourceId,
        filename,
        roomId,
        chunksCount,
        viewId = 'confirm-delete-source',
        customTitle = 'Xác nhận Xoá Tài Liệu',
        customWarning,
    } = params;

    const builder = new BlockBuilder(appId);
    const displayName = filename || sourceId;

    // 1. Warning Notice Section
    const warningText = customWarning || [
        '⚠️ **CẢNH BÁO: HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC!**',
        `Bạn có chắc chắn muốn xoá vĩnh viễn tài liệu **\`${displayName}\`** khỏi cơ sở tri thức (Knowledge Base)?`,
    ].join('\n\n');

    builder.addSectionBlock({
        text: builder.newMarkdownTextObject(warningText),
    });

    builder.addDividerBlock();

    // 2. Document Information Summary
    const infoLines = [
        `📄 **Tên tệp:** \`${displayName}\``,
        `🔢 **Số lượng chunks liên quan:** \`${chunksCount !== undefined ? chunksCount : 'N/A'}\``,
        `🆔 **Mã tài liệu:** \`${sourceId}\``,
        roomId ? `💬 **Phòng chat:** \`${roomId}\`` : '',
    ].filter(Boolean);

    builder.addSectionBlock({
        text: builder.newMarkdownTextObject(infoLines.join('\n')),
    });

    // 3. Impact Context
    builder.addContextBlock({
        elements: [
            builder.newMarkdownTextObject('💡 Thao tác này sẽ xoá toàn bộ vector embeddings trong cơ sở dữ liệu. AI sẽ không còn sử dụng tài liệu này.'),
        ],
    });

    return {
        id: viewId,
        title: builder.newPlainTextObject(customTitle),
        blocks: builder.getBlocks(),
        submit: builder.newButtonElement({
            actionId: 'confirm-delete-submit',
            text: builder.newPlainTextObject('Xác nhận Xóa'),
            style: ButtonStyle.DANGER,
            value: sourceId,
        }),
        close: builder.newButtonElement({
            actionId: 'confirm-delete-cancel',
            text: builder.newPlainTextObject('Huỷ bỏ'),
        }),
        state: {
            sourceId,
            roomId: roomId || '',
            filename: displayName,
        },
        clearOnClose: true,
        notifyOnClose: false,
    };
}

/**
 * Fluent ConfirmDeleteModal class.
 */
export class ConfirmDeleteModal {
    public static readonly ViewId = 'confirm-delete-source';

    public static build(
        paramOrModify: IConfirmDeleteModalParams | IModify,
        sourceIdArg?: string,
        roomIdArg?: string,
        filenameArg?: string,
        chunksCountArg?: number,
    ): IUIKitModalViewParam {
        return buildConfirmDeleteModal(paramOrModify, sourceIdArg, roomIdArg, filenameArg, chunksCountArg);
    }
}
