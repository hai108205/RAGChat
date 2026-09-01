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
import { sendMessage } from '../utils/MessageHelper';
import { COMMANDS } from '../constants/Commands';
import { ERRORS } from '../constants/Errors';

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

                let messageText = `📚 *Knowledge Base* (${sources.length} tài liệu)\n\n`;
                sources.forEach((doc, idx) => {
                    const chunks = doc.chunksCount ?? doc.totalPages ?? 0;
                    const date = doc.lastIndexedAt ? doc.lastIndexedAt.slice(0, 10) : doc.createdAt ? doc.createdAt.slice(0, 10) : 'N/A';
                    messageText += `${idx + 1}. *${doc.filename}*\n   • Chunks: ${chunks}\n   • Status: \`${doc.status}\`\n   • Last indexed: ${date}\n\n`;
                });

                await sendMessage(read, modify, room, messageText.trim(), undefined, threadId);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
                await sendMessage(read, modify, room, `❌ Lỗi khi tải danh sách tài liệu: ${message}`, undefined, threadId);
            }
            return;
        }

        // Default: help
        const helpMessage = [
            '📖 *RAG Commands*',
            '• `/rag docs` — Liệt kê các tài liệu RAG đã lập chỉ mục trong phòng chat này.',
            '• `/rag help` — Hiển thị trợ giúp về các lệnh RAG.',
        ].join('\n');

        await sendMessage(read, modify, room, helpMessage, undefined, threadId);
    }
}
