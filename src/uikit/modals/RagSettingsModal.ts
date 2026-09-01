import {
    BlockBuilder,
    ButtonStyle,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';

/**
 * Interface representing customizable RAG configuration options.
 */
export interface IRagSettings {
    model?: string;
    searchMode?: 'semantic' | 'hybrid' | 'keyword';
    topK?: number;
    similarityThreshold?: number;
    systemPrompt?: string;
}

/**
 * Parameters for building the RagSettings modal view.
 */
export interface IRagSettingsModalParams {
    appId: string;
    currentSettings?: IRagSettings;
    viewId?: string;
    title?: string;
}

/**
 * Action IDs for RAG settings modal inputs.
 */
export enum RagSettingsActionId {
    MODEL_SELECT = 'rag_setting_model',
    SEARCH_MODE_SELECT = 'rag_setting_search_mode',
    TOP_K_SELECT = 'rag_setting_top_k',
    THRESHOLD_SELECT = 'rag_setting_threshold',
    SYSTEM_PROMPT_INPUT = 'rag_setting_system_prompt',
}

/**
 * Builds an IUIKitModalViewParam for configuring RAG and LLM options.
 */
export function buildRagSettingsModal(
    params: IRagSettingsModalParams,
): IUIKitModalViewParam {
    const {
        appId,
        currentSettings = {},
        viewId = 'rag-settings-modal',
        title = '⚙️ Cấu Hình RAG & AI',
    } = params;

    const builder = new BlockBuilder(appId);

    // 1. Intro Section
    builder.addSectionBlock({
        text: builder.newMarkdownTextObject(
            'Tuỳ chỉnh các tham số truy xuất tri thức và mô hình AI cho không gian làm việc này.',
        ),
    });

    builder.addDividerBlock();

    // 2. AI Model Selection
    const selectedModel = currentSettings.model || 'gpt-4o-mini';
    builder.addInputBlock({
        label: builder.newPlainTextObject('Mô hình AI (LLM Model):'),
        element: builder.newStaticSelectElement({
            actionId: RagSettingsActionId.MODEL_SELECT,
            placeholder: builder.newPlainTextObject('Chọn mô hình AI...'),
            initialValue: selectedModel,
            options: [
                { text: builder.newPlainTextObject('GPT-4o (Mạnh nhất, hỗ trợ đa phương tiện)'), value: 'gpt-4o' },
                { text: builder.newPlainTextObject('GPT-4o-mini (Nhanh, tiết kiệm chi phí)'), value: 'gpt-4o-mini' },
                { text: builder.newPlainTextObject('Claude 3.5 Sonnet (Thông minh, lý luận cao)'), value: 'claude-3-5-sonnet-20241022' },
                { text: builder.newPlainTextObject('Gemini 1.5 Pro (Ngữ cảnh cực lớn)'), value: 'gemini-1.5-pro' },
                { text: builder.newPlainTextObject('Llama 3.1 70B (Mã nguồn mở)'), value: 'llama-3.1-70b' },
            ],
        }),
    });

    // 3. Search Mode Selection
    const selectedMode = currentSettings.searchMode || 'hybrid';
    builder.addInputBlock({
        label: builder.newPlainTextObject('Phương thức tìm kiếm (Search Mode):'),
        element: builder.newStaticSelectElement({
            actionId: RagSettingsActionId.SEARCH_MODE_SELECT,
            placeholder: builder.newPlainTextObject('Chọn chế độ tìm kiếm...'),
            initialValue: selectedMode,
            options: [
                { text: builder.newPlainTextObject('🔀 Hybrid (Kết hợp Vector Ngữ nghĩa + Từ khoá BM25)'), value: 'hybrid' },
                { text: builder.newPlainTextObject('🧠 Semantic Vector (Chỉ tìm theo ý nghĩa ngữ cảnh)'), value: 'semantic' },
                { text: builder.newPlainTextObject('🔍 Keyword / Fulltext (Chỉ tìm theo từ khoá chính xác)'), value: 'keyword' },
            ],
        }),
    });

    // 4. Top-K Chunks Retrieved
    const selectedTopK = currentSettings.topK ? String(currentSettings.topK) : '5';
    builder.addInputBlock({
        label: builder.newPlainTextObject('Số lượng đoạn trích dẫn (Top-K Chunks):'),
        element: builder.newStaticSelectElement({
            actionId: RagSettingsActionId.TOP_K_SELECT,
            placeholder: builder.newPlainTextObject('Chọn số lượng chunks...'),
            initialValue: selectedTopK,
            options: [
                { text: builder.newPlainTextObject('3 chunks (Ngắn gọn, phản hồi nhanh)'), value: '3' },
                { text: builder.newPlainTextObject('5 chunks (Khuyên dùng - Cân bằng)'), value: '5' },
                { text: builder.newPlainTextObject('8 chunks (Chi tiết hơn)'), value: '8' },
                { text: builder.newPlainTextObject('10 chunks (Toàn diện, tài liệu dài)'), value: '10' },
                { text: builder.newPlainTextObject('15 chunks (Tối đa)'), value: '15' },
            ],
        }),
    });

    // 5. Similarity Threshold / Confidence Filter
    const selectedThreshold = currentSettings.similarityThreshold !== undefined
        ? String(currentSettings.similarityThreshold)
        : '0.6';

    builder.addInputBlock({
        label: builder.newPlainTextObject('Ngưỡng tương đồng tối thiểu (Threshold):'),
        element: builder.newStaticSelectElement({
            actionId: RagSettingsActionId.THRESHOLD_SELECT,
            placeholder: builder.newPlainTextObject('Chọn ngưỡng tương đồng...'),
            initialValue: selectedThreshold,
            options: [
                { text: builder.newPlainTextObject('🟢 0.8 (Rất nghiêm ngặt - Chỉ lấy trích dẫn cực khớp)'), value: '0.8' },
                { text: builder.newPlainTextObject('🟡 0.6 (Khuyên dùng - Tiêu chuẩn)'), value: '0.6' },
                { text: builder.newPlainTextObject('🟠 0.5 (Nới lỏng - Lấy nhiều thông tin hơn)'), value: '0.5' },
                { text: builder.newPlainTextObject('⚪ 0.3 (Rất thấp - Giảm thiểu bỏ sót)'), value: '0.3' },
            ],
        }),
    });

    // 6. System Prompt / Custom Instructions
    const defaultPrompt = currentSettings.systemPrompt || '';
    builder.addInputBlock({
        label: builder.newPlainTextObject('Chỉ dẫn hệ thống bổ sung (System Prompt):'),
        element: builder.newPlainTextInputElement({
            actionId: RagSettingsActionId.SYSTEM_PROMPT_INPUT,
            placeholder: builder.newPlainTextObject('Ví dụ: Trả lời ngắn gọn bằng tiếng Việt, luôn xưng hô thân thiện...'),
            initialValue: defaultPrompt,
            multiline: true,
        }),
        optional: true,
    });

    return {
        id: viewId,
        title: builder.newPlainTextObject(title),
        blocks: builder.getBlocks(),
        submit: builder.newButtonElement({
            actionId: 'rag-settings-submit',
            text: builder.newPlainTextObject('Lưu cài đặt'),
            style: ButtonStyle.PRIMARY,
        }),
        close: builder.newButtonElement({
            actionId: 'rag-settings-cancel',
            text: builder.newPlainTextObject('Huỷ bỏ'),
        }),
        clearOnClose: true,
        notifyOnClose: false,
    };
}

/**
 * Fluent RagSettingsModal class.
 */
export class RagSettingsModal {
    public static readonly ViewId = 'rag-settings-modal';
    public static readonly ActionIds = RagSettingsActionId;

    public static build(params: IRagSettingsModalParams): IUIKitModalViewParam {
        return buildRagSettingsModal(params);
    }
}
