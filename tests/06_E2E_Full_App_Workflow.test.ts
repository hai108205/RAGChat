import { describe, it, expect, beforeEach } from "vitest";
import { createTestAppHarness, TestHarness } from "./mocks/TestAppHarness";
import { RagChatApp } from "../RagChatApp";
import { CallbackEndpoint } from "../src/api/CallbackEndpoint";
import { RoomType } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser, UserType } from "@rocket.chat/apps-engine/definition/users";
import { IMessage } from "@rocket.chat/apps-engine/definition/messages";
import { IApiRequest } from "@rocket.chat/apps-engine/definition/api";
import { ActionButtonActionId } from "../src/uikit";

describe("E2E Test Suite 6: Full App Integration & Multi-step Lifecycles", () => {
    let harness: TestHarness;
    let app: RagChatApp;
    let testUser: IUser;
    let channelRoom: any;

    beforeEach(() => {
        harness = createTestAppHarness();
        harness.mockRead.setSetting("backend-url", "http://backend.internal:3000");
        harness.mockRead.setSetting("integration-token", "valid-secret-token");
        harness.mockRead.setSetting("callback-base-url", "http://rocketchat.internal:3000");

        testUser = {
            id: "user-e2e-1",
            username: "alex.engineer",
            name: "Alex Engineer",
            roles: ["user"],
            type: UserType.USER,
        } as IUser;

        channelRoom = {
            id: "room-channel-1",
            displayName: "Dev Team",
            type: RoomType.CHANNEL,
        };

        harness.mockRead.setUser(testUser.id, testUser);
        harness.mockRead.setRoom(channelRoom.id, channelRoom);

        app = harness.app;
    });

    describe("1. App Lifecycle & Validation E2E", () => {
        it("onEnable fails if backend-url is missing", async () => {
            harness.mockRead.setSetting("backend-url", "");
            const enabled = await app.onEnable(harness.mockRead.getEnvironmentReader(), {} as any);
            expect(enabled).toBe(false);
        });

        it("onEnable fails if integration-token is missing in production", async () => {
            harness.mockRead.setSetting("integration-token", "");
            harness.mockRead.setSetting("api-key", "");
            harness.mockRead.setSetting("allow-unauthenticated-callbacks-dev", false);

            const enabled = await app.onEnable(harness.mockRead.getEnvironmentReader(), {} as any);
            expect(enabled).toBe(false);
        });

        it("onEnable fails if callback-base-url is invalid", async () => {
            harness.mockRead.setSetting("callback-base-url", "not-a-valid-url");
            const enabled = await app.onEnable(harness.mockRead.getEnvironmentReader(), {} as any);
            expect(enabled).toBe(false);
        });

        it("onEnable succeeds when all configuration settings are valid", async () => {
            const enabled = await app.onEnable(harness.mockRead.getEnvironmentReader(), {} as any);
            expect(enabled).toBe(true);
        });

        it("onDisable and onUninstall hooks complete without throwing", async () => {
            await expect(app.onDisable({} as any)).resolves.not.toThrow();
            await expect(
                app.onUninstall(
                    {} as any,
                    harness.mockRead,
                    harness.mockHttp,
                    harness.mockPersistence,
                    harness.mockModify,
                ),
            ).resolves.not.toThrow();
        });
    });

    describe("2. Complete RAG Q&A Workflow (Mention -> Backend -> Webhook -> Feedback -> Regenerate)", () => {
        it("executes the full cycle seamlessly", async () => {
            // Step 1: Mock Backend 202 Accepted on POST /messages/async
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/messages/async",
                method: "post",
                statusCode: 202,
                data: {
                    status: "accepted",
                    job_id: "bullmq-rag-99",
                    request_id: "req-flow-1",
                },
            });

            const incomingMessage: IMessage = {
                id: "msg-user-flow-1",
                sender: testUser,
                room: channelRoom,
                text: "@ragchat.bot How is authentication implemented in this system?",
            };

            // Step 2: App receives message mention
            const shouldProcess = await app.checkPostMessageSent(incomingMessage, harness.mockRead, harness.mockHttp);
            expect(shouldProcess).toBe(true);

            await app.executePostMessageSent(
                incomingMessage,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            // Verify placeholder message was created
            const messagesAfterAsk = Array.from(harness.mockModify.messages.values());
            expect(messagesAfterAsk.length).toBeGreaterThanOrEqual(1);
            const placeholder = messagesAfterAsk[0];
            const placeholderId = placeholder.id!;
            expect(placeholder.text).toContain("Đang tra cứu tài liệu");

            // Verify outgoing request carries correlation details and callbackUrl
            const outgoingRequests = harness.mockHttp.getRecordedRequests();
            const asyncRequest = outgoingRequests.find((r) => r.url.includes("/messages/async"));
            expect(asyncRequest).toBeDefined();
            expect(asyncRequest?.options?.data?.query).toBe("How is authentication implemented in this system?");
            expect(asyncRequest?.options?.data?.callbackUrl).toContain("/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback");

            // Step 3: Backend Worker finishes processing and invokes Public Callback Webhook
            const endpoint = new CallbackEndpoint(app);
            const webhookRequest: IApiRequest = {
                method: "post",
                headers: {
                    authorization: "Bearer valid-secret-token",
                    "content-type": "application/json",
                },
                content: {
                    event: "chat_completed",
                    request_id: "req-flow-1",
                    placeholder_id: placeholderId,
                    room_id: channelRoom.id,
                    user_id: testUser.id,
                    answer: "Authentication uses standard Bearer tokens via Express middleware.",
                    sources: [
                        { title: "Auth Middleware", snippet: "Verifies HMAC bearer token", relevance: 0.96 },
                    ],
                },
                query: {},
                params: {},
            };

            const callbackResponse = await endpoint.post(
                webhookRequest,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(callbackResponse.status).toBe(200);

            // Verify the placeholder was updated with final answer and action buttons
            const updatedPlaceholder = harness.mockModify.messages.get(placeholderId);
            expect(updatedPlaceholder?.text).toContain("Authentication uses standard Bearer tokens");
            expect(updatedPlaceholder?.attachments?.length).toBeGreaterThanOrEqual(1);

            // Step 4: User clicks 👍 (Thumbs Up Feedback)
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/feedback",
                method: "post",
                statusCode: 200,
                data: { success: true },
            });

            const thumbsUpCtx = {
                getInteractionData: () => ({
                    actionId: ActionButtonActionId.FEEDBACK_POSITIVE,
                    value: JSON.stringify({ messageId: placeholderId, chatMessageId: "chat-msg-99", rating: "positive" }),
                    user: testUser,
                    room: channelRoom,
                    message: updatedPlaceholder,
                    triggerId: "trig-flow-fb",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ success: true }),
                    errorResponse: () => ({ success: false }),
                }),
            };

            const fbResponse = await app.executeBlockActionHandler(
                thumbsUpCtx as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            expect(fbResponse.success).toBe(true);
            const feedbackReq = harness.mockHttp.getRecordedRequests().find((r) => r.url.includes("/feedback"));
            expect(feedbackReq).toBeDefined();
            expect(feedbackReq?.options?.data?.rating).toBe("positive");
        });
    });

    describe("3. Complete File Upload & Webhook Indexing Flow", () => {
        it("handles file upload intercept, base64 forwarding, and indexing_complete callback", async () => {
            // Step 1: Mock Backend list sources (no duplicate) and POST /sources/base64
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/sources",
                method: "get",
                statusCode: 200,
                data: { sources: [] },
            });

            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/sources/base64",
                method: "post",
                statusCode: 202,
                data: { status: "accepted", sourceId: "src-doc-101", jobId: "upload-job-101" },
            });

            const fileContent = Buffer.from("Kubernetes Architecture Guide");
            harness.mockRead.setUploadBuffer("upload-file-101", fileContent);

            const uploadContext = {
                file: {
                    id: "upload-file-101",
                    name: "k8s_guide.pdf",
                    type: "application/pdf",
                    size: fileContent.length,
                    rid: channelRoom.id,
                    userId: testUser.id,
                },
                content: fileContent,
            };

            // Step 2: Execute file upload hook
            await app.executePreFileUpload(
                uploadContext as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            const uploadRequests = harness.mockHttp.getRecordedRequests().filter((r) => r.url.includes("/sources/base64"));
            expect(uploadRequests.length).toBe(1);
            expect(uploadRequests[0].options?.data?.filename).toBe("k8s_guide.pdf");

            // Step 3: Backend Worker notifies completion via Webhook
            const endpoint = new CallbackEndpoint(app);
            const webhookRequest: IApiRequest = {
                method: "post",
                headers: {
                    authorization: "Bearer valid-secret-token",
                    "content-type": "application/json",
                },
                content: {
                    event: "indexing_complete",
                    source_id: "src-doc-101",
                    filename: "k8s_guide.pdf",
                    chunks_count: 18,
                    room_id: channelRoom.id,
                    user_id: testUser.id,
                },
                query: {},
                params: {},
            };

            const callbackResponse = await endpoint.post(
                webhookRequest,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(callbackResponse.status).toBe(200);

            // Verify room notification of indexed file
            const messages = Array.from(harness.mockModify.messages.values());
            const indexNotification = messages.find((m) => m.text?.includes("k8s_guide.pdf") && m.text?.includes("18 chunks"));
            expect(indexNotification).toBeDefined();
        });
    });

    describe("4. Webhook Security and Error Handling", () => {
        it("rejects unauthorized webhook callback with 401", async () => {
            const endpoint = new CallbackEndpoint(app);
            const unauthorizedRequest: IApiRequest = {
                method: "post",
                headers: {
                    authorization: "Bearer invalid-token",
                },
                content: {
                    event: "chat_completed",
                    answer: "Test",
                },
                query: {},
                params: {},
            };

            const res = await endpoint.post(
                unauthorizedRequest,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(401);
        });

        it("rejects malformed callback payload with 400", async () => {
            const endpoint = new CallbackEndpoint(app);
            const badRequest: IApiRequest = {
                method: "post",
                headers: {
                    authorization: "Bearer valid-secret-token",
                },
                content: null as any,
                query: {},
                params: {},
            };

            const res = await endpoint.post(
                badRequest,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(400);
        });

        it("handles chat_failed callback by updating message with error", async () => {
            const placeholderId = "placeholder-fail-1";
            harness.mockModify.messages.set(placeholderId, {
                id: placeholderId,
                room: channelRoom,
                text: "⏳ Loading...",
            } as any);

            const endpoint = new CallbackEndpoint(app);
            const failRequest: IApiRequest = {
                method: "post",
                headers: {
                    authorization: "Bearer valid-secret-token",
                },
                content: {
                    event: "chat_failed",
                    placeholder_id: placeholderId,
                    room_id: channelRoom.id,
                    user_id: testUser.id,
                    error: "Rate limit exceeded on LLM provider.",
                },
                query: {},
                params: {},
            };

            const res = await endpoint.post(
                failRequest,
                {} as any,
                harness.mockRead,
                harness.mockModify,
                harness.mockHttp,
                harness.mockPersistence,
            );

            expect(res.status).toBe(200);
            const updated = harness.mockModify.messages.get(placeholderId);
            expect(updated?.text).toContain("Rate limit exceeded on LLM provider");
        });
    });
});
