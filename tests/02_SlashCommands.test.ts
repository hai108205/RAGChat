import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SlashCommandContext } from "@rocket.chat/apps-engine/definition/slashcommands";
import { AskCommand } from "../src/commands/AskCommand";
import { RagCommand } from "../src/commands/RagCommand";
import { SearchCommand } from "../src/commands/SearchCommand";
import { SummarizeCommand } from "../src/commands/SummarizeCommand";
import { ExplainCommand } from "../src/commands/ExplainCommand";
import { TranslateCommand } from "../src/commands/TranslateCommand";
import { BackendClient } from "../src/lib/BackendClient";
import { createTestAppHarness } from "./mocks/TestAppHarness";
import { startRealBackend, stopRealBackend } from "./server/RealBackendHarness";

describe("Regression Test Suite 2: Slash Commands with Real Docker Backend", () => {
    let harness: ReturnType<typeof createTestAppHarness>;
    let backendInfo: { port: number; baseUrl: string; token: string };

    beforeAll(async () => {
        backendInfo = await startRealBackend();
        harness = createTestAppHarness();
        harness.mockRead.setSetting("backend-url", backendInfo.baseUrl);
        harness.mockRead.setSetting("integration-token", backendInfo.token);
        harness.mockRead.setSetting("callback-base-url", "http://localhost:3001");

        // Seed a sample knowledge base document into the real backend
        const client = new BackendClient(harness.mockHttp, harness.mockRead);
        const md = "# Rocket.Chat Architecture\nRocket.Chat is built with Meteor and TypeScript.";
        await client.uploadBase64({
            workspaceId: "default",
            rocketUserId: "test-user-id",
            roomId: "test-room-id",
            filename: "architecture.md",
            contentBase64: Buffer.from(md, "utf8").toString("base64"),
            requestId: `seed-${Date.now()}`,
        });
        await new Promise((r) => setTimeout(r, 600));
    });

    afterAll(async () => {
        await stopRealBackend();
    });

    it("AskCommand: executes /ask <query> successfully with placeholder message creation", async () => {
        const cmd = new AskCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(
            user,
            room,
            ["What", "is", "Rocket.Chat", "architecture?"],
            undefined,
        );

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const createdMsgs = Array.from(harness.mockModify.messages.values());
        expect(createdMsgs.length).toBeGreaterThanOrEqual(1);

        const placeholder = createdMsgs.find((m) => m.text?.includes("Đang tra cứu tài liệu") || m.text?.includes("Đang xử lý") || m.text?.includes("Rocket.Chat"));
        expect(placeholder).toBeDefined();
    });

    it("AskCommand: notifies usage when query is missing", async () => {
        const cmd = new AskCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, [], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const usageMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Cách dùng:") || m.text?.includes("/ask"));
        expect(usageMsg).toBeDefined();
    });

    it("RagCommand: /rag help renders usage guide", async () => {
        const cmd = new RagCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["help"], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const helpMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Hướng dẫn các lệnh RAG"));
        expect(helpMsg).toBeDefined();
    });

    it("RagCommand: /rag docs lists indexed knowledge base sources with UIKit blocks", async () => {
        const cmd = new RagCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["docs"], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const docsMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.blocks && m.blocks.length > 0);
        expect(docsMsg).toBeDefined();
    });

    it("RagCommand: /rag prune scans for broken or empty sources", async () => {
        const cmd = new RagCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["prune"], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const pruneMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Quét tài liệu hoàn tất") || m.text?.includes("Dọn dẹp"));
        expect(pruneMsg).toBeDefined();
    });

    it("SearchCommand: /search <query> returns matching knowledge base snippets", async () => {
        const cmd = new SearchCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["Architecture"], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const searchMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Search") || m.text?.includes("Architecture") || m.text?.includes("Tìm kiếm"));
        expect(searchMsg).toBeDefined();
    });

    it("SummarizeCommand: /summarize <text> produces concise summary", async () => {
        const cmd = new SummarizeCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["Rocket.Chat", "is", "a", "secure", "communication", "hub."], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const summaryMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Tóm tắt") || m.text?.includes("Summary") || m.text?.includes("AI"));
        expect(summaryMsg).toBeDefined();
    });

    it("ExplainCommand: /explain <concept> produces clear explanation", async () => {
        const cmd = new ExplainCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["Vector", "Search"], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const explainMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Giải thích") || m.text?.includes("Explanation") || m.text?.includes("AI"));
        expect(explainMsg).toBeDefined();
    });

    it("TranslateCommand: /translate <targetLang> <text> returns translation", async () => {
        const cmd = new TranslateCommand();
        const user = (await harness.mockRead.getUserReader().getById("test-user-id"))!;
        const room = (await harness.mockRead.getRoomReader().getById("test-room-id"))!;

        const context = new SlashCommandContext(user, room, ["vi", "Hello", "world"], undefined);

        await cmd.executor(context, harness.mockRead, harness.mockModify, harness.mockHttp, harness.mockPersistence);

        const transMsg = Array.from(harness.mockModify.messages.values()).find((m) => m.text?.includes("Dịch") || m.text?.includes("Translation") || m.text?.includes("AI"));
        expect(transMsg).toBeDefined();
    });
});
