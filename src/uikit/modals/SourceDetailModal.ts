import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import {
    BlockBuilder,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { CitationSource } from '../../utils/Formatter';
import { getConfidenceInfo } from '../blocks/SourceCardsBlock';

/**
 * Information regarding an individual chunk excerpt.
 */
export interface IChunkExcerpt {
    chunkIndex?: number;
    text: string;
    score?: number;
    page?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Parameters for building the SourceDetail modal view.
 */
export interface ISourceDetailModalParams {
    appId?: string;
    filename?: string;
    sourceId?: string;
    chunksCount?: number;
    chunks?: IChunkExcerpt[];
    sources?: CitationSource[];
    query?: string;
    documentUrl?: string;
    status?: string;
    createdAt?: string;
    viewId?: string;
    customTitle?: string;
}

/**
 * Builds an IUIKitModalViewParam displaying raw retrieved chunk excerpts for deep transparency.
 * Supports both object params and positional params (modify, sources, titleText).
 */
export function buildSourceDetailModal(
    paramOrModify: ISourceDetailModalParams | IModify,
    sourcesArg?: CitationSource[],
    titleTextArg?: string,
): IUIKitModalViewParam {
    let params: ISourceDetailModalParams;

    if (typeof paramOrModify === 'object' && 'getCreator' in paramOrModify) {
        params = {
            sources: sourcesArg || [],
            customTitle: titleTextArg || 'Chi tiết trích đoạn RAG',
        };
    } else {
        params = paramOrModify as ISourceDetailModalParams;
    }

    const {
        appId = 'ragchat',
        filename,
        sourceId,
        chunks = [],
        sources = [],
        chunksCount,
        query,
        documentUrl,
        status,
        createdAt,
        viewId = 'source-detail-modal',
        customTitle = 'Chi Tiết Nguồn Trích Dẫn',
    } = params;

    const builder = new BlockBuilder(appId);

    // Merge chunks and sources for rendering
    const allExcerpts: Array<{
        title?: string;
        text: string;
        score?: number;
        page?: number;
        index?: number;
    }> = [];

    if (chunks && chunks.length > 0) {
        chunks.forEach((c, idx) => {
            allExcerpts.push({
                text: c.text,
                score: c.score,
                page: c.page,
                index: c.chunkIndex !== undefined ? c.chunkIndex : idx + 1,
            });
        });
    } else if (sources && sources.length > 0) {
        sources.forEach((s, idx) => {
            allExcerpts.push({
                title: s.title,
                text: s.snippet,
                score: s.relevance,
                page: s.page,
                index: idx + 1,
            });
        });
    }

    // 1. Overview Section Block
    const metaLines: string[] = [
        filename ? `📄 **Tên tài liệu:** \`${filename}\`` : '',
        sourceId ? `🆔 **ID:** \`${sourceId}\`` : '',
        status ? `📊 **Trạng thái:** \`${status}\`` : '',
        createdAt ? `📅 **Ngày tải lên:** \`${createdAt.slice(0, 10)}\`` : '',
        chunksCount !== undefined ? `🔢 **Tổng số chunks:** \`${chunksCount}\`` : '',
        query ? `🔍 **Truy vấn:** *"${query}"*` : '',
        documentUrl ? `🔗 [Mở tài liệu gốc](${documentUrl})` : '',
    ].filter(Boolean);

    if (metaLines.length > 0) {
        builder.addSectionBlock({
            text: builder.newMarkdownTextObject(metaLines.join('\n')),
        });
        builder.addDividerBlock();
    }

    // 2. Chunks Content Section
    if (allExcerpts.length === 0) {
        builder.addSectionBlock({
            text: builder.newMarkdownTextObject('_Không có đoạn trích dẫn chi tiết nào được cung cấp._'),
        });
    } else {
        builder.addSectionBlock({
            text: builder.newMarkdownTextObject(`📑 **Các đoạn trích dẫn liên quan (${allExcerpts.length} chunks):**`),
        });

        allExcerpts.slice(0, 10).forEach((item, idx) => {
            const chunkNum = item.index !== undefined ? item.index : idx + 1;
            const confidence = getConfidenceInfo(item.score);
            const scoreLabel = confidence.label ? ` • ${confidence.label}` : '';
            const pageLabel = item.page ? ` • Trang ${item.page}` : '';
            const titleLabel = item.title ? ` [${item.title}]` : '';

            // Clean chunk text
            const rawText = (item.text || '').trim();
            const previewText = rawText.length > 800 ? rawText.slice(0, 800) + '…' : rawText;

            builder.addSectionBlock({
                text: builder.newMarkdownTextObject(
                    `**Chunk #${chunkNum}**${titleLabel}${scoreLabel}${pageLabel}\n\n>>> ${previewText}`,
                ),
            });

            if (idx < allExcerpts.length - 1) {
                builder.addDividerBlock();
            }
        });
    }

    builder.addContextBlock({
        elements: [
            builder.newMarkdownTextObject('💡 Các đoạn trích dẫn được trích xuất trực tiếp từ cơ sở dữ liệu vector.'),
        ],
    });

    return {
        id: viewId,
        title: builder.newPlainTextObject(customTitle),
        blocks: builder.getBlocks(),
        close: builder.newButtonElement({
            actionId: 'source-detail-close',
            text: builder.newPlainTextObject('Đóng'),
        }),
        clearOnClose: true,
        notifyOnClose: false,
    };
}

/**
 * Fluent SourceDetailModal class.
 */
export class SourceDetailModal {
    public static readonly ViewId = 'source-detail-modal';

    public static build(
        paramOrModify: ISourceDetailModalParams | IModify,
        sourcesArg?: CitationSource[],
        titleTextArg?: string,
    ): IUIKitModalViewParam {
        return buildSourceDetailModal(paramOrModify, sourcesArg, titleTextArg);
    }
}
