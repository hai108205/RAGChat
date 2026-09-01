import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import { BackendClient } from '../lib/BackendClient';
import { sendMessage, sendMessageWithBlocks } from '../utils/MessageHelper';
import { COMMANDS } from '../constants/Commands';
import { ERRORS } from '../constants/Errors';
import { buildDocumentListBlocks } from '../uikit';

/**
 * /rag slash command — manage knowledge base documents and view RAG status.
 */
export class RagCommand implements ISlashCommand {
    public command = COMMANDS.RAG;
    public i18nParamsExample = 'docs | help';
    public i18nDescription = 'Manage knowledge base documents and view RAG sources';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        _persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const room = context.getRoom();
        const threadId = context.getThreadId();
        const subCommand = (args[0] || 'help').toLowerCase().trim();

        if (subCommand === 'docs') {
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

                const sources = await client.listSources(workspaceId, room.id, threadId);

                if (!sources || sources.length === 0) {
                    await sendMessage(
                        read,
                        modify,
                        room,
                        '📚 *Knowledge Base*\n\n_Chưa có tài liệu nào được lập chỉ mục trong phòng này._',
                        undefined,
                        threadId,
                    );
                    return;
                }

                const blockBuilder = modify.getCreator().getBlockBuilder();
                buildDocumentListBlocks(blockBuilder, sources, {
                    roomId: room.id,
                    headerTitle: `📚 *Kho tài liệu Knowledge Base* (${sources.length} tài liệu trong phòng này):`,
                });

                await sendMessageWithBlocks(
                    read,
                    modify,
                    room,
                    `📚 Knowledge Base (${sources.length} tài liệu)`,
                    blockBuilder,
                    threadId,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
                await sendMessage(read, modify, room, `❌ Lỗi khi tải danh sách tài liệu: ${message}`, undefined, threadId);
            }
            return;
        }

        if (subCommand === 'prune') {
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

                const sources = await client.listSources(workspaceId, room.id, threadId);

                if (!sources || sources.length === 0) {
                    await sendMessage(
                        read,
                        modify,
                        room,
                        '🧹 *Dọn dẹp tài liệu RAG*\n\n_Không có tài liệu nào trong phòng này để quét rác._',
                        undefined,
                        threadId,
                    );
                    return;
                }

                // Identify empty or failed sources
                const emptySources = sources.filter((s) => (s.chunksCount ?? s.totalPages ?? 0) === 0 || s.status === 'EMPTY' || s.status === 'FAILED');

                if (emptySources.length === 0) {
                    await sendMessage(
                        read,
                        modify,
                        room,
                        `✅ *Quét tài liệu hoàn tất:* Toàn bộ ${sources.length} tài liệu trong phòng đang hoạt động bình thường, không phát hiện tài liệu rác hoặc lỗi chunk.`,
                        undefined,
                        threadId,
                    );
                    return;
                }

                const blockBuilder = modify.getCreator().getBlockBuilder();
                buildDocumentListBlocks(blockBuilder, emptySources, {
                    roomId: room.id,
                    headerTitle: `⚠️ *Phát hiện ${emptySources.length} tài liệu rác/lỗi cần dọn dẹp:*`,
                });

                await sendMessageWithBlocks(
                    read,
                    modify,
                    room,
                    `🧹 Phát hiện ${emptySources.length} tài liệu rác`,
                    blockBuilder,
                    threadId,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
                await sendMessage(read, modify, room, `❌ Lỗi khi quét tài liệu: ${message}`, undefined, threadId);
            }
            return;
        }

        // Default: help
        const helpMessage = [
            '📖 *Hướng dẫn các lệnh RAG (/rag)*',
            '• `/rag docs` — Quản lý và xem danh sách tài liệu tri thức RAG của phòng.',
            '• `/rag prune` — Quét và dọn dẹp các tài liệu rác, lỗi index hoặc 0 chunks.',
            '• `/rag help` — Hiển thị hướng dẫn sử dụng.',
        ].join('\n');

        await sendMessage(read, modify, room, helpMessage, undefined, threadId);
    }
}
