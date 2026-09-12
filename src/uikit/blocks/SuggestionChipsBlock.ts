import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { BlockBuilder, IActionsBlock } from '@rocket.chat/apps-engine/definition/uikit';

export interface SuggestionChip {
    label: string;
    query: string;
}

export const DEFAULT_SUGGESTION_CHIPS: SuggestionChip[] = [
    { label: '💡 Tóm tắt dự án', query: 'Tóm tắt các điểm nổi bật của dự án này' },
    { label: '🔍 Tìm tài liệu API', query: 'Tìm tài liệu và đặc tả API' },
    { label: '❓ Quy định & Phúc lợi', query: 'Quy định nghỉ phép và chế độ phúc lợi là gì?' },
    { label: '📚 Quản lý tài liệu', query: '/rag docs' },
];

/**
 * Builds suggestion chip action buttons for interactive onboarding and quick prompts.
 */
export function buildSuggestionChipsBlock(
    modify: IModify,
    chips: SuggestionChip[] = DEFAULT_SUGGESTION_CHIPS,
): IActionsBlock {
    const blockBuilder = modify.getCreator().getBlockBuilder();

    return {
        type: 'actions' as any,
        elements: chips.map((chip, idx) =>
            blockBuilder.newButtonElement({
                actionId: `suggestion_chip:${idx}`,
                text: blockBuilder.newPlainTextObject(chip.label),
                value: chip.query,
            }),
        ),
    };
}

/**
 * Appends suggestion chips to a BlockBuilder.
 */
export function addSuggestionChipsBlocks(
    blockBuilder: BlockBuilder,
    chips: SuggestionChip[] = DEFAULT_SUGGESTION_CHIPS,
): BlockBuilder {
    blockBuilder.addActionsBlock({
        elements: chips.map((chip, idx) =>
            blockBuilder.newButtonElement({
                actionId: `suggestion_chip:${idx}`,
                text: blockBuilder.newPlainTextObject(chip.label),
                value: chip.query,
            }),
        ),
    });
    return blockBuilder;
}

