import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

/**
 * Registers all configurable administration settings for RAGChat App.
 *
 * Configurable settings include:
 * - `backend-url`: The HTTP endpoint of the Python FastAPI backend service
 * - `api-key`: Optional shared secret token for authenticating backend requests
 * - `model`: Primary Large Language Model for text synthesis
 * - `embedding-model`: Embedding model for dense vector search
 * - `max-history`: Sliding window conversational memory length
 * - `temperature`: Sampling temperature for LLM generation
 * - `enable-citations`: Flag to toggle showing source chunks and citations
 */
export async function registerSettings(
    configuration: IConfigurationExtend,
): Promise<void> {
    await Promise.all([
        // 1. Python RAG Backend URL (Required)
        configuration.settings.provideSetting({
            id: 'backend-url',
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: 'Backend URL',
            i18nDescription: 'URL of the Python RAG backend service',
            i18nPlaceholder: 'http://backend:8000',
            packageValue: 'http://backend:8000',
        }),

        // 2. Shared API Key for Bearer Authentication (Optional)
        configuration.settings.provideSetting({
            id: 'api-key',
            type: SettingType.PASSWORD,
            required: false,
            public: false,
            i18nLabel: 'API Key',
            i18nDescription: 'API key for authenticating with the backend (optional)',
            packageValue: '',
        }),

        // 3. LLM Model Selection
        configuration.settings.provideSetting({
            id: 'model',
            type: SettingType.SELECT,
            required: true,
            public: false,
            i18nLabel: 'LLM Model',
            i18nDescription: 'Language model for answer generation',
            packageValue: 'gpt-4o',
            values: [
                { key: 'gpt-4o', i18nLabel: 'GPT-4o' },
                { key: 'gpt-4o-mini', i18nLabel: 'GPT-4o Mini' },
                { key: 'claude-3-5-sonnet', i18nLabel: 'Claude 3.5 Sonnet' },
                { key: 'gemini-2.0-flash', i18nLabel: 'Gemini 2.0 Flash' },
            ],
        }),

        // 4. Document & Query Embedding Model
        configuration.settings.provideSetting({
            id: 'embedding-model',
            type: SettingType.SELECT,
            required: true,
            public: false,
            i18nLabel: 'Embedding Model',
            i18nDescription: 'Model for generating document and query embeddings',
            packageValue: 'text-embedding-3-small',
            values: [
                { key: 'text-embedding-3-small', i18nLabel: 'OpenAI text-embedding-3-small' },
                { key: 'text-embedding-3-large', i18nLabel: 'OpenAI text-embedding-3-large' },
                { key: 'bge-large-en', i18nLabel: 'BGE Large (EN)' },
                { key: 'e5-large', i18nLabel: 'E5 Large' },
            ],
        }),

        // 5. Sliding Conversation History Memory Limit
        configuration.settings.provideSetting({
            id: 'max-history',
            type: SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'Max Conversation History',
            i18nDescription: 'Maximum number of messages to keep in conversation history',
            packageValue: 10,
        }),

        // 6. LLM Generation Temperature
        configuration.settings.provideSetting({
            id: 'temperature',
            type: SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'LLM Temperature',
            i18nDescription: 'Controls randomness in responses (0.0 = deterministic, 1.0 = creative)',
            packageValue: 0.7,
        }),

        // 7. Citation Attachments Toggle
        configuration.settings.provideSetting({
            id: 'enable-citations',
            type: SettingType.BOOLEAN,
            required: false,
            public: true,
            i18nLabel: 'Enable Citations',
            i18nDescription: 'Show document sources with each answer',
            packageValue: true,
        }),
    ]);
}

