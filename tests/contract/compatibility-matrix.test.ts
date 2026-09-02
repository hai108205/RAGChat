import { describe, it, expect, beforeEach } from 'vitest';
import { BackendClient } from '../../src/lib/BackendClient';
import { MockHttp } from '../mocks/MockHttp';
import { MockRead } from '../mocks/MockRead';
import { createTestAppHarness, TestHarness } from '../mocks/TestAppHarness';
import { CallbackEndpoint } from '../../src/api/CallbackEndpoint';
import { RequestMethod } from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser, UserType } from '@rocket.chat/apps-engine/definition/users';
import type { IApiRequest } from '@rocket.chat/apps-engine/definition/api';

/**
 * Compatibility Matrix Test Suite
 *
 * Verifies the 7 Rocket.Chat Integration Endpoints and 4 Webhook Callback Events
 * against authentication, success/error envelopes, and tenant/room scoping.
 */
describe('Compatibility Matrix: SDK <-> Backend Integration Contract', () => {
    let mockHttp: MockHttp;
    let mockRead: MockRead;
    let client: BackendClient;
    const testToken = 'rc-compat-matrix-token-2026';
    const baseUrl = 'http://backend.internal:8000';

    beforeEach(() => {
        mockHttp = new MockHttp();
        mockRead = new MockRead();
        mockRead.setSetting('backend-url', baseUrl);
        mockRead.setSetting('integration-token', testToken);
        mockRead.setSetting('callback-base-url', 'http://rocketchat.internal:3000');
        client = new BackendClient(mockHttp, mockRead);
    });

    describe('1. Endpoint Matrix: All 7 Integration Endpoints', () => {
        interface EndpointContractCase {
            name: string;
            endpoint: string;
            method: string;
            invoke: (client: BackendClient) => Promise<unknown>;
            mockSuccessResponse: { statusCode: number; success: boolean; data: any; message: string };
            expectedUrlMatch: string;
            expectedMethod: string;
            assertResult: (result: any) => void;
            scopePayloadCheck: (request: { method: string; url: string; options?: any }) => void;
        }

        const endpointCases: EndpointContractCase[] = [
            {
                name: '1. POST /messages/async (handleAsyncMessage)',
                endpoint: '/api/v1/integrations/rocketchat/messages/async',
                method: 'POST',
                invoke: (c) => c.askAsync(
                    'What is RAG architecture?',
                    'user-matrix-1',
                    'room-matrix-1',
                    'thread-matrix-1',
                    'msg-placeholder-1',
                    [{ role: 'user', content: 'hello', timestamp: Date.now() }],
                    'req-async-001',
                    'ws-tenant-a',
                    'http://rocketchat.internal:3000/callback',
                ),
                mockSuccessResponse: {
                    statusCode: 202,
                    success: true,
                    data: { status: 'accepted', jobId: 'job-uuid-101', requestId: 'req-async-001' },
                    message: 'Message queued for processing',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/messages/async',
                expectedMethod: 'POST',
                assertResult: (res) => {
                    expect(res.status).toBe('accepted');
                    expect(res.job_id).toBe('job-uuid-101');
                    expect(res.request_id).toBe('req-async-001');
                },
                scopePayloadCheck: (req) => {
                    expect(req.options.data.workspaceId).toBe('ws-tenant-a');
                    expect(req.options.data.rocketUserId).toBe('user-matrix-1');
                    expect(req.options.data.roomId).toBe('room-matrix-1');
                    expect(req.options.data.threadId).toBe('thread-matrix-1');
                    expect(req.options.data.placeholderId).toBe('msg-placeholder-1');
                    expect(req.options.data.requestId).toBe('req-async-001');
                    expect(req.options.data.callbackUrl).toBe('http://rocketchat.internal:3000/callback');
                },
            },
            {
                name: '2. GET /stats (getStats)',
                endpoint: '/api/v1/integrations/rocketchat/stats',
                method: 'GET',
                invoke: (c) => c.listDocuments('ws-tenant-a', 'room-matrix-1'),
                mockSuccessResponse: {
                    statusCode: 200,
                    success: true,
                    data: {
                        documents: [
                            { id: 'doc-1', filename: 'arch.pdf', chunks_count: 10, created_at: '2026-09-01T00:00:00Z' },
                        ],
                        chats: [],
                        usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
                    },
                    message: 'Integration stats retrieved successfully',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/stats',
                expectedMethod: 'GET',
                assertResult: (res) => {
                    expect(Array.isArray(res)).toBe(true);
                    expect(res.length).toBe(1);
                    expect(res[0].filename).toBe('arch.pdf');
                    expect(res[0].chunks_count).toBe(10);
                },
                scopePayloadCheck: (req) => {
                    expect(req.url).toContain('workspaceId=ws-tenant-a');
                    expect(req.url).toContain('roomId=room-matrix-1');
                },
            },
            {
                name: '3. GET /sources (listSources)',
                endpoint: '/api/v1/integrations/rocketchat/sources',
                method: 'GET',
                invoke: (c) => c.listSources('ws-tenant-a', 'room-matrix-1'),
                mockSuccessResponse: {
                    statusCode: 200,
                    success: true,
                    data: {
                        sources: [
                            {
                                id: 'src-1',
                                filename: 'manual.md',
                                documentationUrl: 'rocketchat://ws-tenant-a/room-matrix-1/manual.md',
                                chunksCount: 8,
                                status: 'ACTIVE',
                                createdAt: '2026-09-01T00:00:00Z',
                            },
                        ],
                    },
                    message: 'Sources listed successfully',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/sources',
                expectedMethod: 'GET',
                assertResult: (res) => {
                    expect(Array.isArray(res)).toBe(true);
                    expect(res.length).toBe(1);
                    expect(res[0].id).toBe('src-1');
                    expect(res[0].status).toBe('ACTIVE');
                },
                scopePayloadCheck: (req) => {
                    expect(req.url).toContain('workspaceId=ws-tenant-a');
                    expect(req.url).toContain('roomId=room-matrix-1');
                },
            },
            {
                name: '4. DELETE /sources/:id (deleteSource)',
                endpoint: '/api/v1/integrations/rocketchat/sources/src-target-99',
                method: 'DELETE',
                invoke: (c) => c.deleteSource('src-target-99', 'ws-tenant-a', 'room-matrix-1'),
                mockSuccessResponse: {
                    statusCode: 200,
                    success: true,
                    data: { status: 'deleted', id: 'src-target-99' },
                    message: 'Source deleted successfully',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/sources/src-target-99',
                expectedMethod: 'DELETE',
                assertResult: (res) => {
                    expect(res).toBe(true);
                },
                scopePayloadCheck: (req) => {
                    expect(req.url).toContain('src-target-99');
                    expect(req.url).toContain('workspaceId=ws-tenant-a');
                    expect(req.url).toContain('roomId=room-matrix-1');
                },
            },
            {
                name: '5. POST /feedback (submitFeedback)',
                endpoint: '/api/v1/integrations/rocketchat/feedback',
                method: 'POST',
                invoke: (c) => c.submitFeedback({
                    workspaceId: 'ws-tenant-a',
                    rocketUserId: 'user-matrix-1',
                    roomId: 'room-matrix-1',
                    messageId: 'msg-feedback-1',
                    rating: 'positive',
                    feedbackText: 'Great explanation!',
                }),
                mockSuccessResponse: {
                    statusCode: 200,
                    success: true,
                    data: { status: 'saved' },
                    message: 'Feedback recorded successfully',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/feedback',
                expectedMethod: 'POST',
                assertResult: (res) => {
                    expect(res).toBe(true);
                },
                scopePayloadCheck: (req) => {
                    expect(req.options.data.workspaceId).toBe('ws-tenant-a');
                    expect(req.options.data.rocketUserId).toBe('user-matrix-1');
                    expect(req.options.data.roomId).toBe('room-matrix-1');
                    expect(req.options.data.rating).toBe('positive');
                },
            },
            {
                name: '6. POST /sources/base64 (handleBase64Source)',
                endpoint: '/api/v1/integrations/rocketchat/sources/base64',
                method: 'POST',
                invoke: (c) => c.uploadBase64({
                    workspaceId: 'ws-tenant-a',
                    rocketUserId: 'user-matrix-1',
                    roomId: 'room-matrix-1',
                    threadId: 'thread-matrix-1',
                    filename: 'handbook.pdf',
                    contentBase64: 'JVBERi0xLjQK...',
                    mimeType: 'application/pdf',
                    requestId: 'req-upload-999',
                    callbackUrl: 'http://rocketchat.internal:3000/callback',
                }),
                mockSuccessResponse: {
                    statusCode: 202,
                    success: true,
                    data: { status: 'accepted', sourceId: 'src-new-88', requestId: 'req-upload-999' },
                    message: 'Source queued for ingestion',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/sources/base64',
                expectedMethod: 'POST',
                assertResult: (res) => {
                    expect(res.status).toBe('accepted');
                    expect(res.requestId).toBe('req-upload-999');
                },
                scopePayloadCheck: (req) => {
                    expect(req.options.data.workspaceId).toBe('ws-tenant-a');
                    expect(req.options.data.rocketUserId).toBe('user-matrix-1');
                    expect(req.options.data.roomId).toBe('room-matrix-1');
                    expect(req.options.data.filename).toBe('handbook.pdf');
                },
            },
            {
                name: '7. POST /utilities/completion (handleUtilityCompletion)',
                endpoint: '/api/v1/integrations/rocketchat/utilities/completion',
                method: 'POST',
                invoke: (c) => c.summarize('Long document text to summarize...', 'req-sum-1', { workspaceId: 'ws-tenant-a' }),
                mockSuccessResponse: {
                    statusCode: 200,
                    success: true,
                    data: { result: 'Summarized text content' },
                    message: 'Operation completed successfully',
                },
                expectedUrlMatch: '/api/v1/integrations/rocketchat/utilities/completion',
                expectedMethod: 'POST',
                assertResult: (res) => {
                    expect(res).toBe('Summarized text content');
                },
                scopePayloadCheck: (req) => {
                    expect(req.options.data.operation).toBe('summarize');
                    expect(req.options.data.text).toBe('Long document text to summarize...');
                },
            },
        ];

        for (const testCase of endpointCases) {
            describe(testCase.name, () => {
                it('executes successfully and unboxes standard response envelope', async () => {
                    mockHttp.registerMockResponse({
                        url: testCase.endpoint,
                        method: testCase.method,
                        statusCode: testCase.mockSuccessResponse.statusCode,
                        data: testCase.mockSuccessResponse,
                    });

                    const result = await testCase.invoke(client);
                    testCase.assertResult(result);

                    const recorded = mockHttp.getRecordedRequests();
                    expect(recorded.length).toBe(1);
                    expect(recorded[0].url).toContain(testCase.expectedUrlMatch);
                    expect(recorded[0].method.toUpperCase()).toBe(testCase.expectedMethod.toUpperCase());
                    expect(recorded[0].options?.headers?.Authorization || recorded[0].options?.headers?.authorization).toBe(`Bearer ${testToken}`);

                    testCase.scopePayloadCheck(recorded[0]);
                });

                it('attaches proper Bearer authorization header', async () => {
                    mockHttp.registerMockResponse({
                        url: testCase.endpoint,
                        method: testCase.method,
                        statusCode: testCase.mockSuccessResponse.statusCode,
                        data: testCase.mockSuccessResponse,
                    });

                    await testCase.invoke(client);
                    const recorded = mockHttp.getRecordedRequests()[0];
                    const authHeader = recorded.options?.headers?.Authorization || recorded.options?.headers?.authorization;
                    expect(authHeader).toBe(`Bearer ${testToken}`);
                });

                it('handles 401 Unauthorized error envelope from backend', async () => {
                    mockHttp.registerMockResponse({
                        url: testCase.endpoint,
                        method: testCase.method,
                        statusCode: 401,
                        data: {
                            statusCode: 401,
                            success: false,
                            message: 'Unauthorized integration token',
                            errors: ['Token mismatch or missing in production mode'],
                        },
                    });

                    await expect(testCase.invoke(client)).rejects.toThrow();
                });

                it('handles 400 Bad Request error envelope with validation errors', async () => {
                    mockHttp.registerMockResponse({
                        url: testCase.endpoint,
                        method: testCase.method,
                        statusCode: 400,
                        data: {
                            statusCode: 400,
                            success: false,
                            message: 'Validation failed',
                            errors: ['Invalid scope parameters'],
                        },
                    });

                    await expect(testCase.invoke(client)).rejects.toThrow();
                });
            });
        }
    });

    describe('2. Webhook Callback Event Shapes Matrix', () => {
        let harness: TestHarness;
        let endpoint: CallbackEndpoint;
        let testUser: IUser;
        let testRoom: any;

        beforeEach(() => {
            harness = createTestAppHarness();
            harness.mockRead.setSetting('backend-url', baseUrl);
            harness.mockRead.setSetting('integration-token', testToken);
            harness.mockRead.setSetting('callback-base-url', 'http://rocketchat.internal:3000');
            endpoint = new CallbackEndpoint(harness.app);

            testUser = {
                id: 'user-cb-1',
                username: 'sam.developer',
                name: 'Sam Developer',
                roles: ['user'],
                type: UserType.USER,
            } as IUser;
            harness.mockRead.setUser(testUser.id, testUser);

            testRoom = {
                id: 'room-cb-1',
                displayName: 'AI Discussions',
                slugifiedName: 'ai-discussions',
                type: RoomType.CHANNEL,
                creator: testUser,
            };
            harness.mockRead.setRoom(testRoom.id, testRoom);
        });

        const callbackCases = [
            {
                event: 'chat_completed',
                name: '1. chat_completed (success RAG answer with citations)',
                payload: {
                    event: 'chat_completed',
                    request_id: 'req-cb-001',
                    job_id: 'job-cb-001',
                    user_id: 'user-cb-1',
                    room_id: 'room-cb-1',
                    placeholder_id: 'placeholder-msg-001',
                    query: 'Explain vector indexing',
                    answer: 'Vector indexing organizes embeddings using HNSW graphs for fast cosine similarity retrieval.',
                    sources: [
                        { title: 'Vector Indexing Guide', snippet: 'HNSW provides high recall at scale.', relevance: 0.94, pageUrl: 'https://docs.rag.chat/hnsw' },
                    ],
                    model: 'api-ai.box/deepseek-v4-flash',
                },
                setup: () => {
                    harness.mockModify.messages.set('placeholder-msg-001', {
                        id: 'placeholder-msg-001',
                        room: testRoom,
                        text: '⏳ Processing...',
                    } as any);
                },
                assertOutcome: () => {
                    const msg = harness.mockModify.messages.get('placeholder-msg-001');
                    expect(msg).toBeDefined();
                    expect(msg?.text).toContain('Vector indexing organizes embeddings');
                    expect((msg?.attachments?.length ?? 0) + (msg?.blocks?.length ?? 0)).toBeGreaterThanOrEqual(1);
                },
            },
            {
                event: 'chat_failed',
                name: '2. chat_failed (error response updating placeholder)',
                payload: {
                    event: 'chat_failed',
                    request_id: 'req-cb-002',
                    user_id: 'user-cb-1',
                    room_id: 'room-cb-1',
                    placeholder_id: 'placeholder-msg-002',
                    query: 'Trigger failure',
                    error: 'LLM context window exceeded',
                },
                setup: () => {
                    harness.mockModify.messages.set('placeholder-msg-002', {
                        id: 'placeholder-msg-002',
                        room: testRoom,
                        text: '⏳ Processing...',
                    } as any);
                },
                assertOutcome: () => {
                    const msg = harness.mockModify.messages.get('placeholder-msg-002');
                    expect(msg).toBeDefined();
                    expect(msg?.text).toContain('LLM context window exceeded');
                },
            },
            {
                event: 'indexing_complete',
                name: '3. indexing_complete (file uploaded and embedded into vector DB)',
                payload: {
                    event: 'indexing_complete',
                    request_id: 'req-cb-003',
                    source_id: 'src-uploaded-1',
                    user_id: 'user-cb-1',
                    room_id: 'room-cb-1',
                    document_name: 'architecture_diagram.pdf',
                    chunks_count: 24,
                },
                setup: () => {},
                assertOutcome: () => {
                    const messages = Array.from(harness.mockModify.messages.values());
                    const notif = messages.find((m) => m.text?.includes('architecture_diagram.pdf') && m.text?.includes('24 chunks'));
                    expect(notif).toBeDefined();
                },
            },
            {
                event: 'indexing_failed',
                name: '4. indexing_failed (file upload parsing error)',
                payload: {
                    event: 'indexing_failed',
                    request_id: 'req-cb-004',
                    user_id: 'user-cb-1',
                    room_id: 'room-cb-1',
                    document_name: 'corrupted_file.pdf',
                    error: 'Unsupported or password-protected PDF document',
                },
                setup: () => {},
                assertOutcome: () => {
                    const messages = Array.from(harness.mockModify.messages.values());
                    const notif = messages.find((m) => m.text?.includes('corrupted_file.pdf') && m.text?.includes('password-protected'));
                    expect(notif).toBeDefined();
                },
            },
        ];

        for (const cbCase of callbackCases) {
            it(cbCase.name, async () => {
                cbCase.setup();

                const request: IApiRequest = {
                    method: RequestMethod.POST,
                    headers: {
                        authorization: `Bearer ${testToken}`,
                        'content-type': 'application/json',
                    },
                    content: cbCase.payload,
                    query: {},
                    params: {},
                };

                const res = await endpoint.post(
                    request,
                    {} as any,
                    harness.mockRead,
                    harness.mockModify,
                    harness.mockHttp,
                    harness.mockPersistence,
                );

                expect(res.status).toBe(200);
                cbCase.assertOutcome();
            });
        }

        it('rejects callback with 401 when Authorization Bearer token is mismatched', async () => {
            const request: IApiRequest = {
                method: RequestMethod.POST,
                headers: {
                    authorization: 'Bearer wrong-secret-token',
                },
                content: {
                    event: 'chat_completed',
                    user_id: 'user-cb-1',
                    room_id: 'room-cb-1',
                },
                query: {},
                params: {},
            };

            const res = await endpoint.post(
                request,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(401);
        });

        it('rejects callback with 400 when mandatory fields are missing', async () => {
            const request: IApiRequest = {
                method: RequestMethod.POST,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
                content: {
                    event: 'chat_completed',
                    // missing user_id and room_id
                },
                query: {},
                params: {},
            };

            const res = await endpoint.post(
                request,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(400);
        });
    });
});
