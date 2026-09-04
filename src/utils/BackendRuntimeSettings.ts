import { IRead } from '@rocket.chat/apps-engine/definition/accessors';

export interface BackendRuntimeSettings {
    workspaceId: string;
    model: string;
    embeddingModel: string;
    temperature: number;
    maxHistory: number;
    enableCitations: boolean;
}

export const DEFAULT_BACKEND_RUNTIME_SETTINGS: BackendRuntimeSettings = {
    workspaceId: 'default',
    model: 'api-ai.box/deepseek-v4-flash',
    embeddingModel: 'openrouter/openai/text-embedding-3-small',
    temperature: 0.7,
    maxHistory: 10,
    enableCitations: true,
};

export const ALLOWED_LLM_MODELS = [
    'api-ai.box/deepseek-v4-flash',
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3-5-sonnet',
    'google/gemini-2.0-flash-001',
] as const;

export const ALLOWED_EMBEDDING_MODELS = [
    'openrouter/openai/text-embedding-3-small',
    'openai/text-embedding-3-small',
    'openai/text-embedding-3-large',
] as const;

/**
 * Reads all LLM and RAG runtime settings with standard defaults from App Settings.
 */
export async function getBackendRuntimeSettings(read: IRead): Promise<BackendRuntimeSettings> {
    try {
        const settings = read.getEnvironmentReader().getSettings();

        const [
            workspaceIdVal,
            modelVal,
            embeddingModelVal,
            temperatureVal,
            maxHistoryVal,
            enableCitationsVal,
        ] = await Promise.all([
            settings.getValueById('workspace-id').catch(() => undefined),
            settings.getValueById('model').catch(() => undefined),
            settings.getValueById('embedding-model').catch(() => undefined),
            settings.getValueById('temperature').catch(() => undefined),
            settings.getValueById('max-history').catch(() => undefined),
            settings.getValueById('enable-citations').catch(() => undefined),
        ]);

        const workspaceId =
            typeof workspaceIdVal === 'string' && workspaceIdVal.trim().length > 0
                ? workspaceIdVal.trim()
                : DEFAULT_BACKEND_RUNTIME_SETTINGS.workspaceId;

        const model =
            typeof modelVal === 'string' && modelVal.trim().length > 0
                ? modelVal.trim()
                : DEFAULT_BACKEND_RUNTIME_SETTINGS.model;

        const embeddingModel =
            typeof embeddingModelVal === 'string' && embeddingModelVal.trim().length > 0
                ? embeddingModelVal.trim()
                : DEFAULT_BACKEND_RUNTIME_SETTINGS.embeddingModel;

        let temperature =
            typeof temperatureVal === 'number' && Number.isFinite(temperatureVal)
                ? temperatureVal
                : typeof temperatureVal === 'string' && !isNaN(Number(temperatureVal))
                    ? Number(temperatureVal)
                    : DEFAULT_BACKEND_RUNTIME_SETTINGS.temperature;

        // Clamp temperature to valid range [0.0, 2.0]
        if (temperature < 0.0) temperature = 0.0;
        if (temperature > 2.0) temperature = 2.0;

        const maxHistory =
            typeof maxHistoryVal === 'number' && Number.isFinite(maxHistoryVal)
                ? Math.max(1, Math.floor(maxHistoryVal))
                : DEFAULT_BACKEND_RUNTIME_SETTINGS.maxHistory;

        const enableCitations =
            typeof enableCitationsVal === 'boolean'
                ? enableCitationsVal
                : DEFAULT_BACKEND_RUNTIME_SETTINGS.enableCitations;

        return {
            workspaceId,
            model,
            embeddingModel,
            temperature,
            maxHistory,
            enableCitations,
        };
    } catch {
        return { ...DEFAULT_BACKEND_RUNTIME_SETTINGS };
    }
}
