import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

/**
 * Registers all configurable administration settings for RAGChat App.
 *
 * Configurable settings include:
 * - `backend-url`: The HTTP endpoint of the Node.js/Express RAG backend service
 * - `integration-token`: Shared integration secret token for authenticating backend requests
 * - `api-key`: Legacy shared secret token (fallback for integration-token)
 * - `workspace-id`: Identifier for this Rocket.Chat workspace
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
        // 1. Node.js RAG Backend URL (Required)
        configuration.settings.provideSetting({
            id: 'backend-url',
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: 'Backend URL',
            i18nDescription: 'URL of the Node.js RAG backend service (e.g. http://backend:8000)',
            i18nPlaceholder: 'http://backend:8000',
            packageValue: 'http://backend:8000',
        }),

        // 2. Shared Integration Token (Required — callbacks and backend calls are authenticated with it)
        configuration.settings.provideSetting({
            id: 'integration-token',
            type: SettingType.PASSWORD,
            required: true,
            public: false,
            i18nLabel: 'Integration Token',
            i18nDescription: 'Shared secret token for authenticating requests with the Node backend',
            packageValue: '',
        }),

        // 3. Legacy API Key (Fallback for backward compatibility)
        configuration.settings.provideSetting({
            id: 'api-key',
            type: SettingType.PASSWORD,
            required: false,
            public: false,
            i18nLabel: 'Legacy API Key',
            i18nDescription: 'Legacy API key fallback for authenticating with the backend',
            packageValue: '',
        }),

        // 4. Workspace ID
        configuration.settings.provideSetting({
            id: 'workspace-id',
            type: SettingType.STRING,
            required: false,
            public: false,
            i18nLabel: 'Workspace Identifier',
            i18nDescription: 'Identifier for this Rocket.Chat instance (defaults to "default")',
            packageValue: 'default',
        }),

        // 5. LLM Model Selection
        configuration.settings.provideSetting({
            id: 'model',
            type: SettingType.SELECT,
            required: true,
            public: false,
            i18nLabel: 'LLM Model',
            i18nDescription: 'Language model for answer generation',
            packageValue: 'api-ai.box/deepseek-v4-flash',
            values: [
                { key: 'api-ai.box/deepseek-v4-flash', i18nLabel: 'DeepSeek V4 Flash (api-ai.box)' },
                { key: 'openai/gpt-4o-mini', i18nLabel: 'GPT-4o Mini' },
                { key: 'openai/gpt-4o', i18nLabel: 'GPT-4o' },
                { key: 'anthropic/claude-3-5-sonnet', i18nLabel: 'Claude 3.5 Sonnet' },
                { key: 'google/gemini-2.0-flash-001', i18nLabel: 'Gemini 2.0 Flash' },
            ],
        }),

        // 6. Document & Query Embedding Model
        configuration.settings.provideSetting({
            id: 'embedding-model',
            type: SettingType.SELECT,
            required: true,
            public: false,
            i18nLabel: 'Embedding Model',
            i18nDescription: 'Model for generating document and query embeddings',
            packageValue: 'openrouter/openai/text-embedding-3-small',
            values: [
                { key: 'openrouter/openai/text-embedding-3-small', i18nLabel: 'OpenAI text-embedding-3-small (OpenRouter)' },
                { key: 'openai/text-embedding-3-small', i18nLabel: 'OpenAI text-embedding-3-small' },
                { key: 'openai/text-embedding-3-large', i18nLabel: 'OpenAI text-embedding-3-large' },
            ],
        }),

        // 7. Sliding Conversation History Memory Limit
        configuration.settings.provideSetting({
            id: 'max-history',
            type: SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'Max Conversation History',
            i18nDescription: 'Maximum number of messages to keep in conversation history',
            packageValue: 10,
        }),

        // 8. LLM Generation Temperature
        configuration.settings.provideSetting({
            id: 'temperature',
            type: SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'LLM Temperature',
            i18nDescription: 'Controls randomness in responses (0.0 = deterministic, 1.0 = creative)',
            packageValue: 0.7,
        }),

        // 9. Citation Attachments Toggle
        configuration.settings.provideSetting({
            id: 'enable-citations',
            type: SettingType.BOOLEAN,
            required: false,
            public: true,
            i18nLabel: 'Enable Citations',
            i18nDescription: 'Show document sources with each answer',
            packageValue: true,
        }),

        // 10. Public Callback Base URL (required for async job updates)
        configuration.settings.provideSetting({
            id: 'callback-base-url',
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: 'Callback Base URL',
            i18nDescription: 'Public URL of this Rocket.Chat workspace, reachable from the backend (e.g. https://chat.example.com). Used to build the async job callback URL.',
            i18nPlaceholder: 'https://chat.example.com',
            packageValue: '',
        }),

        // 11. DEV ONLY: allow unauthenticated callbacks (never enable in production)
        configuration.settings.provideSetting({
            id: 'allow-unauthenticated-callbacks-dev',
            type: SettingType.BOOLEAN,
            required: false,
            public: false,
            i18nLabel: '[DEV] Allow Unauthenticated Callbacks',
            i18nDescription: 'DANGEROUS: skip Bearer-token verification on the public callback endpoint. Local development only.',
            packageValue: false,
        }),
    ]);
}
