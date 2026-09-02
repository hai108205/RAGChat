import { describe, it, expect, beforeEach } from "vitest";
import { createTestAppHarness, TestHarness } from "./mocks/TestAppHarness";
import { AskCommand } from "../src/commands/AskCommand";
import { SearchCommand } from "../src/commands/SearchCommand";
import { SummarizeCommand } from "../src/commands/SummarizeCommand";
import { ExplainCommand } from "../src/commands/ExplainCommand";
import { TranslateCommand } from "../src/commands/TranslateCommand";
import { RagCommand } from "../src/commands/RagCommand";
import { BotMessageHandler } from "../src/handlers/BotMessageHandler";
import { MentionHandler } from "../src/handlers/MentionHandler";
import { FileUploadHandler } from "../src/handlers/FileUploadHandler";
import { BlockActionHandler } from "../src/handlers/BlockActionHandler";
import { ViewSubmitHandler } from "../src/handlers/ViewSubmitHandler";
import { ActionButtonHandler } from "../src/handlers/ActionButtonHandler";
import { SlashCommandContext } from "@rocket.chat/apps-engine/definition/slashcommands";
import { RoomType } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser, UserType } from "@rocket.chat/apps-engine/definition/users";
import { IMessage } from "@rocket.chat/apps-engine/definition/messages";
import { IUIKitResponse } from "@rocket.chat/apps-engine/definition/uikit";
import { BUTTON_ACTIONS } from "../src/uikit";

describe("E2E Test Suite 4: All Slash Commands & Interaction Handlers", () => {
    let harness: TestHarness;
    let testUser: IUser;
    let channelRoom: any;
    let dmRoom: any;

    beforeEach(() => {
        harness = createTestAppHarness();
        harness.mockRead.setSetting("backend-url", "http://localhost:3000");
        harness.mockRead.setSetting("integration-token", "test-token");
        harness.mockRead.setSetting("callback-base-url", "http://rocketchat.internal");

        testUser = {
            id: "test-user-id",
            username: "test.user",
            name: "Test User",
            roles: ["user"],
            type: UserType.USER,
        } as IUser;

        channelRoom = {
            id: "test-room-id",
            displayName: "General",
            type: RoomType.CHANNEL,
        };

        dmRoom = {
            id: "test-dm-room-id",
            displayName: "DM",
            type: RoomType.DIRECT_MESSAGE,
        };
    });

    describe("1. Slash Commands E2E", () => {
        it("/ask executes async job enqueue with placeholder and callbackUrl", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/messages/async",
                method: "post",
                statusCode: 202,
                data: { status: "accepted", job_id: "bullmq-ask-101" },
            });

            const askCmd = new AskCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["What", "is", "RAG?"]);

            await askCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            // Verify placeholder message was created in the room
            const messages = Array.from(harness.mockModify.messages.values());
            expect(messages.length).toBeGreaterThanOrEqual(1);
            const placeholder = messages.find((m) => m.text?.includes("Đang tra cứu tài liệu"));
            expect(placeholder).toBeDefined();

            // Verify backend HTTP request was sent with proper payload
            const recorded = harness.mockHttp.getRecordedRequests();
            const asyncReq = recorded.find((r) => r.url.includes("/messages/async"));
            expect(asyncReq).toBeDefined();
            expect(asyncReq?.options?.data?.query).toBe("What is RAG?");
            expect(asyncReq?.options?.data?.callbackUrl).toContain("/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback");
        });

        it("/ask rejects empty questions and sends usage warning", async () => {
            const askCmd = new AskCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, []);

            await askCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            expect(messages.length).toBe(1);
            expect(messages[0].text).toContain("/ask");
        });

        it("/search queries backend utility and returns formatted search results", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: {
                    results: [
                        { title: "Architecture Guide", snippet: "System uses RAG pipeline", relevance: 0.94 },
                        { title: "Deployment Guide", snippet: "Deploy with Docker Compose", relevance: 0.88 },
                    ],
                },
            });

            const searchCmd = new SearchCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["architecture"]);

            await searchCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            const searchMsg = messages.find((m) => m.text?.includes("Search results"));
            expect(searchMsg).toBeDefined();
            expect(searchMsg?.text).toContain("architecture");
        });

        it("/summarize sends text to backend and outputs summary", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { summary: "This is the summarized output." },
            });

            const summarizeCmd = new SummarizeCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["Long", "meeting", "notes", "here"]);

            await summarizeCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            const sumMsg = messages.find((m) => m.text?.includes("Summary"));
            expect(sumMsg).toBeDefined();
            expect(sumMsg?.text).toContain("This is the summarized output.");
        });

        it("/explain sends concept to backend and outputs explanation", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { explanation: "Vector embeddings represent text as numbers." },
            });

            const explainCmd = new ExplainCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["Vector", "Embeddings"]);

            await explainCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            const expMsg = messages.find((m) => m.text?.includes("Vector Embeddings"));
            expect(expMsg).toBeDefined();
            expect(expMsg?.text).toContain("Vector embeddings represent text as numbers.");
        });

        it("/translate sends text and target language to backend and outputs translation", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { translation: "Xin chào thế giới" },
            });

            const translateCmd = new TranslateCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["vi", "Hello", "world"]);

            await translateCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            const transMsg = messages.find((m) => m.text?.includes("Vietnamese"));
            expect(transMsg).toBeDefined();
            expect(transMsg?.text).toContain("Xin chào thế giới");
        });

        it("/rag docs renders document list with UIKit blocks", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/sources",
                method: "get",
                statusCode: 200,
                data: {
                    sources: [
                        { id: "doc-1", filename: "user_manual.pdf", status: "READY", chunksCount: 15 },
                        { id: "doc-2", filename: "faq.txt", status: "READY", chunksCount: 4 },
                    ],
                },
            });

            const ragCmd = new RagCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["docs"]);

            await ragCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            const docMsg = messages.find((m) => m.text?.includes("Knowledge Base"));
            expect(docMsg).toBeDefined();
            expect(docMsg?.text).toContain("2 tài liệu");
        });

        it("/rag help outputs comprehensive command guidebook", async () => {
            const ragCmd = new RagCommand(harness.mockLogger);
            const ctx = new SlashCommandContext(testUser, channelRoom, ["help"]);

            await ragCmd.executor(ctx, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

            const messages = Array.from(harness.mockModify.messages.values());
            const helpMsg = messages.find((m) => m.text?.includes("Hướng dẫn các lệnh RAG"));
            expect(helpMsg).toBeDefined();
            expect(helpMsg?.text).toContain("/rag docs");
            expect(helpMsg?.text).toContain("/rag prune");
        });
    });

    describe("2. Interaction Handlers E2E", () => {
        it("BotMessageHandler handles direct message and dispatches async chat", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/messages/async",
                method: "post",
                statusCode: 202,
                data: { status: "accepted", job_id: "dm-job-1" },
            });

            const handler = new BotMessageHandler(harness.mockLogger);
            const message: IMessage = {
                id: "dm-msg-1",
                sender: testUser,
                room: dmRoom,
                text: "Can you explain the system architecture?",
            };

            await handler.executePostMessageSentToBot(message, harness.mockRead, harness.mockHttp, harness.mockPersistence, harness.mockModify);

            const recorded = harness.mockHttp.getRecordedRequests();
            const asyncReq = recorded.find((r) => r.url.includes("/messages/async"));
            expect(asyncReq).toBeDefined();
            expect(asyncReq?.options?.data?.query).toBe("Can you explain the system architecture?");
        });

        it("BotMessageHandler executes subcommands like @ai help and @ai clear in DM", async () => {
            const handler = new BotMessageHandler(harness.mockLogger);
            const message: IMessage = {
                id: "dm-subcmd-1",
                sender: testUser,
                room: dmRoom,
                text: "@ai help",
            };

            await handler.executePostMessageSentToBot(message, harness.mockRead, harness.mockHttp, harness.mockPersistence, harness.mockModify);

            const messages = Array.from(harness.mockModify.messages.values());
            expect(messages.some((m) => m.text?.includes("RAGChat") || m.text?.includes("Trợ lý AI"))).toBe(true);
        });

        it("MentionHandler handles bot mention in channel and dispatches query", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/messages/async",
                method: "post",
                statusCode: 202,
                data: { status: "accepted", job_id: "mention-job-1" },
            });

            const handler = new MentionHandler(harness.mockLogger);
            const message: IMessage = {
                id: "mention-msg-1",
                sender: testUser,
                room: channelRoom,
                text: "@ragchat.bot how do we setup Qdrant?",
            };

            const shouldRun = await handler.checkPostMessageSent(message, harness.mockRead, harness.mockHttp);
            expect(shouldRun).toBe(true);

            await handler.executePostMessageSent(message, harness.mockRead, harness.mockHttp, harness.mockPersistence, harness.mockModify);

            const recorded = harness.mockHttp.getRecordedRequests();
            const asyncReq = recorded.find((r) => r.url.includes("/messages/async"));
            expect(asyncReq).toBeDefined();
            expect(asyncReq?.options?.data?.query).toBe("how do we setup Qdrant?");
        });

        it("FileUploadHandler processes valid document and posts base64 payload to backend", async () => {
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
                data: { status: "accepted", sourceId: "src-upload-1", jobId: "upload-job-1" },
            });

            const fileBuffer = Buffer.from("Sample PDF Content");
            harness.mockRead.setUploadBuffer("upload-1", fileBuffer);

            const handler = new FileUploadHandler(harness.mockLogger);
            const uploadContext = {
                file: {
                    id: "upload-1",
                    name: "sample.pdf",
                    type: "application/pdf",
                    size: 1024,
                    rid: "test-room-id",
                    userId: "test-user-id",
                },
                content: fileBuffer,
            };

            await handler.executePreFileUpload(uploadContext as any, harness.mockRead, harness.mockHttp, harness.mockPersistence, harness.mockModify);

            const recorded = harness.mockHttp.getRecordedRequests();
            const uploadReq = recorded.find((r) => r.url.includes("/sources/base64"));
            expect(uploadReq).toBeDefined();
            expect(uploadReq?.options?.data?.filename).toBe("sample.pdf");
        });

        it("BlockActionHandler handles feedback thumbs up click and submits feedback", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/feedback",
                method: "post",
                statusCode: 200,
                data: { success: true },
            });

            const handler = new BlockActionHandler(harness.mockLogger);
            const blockCtx = {
                getInteractionData: () => ({
                    actionId: "feedback:positive",
                    value: JSON.stringify({ messageId: "msg-123", chatMessageId: "cm-456", rating: "positive" }),
                    user: testUser,
                    room: channelRoom,
                    message: { id: "msg-123", room: channelRoom },
                    triggerId: "trig-1",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ success: true }),
                    errorResponse: () => ({ success: false }),
                }),
            };

            const res = await handler.handleBlockAction(
                blockCtx as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            expect(res.success).toBe(true);
            const recorded = harness.mockHttp.getRecordedRequests();
            const fbReq = recorded.find((r) => r.url.includes("/feedback"));
            expect(fbReq).toBeDefined();
            expect(fbReq?.options?.data?.rating).toBe("positive");
        });

        it("BlockActionHandler handles regenerate click and re-enqueues query", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/messages/async",
                method: "post",
                statusCode: 202,
                data: { status: "accepted", job_id: "regen-job-1" },
            });

            const handler = new BlockActionHandler(harness.mockLogger);
            const blockCtx = {
                getInteractionData: () => ({
                    actionId: "action:regenerate",
                    value: JSON.stringify({ query: "Explain Embeddings", messageId: "msg-old-1" }),
                    user: testUser,
                    room: channelRoom,
                    message: { id: "msg-old-1", room: channelRoom },
                    triggerId: "trig-2",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ success: true }),
                    errorResponse: () => ({ success: false }),
                }),
            };

            const res = await handler.handleBlockAction(
                blockCtx as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            expect(res.success).toBe(true);
            const recorded = harness.mockHttp.getRecordedRequests();
            const regenReq = recorded.find((r) => r.url.includes("/messages/async"));
            expect(regenReq).toBeDefined();
            expect(regenReq?.options?.data?.query).toBe("Explain Embeddings");
        });

        it("BlockActionHandler opens confirm delete modal on delete button click", async () => {
            const handler = new BlockActionHandler(harness.mockLogger);
            const blockCtx = {
                getInteractionData: () => ({
                    actionId: "delete_source",
                    value: JSON.stringify({ sourceId: "src-del-99", filename: "secrets.pdf", roomId: "test-room-id" }),
                    user: testUser,
                    room: channelRoom,
                    message: { id: "msg-list-1", room: channelRoom },
                    triggerId: "trig-modal-1",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ success: true }),
                    openModalViewResponse: (view: any) => {
                        harness.mockModify.openedModals.push({ view, context: {} as any, user: testUser });
                        return { success: true };
                    },
                }),
            };

            const res = await handler.handleBlockAction(
                blockCtx as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            expect(res.success).toBe(true);
            expect(harness.mockModify.openedModals.length).toBe(1);
            expect(harness.mockModify.openedModals[0].view.title.text).toContain("Xoá");
        });

        it("ViewSubmitHandler executes source deletion on modal submission", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/sources/src-del-99",
                method: "delete",
                statusCode: 200,
                data: { success: true },
            });

            const handler = new ViewSubmitHandler(harness.mockLogger);
            const viewSubmitCtx = {
                getInteractionData: () => ({
                    view: {
                        id: "confirm-delete:src-del-99",
                        state: {
                            roomId: "test-room-id",
                            filename: "document.pdf",
                        },
                    },
                    user: testUser,
                    room: channelRoom,
                    triggerId: "trig-submit-1",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ success: true }),
                    errorResponse: () => ({ success: false }),
                }),
            };

            const res = await handler.handleViewSubmit(
                viewSubmitCtx as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            expect(res.success).toBe(true);
        });

        it("ActionButtonHandler processes message context menu action_summarize", async () => {
            harness.mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { summary: "Summarized message content." },
            });

            const targetMessage: IMessage = {
                id: "target-msg-sum-1",
                sender: testUser,
                room: channelRoom,
                text: "Here is a lengthy message that needs quick summarization for team members.",
            };
            harness.mockRead.setMessage("target-msg-sum-1", targetMessage);

            const handler = new ActionButtonHandler(harness.mockLogger);
            const actionBtnCtx = {
                getInteractionData: () => ({
                    actionId: "action-summarize-thread",
                    user: testUser,
                    room: channelRoom,
                    message: targetMessage,
                    triggerId: "trig-btn-1",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ success: true }),
                    errorResponse: () => ({ success: false }),
                }),
            };

            const res = await handler.handleActionButton(
                actionBtnCtx as any,
                harness.mockRead,
                harness.mockHttp,
                harness.mockPersistence,
                harness.mockModify,
            );

            expect(res.success).toBe(true);
            const messages = Array.from(harness.mockModify.messages.values());
            const sumMsg = messages.find((m) => m.text?.includes("Tóm tắt") || m.text?.includes("Summarized"));
            expect(sumMsg).toBeDefined();
        });
    });
});
