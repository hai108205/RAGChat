import { describe, it, expect, beforeEach } from 'vitest';
import { createTestAppHarness, TestHarness } from './mocks/TestAppHarness';
import { RequestMethod } from '@rocket.chat/apps-engine/definition/accessors';
import { UserType, IUser } from '@rocket.chat/apps-engine/definition/users';
import { RoomType, IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { CallbackEndpoint } from '../src/api/CallbackEndpoint';
import { validateCallbackEvent } from '../src/types/CallbackEvents';
import { CallbackReceiptStore } from '../src/persistence/callbackReceiptStore';
import { SessionStore } from '../src/persistence/sessionStore';

describe('Task 9: Callback Idempotency, Persistence, and Contracts', () => {
    let harness: TestHarness;
    let testUser: IUser;
    let testRoom: IRoom;

    beforeEach(() => {
        harness = createTestAppHarness();
        harness.mockRead.setSetting('backend-url', 'http://backend.internal:3000');
        harness.mockRead.setSetting('integration-token', 'valid-secret-token');
        harness.mockRead.setSetting('callback-base-url', 'http://rocketchat.internal:3000');

        testUser = {
            id: 'user-t9-1',
            username: 'alex.engineer',
            name: 'Alex Engineer',
            roles: ['user'],
            type: UserType.USER,
        } as IUser;
        harness.mockRead.setUser(testUser.id, testUser);

        testRoom = {
            id: 'room-t9-1',
            displayName: 'RAG Channel',
            slugifiedName: 'rag-channel',
            type: RoomType.CHANNEL,
            creator: testUser,
        } as IRoom;
        harness.mockRead.setRoom(testRoom.id, testRoom);
    });

    describe('1. CallbackEvents validation & discriminated union', () => {
        it('validates a well-formed chat_completed event', () => {
            const event = validateCallbackEvent({
                event: 'chat_completed',
                request_id: 'req-001',
                job_id: 'job-001',
                user_id: 'user-t9-1',
                room_id: 'room-t9-1',
                placeholder_id: 'placeholder-1',
                query: 'What is RAG?',
                answer: 'Retrieval-Augmented Generation',
                sources: [{ title: 'Doc 1', relevance: 0.9 }],
            });

            expect(event.event).toBe('chat_completed');
            expect(event.requestId).toBe('req-001');
            expect(event.jobId).toBe('job-001');
            if (event.event === 'chat_completed') {
                expect(event.answer).toBe('Retrieval-Augmented Generation');
                expect(event.sources.length).toBe(1);
            }
        });

        it('validates chat_failed event with error details', () => {
            const event = validateCallbackEvent({
                event: 'chat_failed',
                request_id: 'req-002',
                user_id: 'user-t9-1',
                room_id: 'room-t9-1',
                error: 'LLM context timeout',
                error_code: 'TIMEOUT',
            });

            expect(event.event).toBe('chat_failed');
            if (event.event === 'chat_failed') {
                expect(event.error).toBe('LLM context timeout');
                expect(event.errorCode).toBe('TIMEOUT');
            }
        });

        it('validates indexing_complete and indexing_failed events', () => {
            const complete = validateCallbackEvent({
                event: 'indexing_complete',
                request_id: 'req-003',
                user_id: 'user-t9-1',
                room_id: 'room-t9-1',
                document_name: 'architecture.pdf',
                chunks_count: 12,
            });
            expect(complete.event).toBe('indexing_complete');
            if (complete.event === 'indexing_complete') {
                expect(complete.documentName).toBe('architecture.pdf');
                expect(complete.chunksCount).toBe(12);
            }

            const failed = validateCallbackEvent({
                event: 'indexing_failed',
                request_id: 'req-004',
                user_id: 'user-t9-1',
                room_id: 'room-t9-1',
                filename: 'corrupted.docx',
                error: 'Corrupt archive format',
            });
            expect(failed.event).toBe('indexing_failed');
            if (failed.event === 'indexing_failed') {
                expect(failed.documentName).toBe('corrupted.docx');
                expect(failed.error).toBe('Corrupt archive format');
            }
        });

        it('rejects unsupported event name', () => {
            expect(() =>
                validateCallbackEvent({
                    event: 'unknown_event_type',
                    user_id: 'u1',
                    room_id: 'r1',
                }),
            ).toThrow('Unsupported callback event');
        });

        it('rejects missing user_id or room_id', () => {
            expect(() =>
                validateCallbackEvent({
                    event: 'chat_completed',
                    room_id: 'r1',
                    answer: 'yes',
                }),
            ).toThrow('Missing required field: "user_id"');

            expect(() =>
                validateCallbackEvent({
                    event: 'chat_completed',
                    user_id: 'u1',
                    answer: 'yes',
                }),
            ).toThrow('Missing required field: "room_id"');
        });
    });

    describe('2. CallbackReceiptStore state machine & idempotency', () => {
        it('claims new receipt as CLAIMED and advances to COMPLETED', async () => {
            const store = new CallbackReceiptStore(harness.mockRead, harness.mockPersistence);
            const key = 'job-test-101';

            const claimRes = await store.claim(key, 'chat_completed', { jobId: key });
            expect(claimRes.isDuplicate).toBe(false);
            expect(claimRes.isConflicting).toBe(false);
            expect(claimRes.receipt.status).toBe('CLAIMED');

            await store.updateCheckpoint(key, 'PLACEHOLDER_UPDATED');
            const mid = await store.getReceipt(key);
            expect(mid?.checkpoint).toBe('PLACEHOLDER_UPDATED');

            await store.markCompleted(key, 'chat_completed');
            const finalReceipt = await store.getReceipt(key);
            expect(finalReceipt?.status).toBe('COMPLETED');
            expect(finalReceipt?.checkpoint).toBe('COMPLETED');
        });

        it('identifies duplicate delivery of terminal state as isDuplicate=true', async () => {
            const store = new CallbackReceiptStore(harness.mockRead, harness.mockPersistence);
            const key = 'job-dup-102';

            await store.claim(key, 'chat_completed', { jobId: key });
            await store.markCompleted(key, 'chat_completed');

            // Second delivery of same terminal outcome
            const retryClaim = await store.claim(key, 'chat_completed', { jobId: key });
            expect(retryClaim.isDuplicate).toBe(true);
            expect(retryClaim.isConflicting).toBe(false);
        });

        it('detects conflicting callback after terminal state as isConflicting=true', async () => {
            const store = new CallbackReceiptStore(harness.mockRead, harness.mockPersistence);
            const key = 'job-conflict-103';

            // Terminal success first
            await store.claim(key, 'chat_completed', { jobId: key });
            await store.markCompleted(key, 'chat_completed');

            // Opposing failure event arrives later
            const conflictClaim = await store.claim(key, 'chat_failed', { jobId: key });
            expect(conflictClaim.isConflicting).toBe(true);
            expect(conflictClaim.isDuplicate).toBe(false);
        });
    });

    describe('3. SessionStore addMessagesOnce idempotency', () => {
        it('appends messages on first turnId and skips on duplicate turnId', async () => {
            const sessionStore = new SessionStore(harness.mockRead, harness.mockPersistence);
            const turnId = 'req-turn-uniq-1';

            const addedFirst = await sessionStore.addMessagesOnce(
                turnId,
                testUser.id,
                testRoom.id,
                undefined,
                [
                    { role: 'user', content: 'What is Qdrant?', timestamp: 1000 },
                    { role: 'assistant', content: 'Vector database.', timestamp: 1001 },
                ],
            );
            expect(addedFirst).toBe(true);

            const historyFirst = await sessionStore.getHistory(testUser.id, testRoom.id);
            expect(historyFirst.length).toBe(2);

            // Replay same turnId
            const addedSecond = await sessionStore.addMessagesOnce(
                turnId,
                testUser.id,
                testRoom.id,
                undefined,
                [
                    { role: 'user', content: 'What is Qdrant?', timestamp: 1000 },
                    { role: 'assistant', content: 'Vector database.', timestamp: 1001 },
                ],
            );
            expect(addedSecond).toBe(false);

            // History remains unchanged
            const historySecond = await sessionStore.getHistory(testUser.id, testRoom.id);
            expect(historySecond.length).toBe(2);
        });
    });

    describe('4. CallbackEndpoint HTTP Integration', () => {
        it('updates placeholder in-place on chat_completed', async () => {
            const placeholderId = 'placeholder-msg-401';
            harness.mockModify.messages.set(placeholderId, {
                id: placeholderId,
                room: testRoom,
                text: '⏳ Processing question...',
            } as any);

            const endpoint = new CallbackEndpoint(harness.app);
            const res = await endpoint.post(
                {
                    method: RequestMethod.POST,
                    headers: {
                        authorization: 'Bearer valid-secret-token',
                        'content-type': 'application/json',
                    },
                    content: {
                        event: 'chat_completed',
                        request_id: 'req-401',
                        job_id: 'job-401',
                        user_id: testUser.id,
                        room_id: testRoom.id,
                        placeholder_id: placeholderId,
                        query: 'How to test callbacks?',
                        answer: 'With Vitest and mocked accessors.',
                        sources: [],
                    },
                } as any,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(200);
            const updated = harness.mockModify.messages.get(placeholderId);
            expect(updated?.text).toContain('With Vitest and mocked accessors.');
        });

        it('returns 200 on duplicate delivery and 409 on conflicting terminal delivery', async () => {
            const placeholderId = 'placeholder-msg-402';
            harness.mockModify.messages.set(placeholderId, {
                id: placeholderId,
                room: testRoom,
                text: '⏳ Processing...',
            } as any);

            const endpoint = new CallbackEndpoint(harness.app);
            const validPayload = {
                event: 'chat_completed',
                request_id: 'req-402',
                job_id: 'job-402',
                user_id: testUser.id,
                room_id: testRoom.id,
                placeholder_id: placeholderId,
                query: 'Check duplicate',
                answer: 'First delivery succeeded.',
            };

            // 1. First delivery -> 200
            const res1 = await endpoint.post(
                {
                    method: RequestMethod.POST,
                    headers: { authorization: 'Bearer valid-secret-token' },
                    content: validPayload,
                } as any,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );
            expect(res1.status).toBe(200);

            // 2. Duplicate delivery -> 200 with duplicate info
            const res2 = await endpoint.post(
                {
                    method: RequestMethod.POST,
                    headers: { authorization: 'Bearer valid-secret-token' },
                    content: validPayload,
                } as any,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );
            expect(res2.status).toBe(200);
            expect((res2.content as any)?.detail).toContain('duplicate');

            // 3. Conflicting failure event after terminal completion -> 409
            const res3 = await endpoint.post(
                {
                    method: RequestMethod.POST,
                    headers: { authorization: 'Bearer valid-secret-token' },
                    content: {
                        event: 'chat_failed',
                        request_id: 'req-402',
                        job_id: 'job-402',
                        user_id: testUser.id,
                        room_id: testRoom.id,
                        placeholder_id: placeholderId,
                        error: 'Late error arrival',
                    },
                } as any,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );
            expect(res3.status).toBe(409);
        });

        it('updates indexing placeholder in-place without creating orphan messages', async () => {
            const placeholderId = 'idx-placeholder-501';
            harness.mockModify.messages.set(placeholderId, {
                id: placeholderId,
                room: testRoom,
                text: '📄 _Đang đưa tệp `handbook.pdf` vào hàng đợi lập chỉ mục RAG..._',
            } as any);

            const initialMsgCount = harness.mockModify.messages.size;

            const endpoint = new CallbackEndpoint(harness.app);
            const res = await endpoint.post(
                {
                    method: RequestMethod.POST,
                    headers: { authorization: 'Bearer valid-secret-token' },
                    content: {
                        event: 'indexing_complete',
                        request_id: 'upload-req-501',
                        job_id: 'upload-job-501',
                        user_id: testUser.id,
                        room_id: testRoom.id,
                        placeholder_id: placeholderId,
                        document_name: 'handbook.pdf',
                        chunks_count: 35,
                    },
                } as any,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(200);
            // Verify no new message was created
            expect(harness.mockModify.messages.size).toBe(initialMsgCount);
            // Verify placeholder was updated
            const updated = harness.mockModify.messages.get(placeholderId);
            expect(updated?.text).toContain('handbook.pdf');
            expect(updated?.text).toContain('35 chunks');
        });
    });
});
