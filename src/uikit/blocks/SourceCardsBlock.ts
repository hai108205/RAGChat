import {
    BlockBuilder,
    IButtonElement,
} from '@rocket.chat/apps-engine/definition/uikit';

/**
 * Interface representing a citation source card item.
 */
export interface ISourceCardItem {
    title: string;
    snippet: string;
    page?: number;
    relevance?: number;
    score?: number;
    url?: string;
    sourceId?: string;
    chunkId?: string;
    chunkIndex?: number;
}

/**
 * Options for rendering SourceCardsBlock.
 */
export interface ISourceCardsBlockOptions {
    title?: string;
    maxItems?: number;
    maxSnippetLength?: number;
    showInspectButton?: boolean;
    showDivider?: boolean;
}

/**
 * Confidence level categorization with badges and labels.
 */
export interface IConfidenceInfo {
    badge: '🟢' | '🟡' | '🔴' | '⚪';
    label: string;
    percentage: number | null;
}

/**
 * Evaluates similarity/relevance score and returns corresponding badge & label:
 * 🟢 (>80%), 🟡 (60-80%), 🔴 (<60%).
 */
export function getConfidenceInfo(relevance?: number): IConfidenceInfo {
    if (typeof relevance !== 'number' || Number.isNaN(relevance)) {
        return { badge: '⚪', label: '', percentage: null };
    }

    // Support both 0.0-1.0 and 0-100 scales
    const normalized = relevance > 1.0 ? relevance / 100 : Math.max(0, Math.min(1, relevance));
    const percentage = Math.round(normalized * 100);

    if (normalized >= 0.8) {
        return {
            badge: '🟢',
            label: `🟢 *${percentage}%*`,
            percentage,
        };
    }

    if (normalized >= 0.6) {
        return {
            badge: '🟡',
            label: `🟡 *${percentage}%*`,
            percentage,
        };
    }

    return {
        badge: '🔴',
        label: `🔴 *${percentage}%*`,
        percentage,
    };
}

/**
 * Truncates snippet text with ellipsis.
 */
export function truncateSnippet(text: string, maxLength = 300): string {
    const clean = (text || '').trim();
    if (clean.length <= maxLength) {
        return clean;
    }
    return clean.slice(0, maxLength).trim() + '…';
}

/**
 * Appends formatted RAG citation cards with confidence badges to the BlockBuilder.
 */
export function buildSourceCardsBlock(
    blockBuilder: BlockBuilder,
    sources: ISourceCardItem[],
    options?: ISourceCardsBlockOptions,
): BlockBuilder {
    const {
        title,
        maxItems = 5,
        maxSnippetLength = 300,
        showInspectButton = true,
        showDivider = true,
    } = options || {};

    if (!sources || sources.length === 0) {
        return blockBuilder;
    }

    if (showDivider) {
        blockBuilder.addDividerBlock();
    }

    const headerText = title || `📑 *Nguồn trích dẫn tham khảo (${sources.length}):*`;
    blockBuilder.addSectionBlock({
        text: blockBuilder.newMarkdownTextObject(headerText),
    });

    const displayItems = sources.slice(0, maxItems);

    displayItems.forEach((source, index) => {
        const score = source.relevance !== undefined ? source.relevance : source.score;
        const confidence = getConfidenceInfo(score);
        const pageLabel = source.page ? ` — Trang ${source.page}` : '';
        const badgeLabel = confidence.label ? ` (${confidence.label})` : '';

        const snippet = truncateSnippet(source.snippet, maxSnippetLength);
        const lines: string[] = [
            `*${index + 1}. ${source.title}*${pageLabel}${badgeLabel}`,
            `> ${snippet}`,
        ];

        if (source.url) {
            lines.push(`• [Xem tài liệu gốc](${source.url})`);
        }

        let accessory: IButtonElement | undefined;
        if (showInspectButton && (source.sourceId || source.chunkId)) {
            const targetId = source.chunkId || source.sourceId || `source_${index}`;
            accessory = blockBuilder.newButtonElement({
                actionId: `inspect_chunk:${targetId}`,
                text: blockBuilder.newPlainTextObject('🔍 Chi tiết'),
                value: JSON.stringify({
                    sourceId: source.sourceId,
                    chunkId: source.chunkId,
                    title: source.title,
                    page: source.page,
                    score,
                }),
            });
        }

        if (accessory) {
            blockBuilder.addSectionBlock({
                text: blockBuilder.newMarkdownTextObject(lines.join('\n')),
                accessory,
            });
        } else {
            blockBuilder.addSectionBlock({
                text: blockBuilder.newMarkdownTextObject(lines.join('\n')),
            });
        }
    });

    if (sources.length > maxItems) {
        blockBuilder.addContextBlock({
            elements: [
                blockBuilder.newMarkdownTextObject(
                    `_...và ${sources.length - maxItems} nguồn trích dẫn khác._`,
                ),
            ],
        });
    }

    blockBuilder.addContextBlock({
        elements: [
            blockBuilder.newMarkdownTextObject('💡 *Độ tương đồng:* 🟢 >80% | 🟡 60-80% | 🔴 <60%'),
        ],
    });

    return blockBuilder;
}

/**
 * Fluent SourceCardsBlock class.
 */
export class SourceCardsBlock {
    public static build(
        blockBuilder: BlockBuilder,
        sources: ISourceCardItem[],
        options?: ISourceCardsBlockOptions,
    ): BlockBuilder {
        return buildSourceCardsBlock(blockBuilder, sources, options);
    }

    public static getConfidence(relevance?: number): IConfidenceInfo {
        return getConfidenceInfo(relevance);
    }
}
