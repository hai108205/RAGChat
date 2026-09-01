import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IPreFileUpload, IFileUploadContext } from '@rocket.chat/apps-engine/definition/uploads';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit/blocks';
import { BackendClient } from '../lib/BackendClient';
import { sendMessage, sendMessageWithBlocks } from '../utils/MessageHelper';
import { buildCallbackUrl } from '../utils/CallbackUrl';
import { Logger } from '../utils/Logger';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.pptx', '.csv', '.xlsx', '.html'];

/**
 * Intercepts uploaded files and forwards supported documents to the Node.js RAG backend for indexing.
 *
 * Implements `IPreFileUpload`.
 *
 * Capabilities:
 * 1. Checks file extension against `SUPPORTED_EXTENSIONS`.
 * 2. Scans existing room knowledge base sources for duplicate / superseded file versions.
 * 3. Sends an interactive warning card if a superseded document is detected, offering 1-click cleanup.
 * 4. Encodes document `Buffer` to base64.
 * 5. Dispatches indexing request asynchronously to `/api/v1/integrations/rocketchat/sources/base64`.
 * 6. Non-blocking: returns normally to allow Rocket.Chat file upload to complete seamlessly.
 */
export class FileUploadHandler implements IPreFileUpload {
    /**
     * Called before a file is committed to storage.
     */
    public async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        _persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const logger = new Logger(null, 'FileUploadHandler');
        const { file, content } = context;

        const ext = this.getExtension(file.name);
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            return;
        }

        try {
            const client = new BackendClient(http, read);
            const settings = read.getEnvironmentReader().getSettings();
            let workspaceId = 'default';
            try {
                const wsSetting = await settings.getValueById('workspace-id');
                if (typeof wsSetting === 'string' && wsSetting.trim()) {
                    workspaceId = wsSetting.trim();
                }
            } catch {
                // Default workspace
            }

            const roomId = file.rid || '';
            const rocketUserId = file.userId || '';

            // Duplicate & Superseded Document Detection
            if (roomId) {
                try {
                    const existingSources = await client.listSources(workspaceId, roomId);
                    if (existingSources && existingSources.length > 0) {
                        const currentFilename = file.name.trim().toLowerCase();
                        const currentBaseName = currentFilename.replace(/\.[^/.]+$/, '').replace(/[-_]v\d+$/i, '');

                        const duplicateOrSuperseded = existingSources.find((s) => {
                            const existingName = s.filename.trim().toLowerCase();
                            if (existingName === currentFilename) {
                                return true;
                            }
                            const existingBaseName = existingName.replace(/\.[^/.]+$/, '').replace(/[-_]v\d+$/i, '');
                            return existingBaseName === currentBaseName && s.filename !== file.name;
                        });

                        if (duplicateOrSuperseded) {
                            const room = await read.getRoomReader().getById(roomId);
                            if (room) {
                                const uploadDate = duplicateOrSuperseded.createdAt
                                    ? duplicateOrSuperseded.createdAt.slice(0, 10)
                                    : 'trước đó';

                                const blockBuilder = modify.getCreator().getBlockBuilder();
                                blockBuilder.addSectionBlock({
                                    text: blockBuilder.newMarkdownTextObject(
                                        `⚠️ **Phát hiện tài liệu trùng lặp / phiên bản cũ trong phòng:**\nĐã có tệp **\`${duplicateOrSuperseded.filename}\`** (tải lên: ${uploadDate}). Bạn có muốn dọn dẹp bản cũ không?`,
                                    ),
                                });
                                blockBuilder.addActionsBlock({
                                    elements: [
                                        blockBuilder.newButtonElement({
                                            actionId: `prune_old_version:${duplicateOrSuperseded.id}`,
                                            text: blockBuilder.newPlainTextObject('🗑️ Xoá bản cũ'),
                                            value: duplicateOrSuperseded.id,
                                            style: ButtonStyle.DANGER,
                                        }),
                                        blockBuilder.newButtonElement({
                                            actionId: `keep_both_versions:${duplicateOrSuperseded.id}`,
                                            text: blockBuilder.newPlainTextObject('📁 Giữ cả hai'),
                                            value: duplicateOrSuperseded.id,
                                        }),
                                    ],
                                });

                                await sendMessageWithBlocks(
                                    read,
                                    modify,
                                    room,
                                    `⚠️ Phát hiện tài liệu trùng lặp: ${duplicateOrSuperseded.filename}`,
                                    blockBuilder,
                                );
                            }
                        }
                    }
                } catch (dupCheckErr) {
                    logger.warn('Duplicate check check encountered an error, continuing upload', dupCheckErr);
                }
            }

            // Encode and dispatch to Backend
            const requestId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const callbackUrl = await buildCallbackUrl(read);

            await client.uploadBase64({
                workspaceId,
                rocketUserId,
                roomId,
                filename: file.name,
                contentBase64: content.toString('base64'),
                contentType: file.type || 'application/octet-stream',
                requestId,
                callbackUrl,
            });
        } catch (error: unknown) {
            // Surface failure if backend is unreachable so user is aware indexing did not queue
            const message = error instanceof Error ? error.message : 'Indexing request failed';
            const room = await read.getRoomReader().getById(file.rid);
            if (!room) {
                return;
            }
            await sendMessage(
                read,
                modify,
                room,
                `⚠️ Không thể đưa tệp **\`${file.name}\`** vào hàng đợi lập chỉ mục RAG: ${message}`,
            );
        }
    }

    private getExtension(filename: string): string {
        const index = filename.lastIndexOf('.');
        return index === -1 ? '' : filename.slice(index).toLowerCase();
    }
}
