import {
    IHttp,
    ILogger,
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
import { createRequestId } from '../utils/RequestId';

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
    private logger: Logger;

    constructor(logger?: ILogger | Logger | null) {
        if (logger instanceof Logger) {
            this.logger = logger.child('FileUploadHandler');
        } else {
            this.logger = new Logger(logger, 'FileUploadHandler');
        }
    }

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
        const startTime = Date.now();
        const { file, content } = context;

        const ext = this.getExtension(file.name);
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            this.logger.debug('upload.skipped_unsupported_extension', {
                event: 'upload.skipped',
                operation: 'upload_check',
                details: { filename: file.name, extension: ext },
            });
            return;
        }

        const requestId = createRequestId('upload');
        const roomId = file.rid || '';
        const rocketUserId = file.userId || '';

        this.logger.started('upload', {
            event: 'index.started',
            requestId,
            roomId,
            userId: rocketUserId,
            details: { filename: file.name, extension: ext, size: file.size },
        });

        try {
            const client = new BackendClient(http, read, this.logger);
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
                            this.logger.warn('upload.duplicate_detected', {
                                event: 'upload.duplicate_detected',
                                requestId,
                                roomId,
                                details: { filename: file.name, existingSourceId: duplicateOrSuperseded.id, existingFilename: duplicateOrSuperseded.filename },
                            });

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
                    this.logger.warn('Duplicate check encountered an error, continuing upload', {
                        event: 'upload.duplicate_check_error',
                        requestId,
                        errorMessage: dupCheckErr instanceof Error ? dupCheckErr.message : String(dupCheckErr),
                    });
                }
            }

            // Encode and dispatch to Backend
            const callbackUrl = await buildCallbackUrl(read);

            const uploadRes = await client.uploadBase64({
                workspaceId,
                rocketUserId,
                roomId,
                filename: file.name,
                contentBase64: content.toString('base64'),
                contentType: file.type || 'application/octet-stream',
                requestId,
                callbackUrl,
            });

            this.logger.accepted('upload', {
                event: 'index.accepted',
                requestId,
                jobId: uploadRes.jobId,
                durationMs: Date.now() - startTime,
                roomId,
                userId: rocketUserId,
                details: { filename: file.name, sourceId: uploadRes.sourceId },
            });
        } catch (error: unknown) {
            const durationMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : 'Indexing request failed';

            this.logger.failed('upload', error, {
                event: 'index.failed',
                requestId,
                durationMs,
                roomId,
                userId: rocketUserId,
                errorMessage: message,
                details: { filename: file.name },
            });

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
