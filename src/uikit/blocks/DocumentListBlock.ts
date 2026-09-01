import {
    BlockBuilder,
    ButtonStyle,
    IButtonElement,
} from '@rocket.chat/apps-engine/definition/uikit';
import { SourceDocument } from '../../lib/BackendTypes';

/**
 * Options for configuring the document list block presentation.
 */
export interface IDocumentListBlockOptions {
    headerTitle?: string;
    emptyMessage?: string;
    roomId?: string;
    showDeleteButton?: boolean;
    showInspectButton?: boolean;
    maxItems?: number;
}

/**
 * Action IDs for document list interactions.
 */
export enum DocumentListActionId {
    DELETE_SOURCE = 'delete_source',
    INSPECT_SOURCE = 'inspect_source',
}

/**
 * Formats a document status string with a descriptive badge and emoji.
 */
export function formatDocumentStatus(status?: string): string {
    const s = (status || 'UNKNOWN').toUpperCase();
    switch (s) {
        case 'ACTIVE':
            return '🟢 Hoạt động';
        case 'EMPTY':
            return '⚪ Trống';
        case 'FAILED':
            return '🔴 Lỗi';
        case 'PROCESSING':
        case 'INDEXING':
            return '🟡 Đang xử lý';
        default:
            return `🟡 ${status || 'N/A'}`;
    }
}

/**
 * Formats ISO date or timestamp into YYYY-MM-DD string.
 */
export function formatDocumentDate(doc: SourceDocument): string {
    const raw = doc.lastIndexedAt || doc.createdAt;
    if (!raw) {
        return 'N/A';
    }
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

/**
 * Appends document listing blocks to the BlockBuilder.
 */
export function buildDocumentListBlocks(
    blockBuilder: BlockBuilder,
    sources: SourceDocument[],
    options?: IDocumentListBlockOptions,
): BlockBuilder {
    const {
        headerTitle,
        emptyMessage,
        showDeleteButton = true,
        showInspectButton = true,
        maxItems = 25,
    } = options || {};

    // 1. Empty State
    if (!sources || sources.length === 0) {
        blockBuilder.addSectionBlock({
            text: blockBuilder.newMarkdownTextObject(
                emptyMessage ||
                '📚 *Kho tài liệu (Knowledge Base)*\n\n_Chưa có tài liệu nào được lập chỉ mục trong không gian này._',
            ),
        });
        blockBuilder.addContextBlock({
            elements: [
                blockBuilder.newMarkdownTextObject('💡 *Mẹo:* Tải lên tệp PDF, DOCX, TXT, MD hoặc gửi liên kết để bắt đầu.'),
            ],
        });
        return blockBuilder;
    }

    // 2. Header
    const title = headerTitle || `📚 *Kho tài liệu RAG* (${sources.length} tài liệu):`;
    blockBuilder.addSectionBlock({
        text: blockBuilder.newMarkdownTextObject(title),
    });
    blockBuilder.addDividerBlock();

    // 3. Document Items
    const displaySources = sources.slice(0, maxItems);

    displaySources.forEach((doc, idx) => {
        const chunks = doc.chunksCount ?? doc.totalPages ?? 0;
        const statusLabel = formatDocumentStatus(doc.status);
        const dateStr = formatDocumentDate(doc);

        const lines: string[] = [
            `*${idx + 1}. ${doc.filename}*`,
            `• Chunks: \`${chunks}\` | Trạng thái: ${statusLabel} | Ngày: \`${dateStr}\``,
        ];

        if (doc.documentationUrl) {
            lines.push(`• [Xem tài liệu gốc](${doc.documentationUrl})`);
        }

        const buttons: Array<IButtonElement> = [];

        if (showInspectButton) {
            buttons.push(
                blockBuilder.newButtonElement({
                    actionId: `${DocumentListActionId.INSPECT_SOURCE}:${doc.id}`,
                    text: blockBuilder.newPlainTextObject('🔍 Chi tiết'),
                    value: JSON.stringify({ sourceId: doc.id, filename: doc.filename }),
                }),
            );
        }

        if (showDeleteButton) {
            buttons.push(
                blockBuilder.newButtonElement({
                    actionId: `${DocumentListActionId.DELETE_SOURCE}:${doc.id}`,
                    text: blockBuilder.newPlainTextObject('🗑️ Xoá'),
                    style: ButtonStyle.DANGER,
                    value: JSON.stringify({ sourceId: doc.id, filename: doc.filename }),
                }),
            );
        }

        // If single button, use section accessory; if multiple, render section + actions block
        if (buttons.length === 1) {
            blockBuilder.addSectionBlock({
                text: blockBuilder.newMarkdownTextObject(lines.join('\n')),
                accessory: buttons[0],
            });
        } else if (buttons.length > 1) {
            blockBuilder.addSectionBlock({
                text: blockBuilder.newMarkdownTextObject(lines.join('\n')),
            });
            blockBuilder.addActionsBlock({
                elements: buttons,
            });
        } else {
            blockBuilder.addSectionBlock({
                text: blockBuilder.newMarkdownTextObject(lines.join('\n')),
            });
        }
    });

    // 4. Truncation notice if needed
    if (sources.length > maxItems) {
        blockBuilder.addContextBlock({
            elements: [
                blockBuilder.newMarkdownTextObject(
                    `_...và ${sources.length - maxItems} tài liệu khác._`,
                ),
            ],
        });
    }

    // 5. Footer Context
    blockBuilder.addDividerBlock();
    blockBuilder.addContextBlock({
        elements: [
            blockBuilder.newMarkdownTextObject('💡 Sử dụng `/rag docs` để làm mới danh sách hoặc kéo thả tệp mới để bổ sung.'),
        ],
    });

    return blockBuilder;
}

/**
 * Fluent DocumentListBlock class.
 */
export class DocumentListBlock {
    public static readonly ActionIds = DocumentListActionId;

    public static build(
        blockBuilder: BlockBuilder,
        sources: SourceDocument[],
        options?: IDocumentListBlockOptions,
    ): BlockBuilder {
        return buildDocumentListBlocks(blockBuilder, sources, options);
    }
}
