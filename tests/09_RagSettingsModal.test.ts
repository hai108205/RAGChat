import { describe, it, expect } from 'vitest';
import {
    buildRagSettingsModal,
    RagSettingsActionId,
    type IRagSettings,
} from '../src/uikit/modals/RagSettingsModal';
import type { RoomRagCapabilitiesData } from '../src/lib/BackendTypes';

describe('Unit Test Suite: RagSettingsModal', () => {
    const defaultCapabilities: RoomRagCapabilitiesData = {
        lexicalRetrievalEnabled: true,
        availableSearchModes: ['semantic', 'keyword', 'hybrid'],
        promptMaxCharacters: 1500,
        promptTokenBudget: 512,
    };

    const semanticOnlyCapabilities: RoomRagCapabilitiesData = {
        lexicalRetrievalEnabled: false,
        availableSearchModes: ['semantic'],
        promptMaxCharacters: 1500,
        promptTokenBudget: 512,
    };

    it('builds modal view with default options when no settings provided', () => {
        const modal = buildRagSettingsModal({
            appId: 'ragchat',
            capabilities: defaultCapabilities,
        });

        expect(modal.id).toBe('rag-settings-modal');
        expect(modal.blocks).toBeDefined();
        expect(modal.blocks.length).toBeGreaterThan(3);

        const viewJson = JSON.stringify(modal);
        expect(viewJson).toContain(RagSettingsActionId.MODEL_SELECT);
        expect(viewJson).toContain(RagSettingsActionId.SEARCH_MODE_SELECT);
        expect(viewJson).toContain(RagSettingsActionId.TOP_K_SELECT);
        expect(viewJson).toContain(RagSettingsActionId.THRESHOLD_SELECT);
        expect(viewJson).toContain(RagSettingsActionId.SYSTEM_PROMPT_INPUT);
    });

    it('rehydrates initial values from currentSettings', () => {
        const currentSettings: IRagSettings = {
            model: 'claude-3-5-sonnet-20241022',
            searchMode: 'keyword',
            topK: 15,
            similarityThreshold: 0.8,
            systemPrompt: 'Be very concise and structured.',
        };

        const modal = buildRagSettingsModal({
            appId: 'ragchat',
            currentSettings,
            capabilities: defaultCapabilities,
        });

        const viewJson = JSON.stringify(modal);
        expect(viewJson).toContain('claude-3-5-sonnet-20241022');
        expect(viewJson).toContain('"initialValue":"keyword"');
        expect(viewJson).toContain('"initialValue":"15"');
        expect(viewJson).toContain('"initialValue":"0.8"');
        expect(viewJson).toContain('Be very concise and structured.');
    });

    it('hides unavailable search modes when lexical retrieval is disabled', () => {
        const modal = buildRagSettingsModal({
            appId: 'ragchat',
            capabilities: semanticOnlyCapabilities,
        });

        // Find the search mode select block
        const searchModeBlock: any = modal.blocks.find(
            (b: any) => b.element?.actionId === RagSettingsActionId.SEARCH_MODE_SELECT,
        );

        expect(searchModeBlock).toBeDefined();
        const options = searchModeBlock.element.options;
        const optionValues = options.map((opt: any) => opt.value);

        expect(optionValues).toContain('semantic');
        expect(optionValues).not.toContain('hybrid');
        expect(optionValues).not.toContain('keyword');
    });

    it('shows all modes when lexical retrieval is enabled in capabilities', () => {
        const modal = buildRagSettingsModal({
            appId: 'ragchat',
            capabilities: defaultCapabilities,
        });

        const searchModeBlock: any = modal.blocks.find(
            (b: any) => b.element?.actionId === RagSettingsActionId.SEARCH_MODE_SELECT,
        );

        expect(searchModeBlock).toBeDefined();
        const options = searchModeBlock.element.options;
        const optionValues = options.map((opt: any) => opt.value);

        expect(optionValues).toContain('semantic');
        expect(optionValues).toContain('hybrid');
        expect(optionValues).toContain('keyword');
    });

    it('falls back initial searchMode to semantic if current setting is unavailable', () => {
        const modal = buildRagSettingsModal({
            appId: 'ragchat',
            currentSettings: {
                searchMode: 'hybrid',
            },
            capabilities: semanticOnlyCapabilities,
        });

        const searchModeBlock: any = modal.blocks.find(
            (b: any) => b.element?.actionId === RagSettingsActionId.SEARCH_MODE_SELECT,
        );

        expect(searchModeBlock.element.initialValue).toBe('semantic');
    });
});
