"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSettings = registerSettings;
const settings_1 = require("@rocket.chat/apps-engine/definition/settings");
async function registerSettings(configuration) {
    await Promise.all([
        configuration.settings.provideSetting({
            id: 'backend-url',
            type: settings_1.SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: 'Backend URL',
            i18nDescription: 'URL of the Python RAG backend service',
            i18nPlaceholder: 'http://localhost:8000',
            packageValue: 'http://localhost:8000',
        }),
        configuration.settings.provideSetting({
            id: 'api-key',
            type: settings_1.SettingType.PASSWORD,
            required: false,
            public: false,
            i18nLabel: 'API Key',
            i18nDescription: 'API key for authenticating with the backend (optional)',
            packageValue: '',
        }),
        configuration.settings.provideSetting({
            id: 'model',
            type: settings_1.SettingType.SELECT,
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
        configuration.settings.provideSetting({
            id: 'embedding-model',
            type: settings_1.SettingType.SELECT,
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
        configuration.settings.provideSetting({
            id: 'max-history',
            type: settings_1.SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'Max Conversation History',
            i18nDescription: 'Maximum number of messages to keep in conversation history',
            packageValue: 10,
        }),
        configuration.settings.provideSetting({
            id: 'temperature',
            type: settings_1.SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'LLM Temperature',
            i18nDescription: 'Controls randomness in responses (0.0 = deterministic, 1.0 = creative)',
            packageValue: 0.7,
        }),
        configuration.settings.provideSetting({
            id: 'enable-citations',
            type: settings_1.SettingType.BOOLEAN,
            required: false,
            public: true,
            i18nLabel: 'Enable Citations',
            i18nDescription: 'Show document sources with each answer',
            packageValue: true,
        }),
    ]);
}
