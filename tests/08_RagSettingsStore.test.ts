import { describe, it, expect, beforeEach } from 'vitest';
import { RagSettingsStore, type RoomRagSettings } from '../src/persistence/ragSettingsStore';
import { MockRead } from './mocks/MockRead';
import { MockPersistence } from './mocks/MockPersistence';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

describe('Unit Test Suite: RagSettingsStore', () => {
    let mockRead: MockRead;
    let mockPersistence: MockPersistence;
    let store: RagSettingsStore;

    beforeEach(() => {
        mockRead = new MockRead();
        mockPersistence = new MockPersistence(mockRead);
        store = new RagSettingsStore(mockRead, mockPersistence);
    });

    describe('1. Missing-settings default', () => {
        it('returns null when room has no configured settings', async () => {
            const settings = await store.getRoomSettings('unconfigured-room');
            expect(settings).toBeNull();
        });
    });

    describe('2. Room-key isolation', () => {
        it('isolates settings between different rooms', async () => {
            const room1Settings: RoomRagSettings = {
                model: 'gpt-4o',
                searchMode: 'hybrid',
                topK: 10,
                similarityThreshold: 0.8,
                systemPrompt: 'Room 1 instructions',
            };

            const room2Settings: RoomRagSettings = {
                model: 'gpt-4o-mini',
                searchMode: 'semantic',
                topK: 3,
                similarityThreshold: 0.5,
                systemPrompt: 'Room 2 instructions',
            };

            await store.setRoomSettings('room-1', room1Settings);
            await store.setRoomSettings('room-2', room2Settings);

            const fetchedRoom1 = await store.getRoomSettings('room-1');
            const fetchedRoom2 = await store.getRoomSettings('room-2');

            expect(fetchedRoom1).not.toBeNull();
            expect(fetchedRoom1?.model).toBe('gpt-4o');
            expect(fetchedRoom1?.searchMode).toBe('hybrid');
            expect(fetchedRoom1?.topK).toBe(10);
            expect(fetchedRoom1?.systemPrompt).toBe('Room 1 instructions');

            expect(fetchedRoom2).not.toBeNull();
            expect(fetchedRoom2?.model).toBe('gpt-4o-mini');
            expect(fetchedRoom2?.searchMode).toBe('semantic');
            expect(fetchedRoom2?.topK).toBe(3);
            expect(fetchedRoom2?.systemPrompt).toBe('Room 2 instructions');
        });

        it('clearing one room does not affect other rooms', async () => {
            await store.setRoomSettings('room-A', { searchMode: 'keyword', topK: 5, similarityThreshold: 0.6 });
            await store.setRoomSettings('room-B', { searchMode: 'semantic', topK: 8, similarityThreshold: 0.8 });

            await store.clearRoomSettings('room-A');

            expect(await store.getRoomSettings('room-A')).toBeNull();
            const roomB = await store.getRoomSettings('room-B');
            expect(roomB).not.toBeNull();
            expect(roomB?.searchMode).toBe('semantic');
            expect(roomB?.topK).toBe(8);
        });
    });

    describe('3. Persistence tampering & validation rejection', () => {
        it('rejects / safely sanitizes corrupted persistence objects', async () => {
            // Tamper directly with underlying persistence
            const assocs = [
                new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, 'tampered-room'),
                new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, 'rag_room_settings'),
            ];
            await mockPersistence.updateByAssociations(assocs, {
                roomId: 'tampered-room',
                searchMode: 'invalid-mode',
                topK: -99,
                similarityThreshold: 'not-a-number',
                systemPrompt: 'x'.repeat(2000), // Exceeds 1500 chars
            }, true);

            // Fetch should either return null or safe sanitized settings
            const settings = await store.getRoomSettings('tampered-room');
            expect(settings).toBeNull();
        });

        it('ignores records from mismatched roomId in association results', async () => {
            const assocs = [
                new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, 'room-X'),
                new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, 'rag_room_settings'),
            ];
            await mockPersistence.updateByAssociations(assocs, {
                roomId: 'other-room', // Mismatched room id
                searchMode: 'semantic',
                topK: 5,
                similarityThreshold: 0.6,
            }, true);

            const settings = await store.getRoomSettings('room-X');
            expect(settings).toBeNull();
        });
    });
});
