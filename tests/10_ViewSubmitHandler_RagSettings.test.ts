import { describe, it, expect, beforeEach } from 'vitest';
import { ViewSubmitHandler } from '../src/handlers/ViewSubmitHandler';
import { RagSettingsStore } from '../src/persistence/ragSettingsStore';
import { RagSettingsActionId } from '../src/uikit/modals/RagSettingsModal';
import { MockRead } from './mocks/MockRead';
import { MockModify } from './mocks/MockModify';
import { MockHttp } from './mocks/MockHttp';
import { MockPersistence } from './mocks/MockPersistence';
import { IUser, UserType } from '@rocket.chat/apps-engine/definition/users';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';

describe('Unit Test Suite: ViewSubmitHandler (RAG Room Settings)', () => {
    let mockRead: MockRead;
    let mockModify: MockModify;
    let mockHttp: MockHttp;
    let mockPersistence: MockPersistence;
    let handler: ViewSubmitHandler;
    let store: RagSettingsStore;

    const testRoom: IRoom = {
        id: 'settings-room-1',
        slugifiedName: 'settings-room',
        displayName: 'Settings Room',
        type: RoomType.CHANNEL,
        creator: { id: 'admin-id', username: 'admin.user', name: 'Admin', roles: ['admin'] } as any,
        usernames: ['admin.user', 'regular.user'],
        userIds: ['admin-id', 'regular-id'],
        isDefault: true,
        isReadOnly: false,
        displaySystemMessages: false,
        updatedAt: new Date(),
        createdAt: new Date(),
    };

    const regularUser: IUser = {
        id: 'regular-id',
        username: 'regular.user',
        name: 'Regular User',
        roles: ['user'],
        type: UserType.USER,
        status: 'online',
        statusConnection: 'online' as any,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
        utcOffset: 0,
        emails: [],
    };

    const adminUser: IUser = {
        id: 'admin-id',
        username: 'admin.user',
        name: 'Admin User',
        roles: ['admin'],
        type: UserType.USER,
        status: 'online',
        statusConnection: 'online' as any,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
        utcOffset: 0,
        emails: [],
    };

    beforeEach(() => {
        mockRead = new MockRead();
        mockModify = new MockModify();
        mockHttp = new MockHttp();
        mockPersistence = new MockPersistence(mockRead);
        handler = new ViewSubmitHandler();
        store = new RagSettingsStore(mockRead, mockPersistence);

        mockRead.setRoom('settings-room-1', testRoom);
    });

    it('denies submission when user does not have admin/moderator/owner/leader role', async () => {
        const viewSubmitCtx = {
            getInteractionData: () => ({
                view: {
                    id: 'rag-settings-modal',
                    state: {
                        [RagSettingsActionId.MODEL_SELECT]: { value: 'gpt-4o' },
                        [RagSettingsActionId.SEARCH_MODE_SELECT]: { value: 'hybrid' },
                        [RagSettingsActionId.TOP_K_SELECT]: { value: '5' },
                        [RagSettingsActionId.THRESHOLD_SELECT]: { value: '0.6' },
                    },
                },
                user: regularUser,
                room: testRoom,
                triggerId: 'trig-1',
            }),
            getInteractionResponder: () => ({
                successResponse: () => ({ success: true }),
                errorResponse: () => ({ success: false }),
                viewErrorResponse: (opts: any) => ({ success: false, ...opts }),
            }),
        };

        const res = await handler.handleViewSubmit(
            viewSubmitCtx as any,
            mockRead,
            mockHttp,
            mockPersistence,
            mockModify,
        );

        // Settings should NOT be persisted
        const savedSettings = await store.getRoomSettings('settings-room-1');
        expect(savedSettings).toBeNull();
    });

    it('successfully parses UIKit state and persists valid settings when submitted by admin', async () => {
        // Mock capabilities endpoint response
        mockHttp.registerMockResponse({
            url: '/api/v1/integrations/rocketchat/capabilities',
            method: 'GET',
            statusCode: 200,
            data: {
                lexicalRetrievalEnabled: true,
                availableSearchModes: ['semantic', 'keyword', 'hybrid'],
                promptMaxCharacters: 1500,
                promptTokenBudget: 512,
            },
        });

        const viewSubmitCtx = {
            getInteractionData: () => ({
                view: {
                    id: 'rag-settings-modal',
                    state: {
                        [RagSettingsActionId.MODEL_SELECT]: { value: 'gpt-4o' },
                        [RagSettingsActionId.SEARCH_MODE_SELECT]: { value: 'hybrid' },
                        [RagSettingsActionId.TOP_K_SELECT]: { value: '10' },
                        [RagSettingsActionId.THRESHOLD_SELECT]: { value: '0.8' },
                        [RagSettingsActionId.SYSTEM_PROMPT_INPUT]: { value: 'Instructions for this room' },
                    },
                },
                user: adminUser,
                room: testRoom,
                triggerId: 'trig-2',
            }),
            getInteractionResponder: () => ({
                successResponse: () => ({ success: true }),
                errorResponse: () => ({ success: false }),
                viewErrorResponse: (opts: any) => ({ success: false, ...opts }),
            }),
        };

        const res = await handler.handleViewSubmit(
            viewSubmitCtx as any,
            mockRead,
            mockHttp,
            mockPersistence,
            mockModify,
        );

        expect(res.success).toBe(true);

        const saved = await store.getRoomSettings('settings-room-1');
        expect(saved).not.toBeNull();
        expect(saved?.model).toBe('gpt-4o');
        expect(saved?.searchMode).toBe('hybrid');
        expect(saved?.topK).toBe(10);
        expect(saved?.similarityThreshold).toBe(0.8);
        expect(saved?.systemPrompt).toBe('Instructions for this room');
    });

    it('rejects system prompt exceeding maximum characters', async () => {
        mockHttp.registerMockResponse({
            url: '/api/v1/integrations/rocketchat/capabilities',
            method: 'GET',
            statusCode: 200,
            data: {
                lexicalRetrievalEnabled: true,
                availableSearchModes: ['semantic', 'keyword', 'hybrid'],
                promptMaxCharacters: 1500,
                promptTokenBudget: 512,
            },
        });

        const viewSubmitCtx = {
            getInteractionData: () => ({
                view: {
                    id: 'rag-settings-modal',
                    state: {
                        [RagSettingsActionId.MODEL_SELECT]: { value: 'gpt-4o' },
                        [RagSettingsActionId.SEARCH_MODE_SELECT]: { value: 'semantic' },
                        [RagSettingsActionId.TOP_K_SELECT]: { value: '5' },
                        [RagSettingsActionId.THRESHOLD_SELECT]: { value: '0.6' },
                        [RagSettingsActionId.SYSTEM_PROMPT_INPUT]: { value: 'a'.repeat(1600) },
                    },
                },
                user: adminUser,
                room: testRoom,
                triggerId: 'trig-3',
            }),
            getInteractionResponder: () => ({
                successResponse: () => ({ success: true }),
                errorResponse: () => ({ success: false }),
                viewErrorResponse: (opts: any) => ({ success: false, ...opts }),
            }),
        };

        await handler.handleViewSubmit(
            viewSubmitCtx as any,
            mockRead,
            mockHttp,
            mockPersistence,
            mockModify,
        );

        const saved = await store.getRoomSettings('settings-room-1');
        expect(saved).toBeNull();
    });

    it('rejects search mode when declared unavailable by backend capabilities', async () => {
        // Backend only supports semantic
        mockHttp.registerMockResponse({
            url: '/api/v1/integrations/rocketchat/capabilities',
            method: 'GET',
            statusCode: 200,
            data: {
                lexicalRetrievalEnabled: false,
                availableSearchModes: ['semantic'],
                promptMaxCharacters: 1500,
                promptTokenBudget: 512,
            },
        });

        const viewSubmitCtx = {
            getInteractionData: () => ({
                view: {
                    id: 'rag-settings-modal',
                    state: {
                        [RagSettingsActionId.MODEL_SELECT]: { value: 'gpt-4o' },
                        [RagSettingsActionId.SEARCH_MODE_SELECT]: { value: 'hybrid' }, // Not available!
                        [RagSettingsActionId.TOP_K_SELECT]: { value: '5' },
                        [RagSettingsActionId.THRESHOLD_SELECT]: { value: '0.6' },
                    },
                },
                user: adminUser,
                room: testRoom,
                triggerId: 'trig-4',
            }),
            getInteractionResponder: () => ({
                successResponse: () => ({ success: true }),
                errorResponse: () => ({ success: false }),
                viewErrorResponse: (opts: any) => ({ success: false, ...opts }),
            }),
        };

        await handler.handleViewSubmit(
            viewSubmitCtx as any,
            mockRead,
            mockHttp,
            mockPersistence,
            mockModify,
        );

        const saved = await store.getRoomSettings('settings-room-1');
        expect(saved).toBeNull();
    });
});
