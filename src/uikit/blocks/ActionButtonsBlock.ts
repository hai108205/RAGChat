import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import {
    BlockBuilder,
    ButtonStyle,
    IActionsBlock,
    IButtonElement,
} from '@rocket.chat/apps-engine/definition/uikit';
import { CitationSource } from '../../utils/Formatter';

/**
 * Action IDs for interactive buttons under AI/RAG responses.
 */
export enum ActionButtonActionId {
    FEEDBACK_POSITIVE = 'feedback:positive',
    FEEDBACK_NEGATIVE = 'feedback:negative',
    REGENERATE = 'action:regenerate',
    COPY_MARKDOWN = 'action:copy_markdown',
    INSPECT_CHUNKS = 'action:inspect_chunks',
}

export const BUTTON_ACTIONS = ActionButtonActionId;

/**
 * Payload parameters encoded into button values.
 */
export interface IActionButtonsParams {
    messageId?: string;
    chatMessageId?: string;
    query?: string;
    sourcesCount?: number;
    sources?: CitationSource[];
    rawMarkdown?: string;
    rawText?: string;
    customData?: Record<string, unknown>;
}

/**
 * Visibility options for the action buttons.
 */
export interface IActionButtonsOptions {
    showFeedback?: boolean;
    showRegenerate?: boolean;
    showCopyMarkdown?: boolean;
    showInspectChunks?: boolean;
}

/**
 * Legacy interface for backward compatibility with existing callers.
 */
export interface MessageActionOptions extends IActionButtonsParams {}

const MAX_BUTTON_VALUE_BYTES = 1800;

/**
 * Encodes button payload data into a JSON string safe for UI Kit value fields.
 *
 * Payload shape is action-specific to keep values small:
 * - `feedback:*`        → `{ action, messageId, chatMessageId, rating }`
 * - `action:regenerate` → `{ action, messageId }` (query read from persistence)
 * - `action:copy_markdown` → `{ action, messageId }` (rawMarkdown read from persistence)
 * - `action:inspect_chunks` → `{ action, messageId, sourcesCount }` (sources read from persistence)
 *
 * `sources` and `rawMarkdown` are intentionally excluded — the caller is
 * responsible for saving them via `saveMessageActionPayload()` before
 * rendering the buttons.
 */
export function encodeActionPayload(
    action: string,
    params?: IActionButtonsParams,
    extra?: Record<string, unknown>,
): string {
    const base: Record<string, unknown> = {
        action,
        ...(params?.messageId ? { messageId: params.messageId } : {}),
    };

    switch (action) {
        case ActionButtonActionId.FEEDBACK_POSITIVE:
        case ActionButtonActionId.FEEDBACK_NEGATIVE: {
            if (params?.chatMessageId) base.chatMessageId = params.chatMessageId;
            break;
        }
        case ActionButtonActionId.INSPECT_CHUNKS: {
            if (params?.chatMessageId) base.chatMessageId = params.chatMessageId;
            if (params?.sourcesCount !== undefined) base.sourcesCount = params.sourcesCount;
            break;
        }
        case ActionButtonActionId.REGENERATE:
        case ActionButtonActionId.COPY_MARKDOWN:
        default:
            break;
    }

    const payload = { ...base, ...(extra || {}) };
    const encoded = JSON.stringify(payload);

    // Defensive cap — Rocket.Chat UI Kit rejects oversized values.
    if (encoded.length > MAX_BUTTON_VALUE_BYTES) {
        return JSON.stringify({ action, messageId: params?.messageId });
    }
    return encoded;
}

/**
 * Generates an array of IButtonElement interactive buttons for AI response actions.
 */
export function createActionButtonsElements(
    blockBuilder: BlockBuilder,
    params?: IActionButtonsParams,
    options?: IActionButtonsOptions,
): Array<IButtonElement> {
    const {
        showFeedback = true,
        showRegenerate = true,
        showCopyMarkdown = true,
        showInspectChunks = true,
    } = options || {};

    const elements: Array<IButtonElement> = [];

    // 1. Feedback Thumbs Up
    if (showFeedback) {
        elements.push(
            blockBuilder.newButtonElement({
                actionId: ActionButtonActionId.FEEDBACK_POSITIVE,
                text: blockBuilder.newPlainTextObject('👍 Hữu ích'),
                value: encodeActionPayload(ActionButtonActionId.FEEDBACK_POSITIVE, params, { rating: 'positive' }),
            }),
        );

        // 2. Feedback Thumbs Down
        elements.push(
            blockBuilder.newButtonElement({
                actionId: ActionButtonActionId.FEEDBACK_NEGATIVE,
                text: blockBuilder.newPlainTextObject('👎 Chưa tốt'),
                value: encodeActionPayload(ActionButtonActionId.FEEDBACK_NEGATIVE, params, { rating: 'negative' }),
            }),
        );
    }

    // 3. Regenerate
    if (showRegenerate) {
        elements.push(
            blockBuilder.newButtonElement({
                actionId: ActionButtonActionId.REGENERATE,
                text: blockBuilder.newPlainTextObject('🔄 Tạo lại'),
                value: encodeActionPayload(ActionButtonActionId.REGENERATE, params),
            }),
        );
    }

    // 4. Copy Markdown
    if (showCopyMarkdown) {
        elements.push(
            blockBuilder.newButtonElement({
                actionId: ActionButtonActionId.COPY_MARKDOWN,
                text: blockBuilder.newPlainTextObject('📋 Sao chép'),
                value: encodeActionPayload(ActionButtonActionId.COPY_MARKDOWN, params),
            }),
        );
    }

    // 5. Inspect Chunks
    const hasSources = (params?.sources && params.sources.length > 0) ||
        (params?.sourcesCount !== undefined ? params.sourcesCount > 0 : true);

    if (showInspectChunks && hasSources) {
        elements.push(
            blockBuilder.newButtonElement({
                actionId: ActionButtonActionId.INSPECT_CHUNKS,
                text: blockBuilder.newPlainTextObject('🔍 Nguồn trích dẫn'),
                value: encodeActionPayload(ActionButtonActionId.INSPECT_CHUNKS, params),
            }),
        );
    }

    return elements;
}

/**
 * Appends an actions block containing the interactive AI response buttons to the given BlockBuilder.
 */
export function buildActionButtonsBlock(
    blockBuilder: BlockBuilder,
    params?: IActionButtonsParams,
    options?: IActionButtonsOptions,
): BlockBuilder {
    const elements = createActionButtonsElements(blockBuilder, params, options);
    if (elements.length > 0) {
        blockBuilder.addActionsBlock({
            elements,
        });
    }
    return blockBuilder;
}

/**
 * Helper function accepting IModify directly and returning an IActionsBlock for compatibility.
 */
export function buildMessageActionButtonsBlock(
    modify: IModify,
    options: MessageActionOptions,
): IActionsBlock {
    const blockBuilder = modify.getCreator().getBlockBuilder();
    const elements = createActionButtonsElements(blockBuilder, options);
    return {
        type: 'actions' as any,
        elements,
    };
}

/**
 * Fluent builder class for ActionButtonsBlock.
 */
export class ActionButtonsBlock {
    public static readonly ActionIds = ActionButtonActionId;

    public static build(
        blockBuilder: BlockBuilder,
        params?: IActionButtonsParams,
        options?: IActionButtonsOptions,
    ): BlockBuilder {
        return buildActionButtonsBlock(blockBuilder, params, options);
    }

    public static getElements(
        blockBuilder: BlockBuilder,
        params?: IActionButtonsParams,
        options?: IActionButtonsOptions,
    ): Array<IButtonElement> {
        return createActionButtonsElements(blockBuilder, params, options);
    }
}
