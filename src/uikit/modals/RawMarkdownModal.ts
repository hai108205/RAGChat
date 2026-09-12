import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import {
    BlockBuilder,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';

/**
 * Parameters for building the RawMarkdown modal view.
 */
export interface IRawMarkdownModalParams {
    appId?: string;
    rawMarkdown: string;
    title?: string;
    messageId?: string;
    viewId?: string;
}

/**
 * Builds an IUIKitModalViewParam containing a PlainTextInput element with raw markdown for easy copying.
 * Supports both object params and positional params (modify, markdownText, titleText).
 */
export function buildRawMarkdownModal(
    paramOrModify: IRawMarkdownModalParams | IModify,
    markdownTextArg?: string,
    titleTextArg?: string,
): IUIKitModalViewParam {
    let params: IRawMarkdownModalParams;

    if (typeof paramOrModify === 'object' && 'getCreator' in paramOrModify) {
        params = {
            rawMarkdown: markdownTextArg || '',
            title: titleTextArg || 'Sao Chép Markdown Gốc',
        };
    } else {
        params = paramOrModify as IRawMarkdownModalParams;
    }

    const {
        appId = 'ragchat',
        rawMarkdown,
        title = 'Sao Chép Markdown Gốc',
        messageId,
        viewId = 'raw-markdown-modal',
    } = params;

    const builder = new BlockBuilder(appId);

    // 1. Instruction Context
    builder.addContextBlock({
        elements: [
            builder.newMarkdownTextObject(
                '💡 *Hướng dẫn:* Nhấp vào khung bên dưới, nhấn `Ctrl+A` (hoặc `Cmd+A`) và `Ctrl+C` để sao chép toàn bộ văn bản.',
            ),
        ],
    });

    // 2. Multiline PlainTextInput element
    builder.addInputBlock({
        label: builder.newPlainTextObject('Nội dung Markdown:'),
        element: builder.newPlainTextInputElement({
            actionId: 'raw-markdown-input',
            placeholder: builder.newPlainTextObject('Nội dung markdown...'),
            initialValue: rawMarkdown || '',
            multiline: true,
        }),
    });

    // 3. Stats Context
    const charLength = (rawMarkdown || '').length;
    builder.addContextBlock({
        elements: [
            builder.newMarkdownTextObject(
                `📊 Độ dài: *${charLength}* ký tự${messageId ? ` | Tin nhắn ID: \`${messageId}\`` : ''}`,
            ),
        ],
    });

    return {
        id: viewId,
        title: builder.newPlainTextObject(title),
        blocks: builder.getBlocks(),
        close: builder.newButtonElement({
            actionId: 'raw-markdown-close',
            text: builder.newPlainTextObject('Đóng'),
        }),
        clearOnClose: true,
        notifyOnClose: false,
    };
}

/**
 * Fluent RawMarkdownModal class.
 */
export class RawMarkdownModal {
    public static readonly ViewId = 'raw-markdown-modal';

    public static build(
        paramOrModify: IRawMarkdownModalParams | IModify,
        markdownTextArg?: string,
        titleTextArg?: string,
    ): IUIKitModalViewParam {
        return buildRawMarkdownModal(paramOrModify, markdownTextArg, titleTextArg);
    }
}
