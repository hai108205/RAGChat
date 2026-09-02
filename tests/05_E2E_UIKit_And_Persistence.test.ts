import { describe, it, expect, beforeEach } from "vitest";
import { createTestAppHarness, TestHarness } from "./mocks/TestAppHarness";
import {
    buildActionButtonsBlock,
    createActionButtonsElements,
    encodeActionPayload,
    ActionButtonActionId,
    buildDocumentListBlocks,
    buildSourceCardsBlock,
    buildSuggestionChipsBlock,
    addSuggestionChipsBlocks,
    buildConfirmDeleteModal,
    buildRagSettingsModal,
    buildRawMarkdownModal,
    buildSourceDetailModal,
} from "../src/uikit";
import { BlockBuilder } from "@rocket.chat/apps-engine/definition/uikit";
import { SessionStore } from "../src/persistence/sessionStore";
import {
    saveMessageActionPayload,
    loadMessageActionPayload,
    removeMessageActionPayload,
} from "../src/persistence/messagePayloadStore";
import { Validator } from "../src/utils/Validator";
import { Formatter, CitationSource } from "../src/utils/Formatter";
import { readMaxHistory, readBoolean } from "../src/utils/SettingReader";
import { buildCallbackUrl } from "../src/utils/CallbackUrl";

describe("E2E Test Suite 5: UIKit Components, Persistence Layer, and Utilities", () => {
    let harness: TestHarness;

    beforeEach(() => {
        harness = createTestAppHarness();
        harness.mockRead.setSetting("backend-url", "http://backend.internal:3000");
        harness.mockRead.setSetting("integration-token", "secret-token-123");
        harness.mockRead.setSetting("callback-base-url", "http://rocketchat.internal:3000");
        harness.mockRead.setSetting("max-history-messages", 10);
    });

    describe("1. UIKit Blocks E2E", () => {
        it("ActionButtonsBlock creates interactive elements and encodes payload safely", () => {
            const builder = new BlockBuilder("ragchat");
            const sources: CitationSource[] = [
                { title: "Manual", snippet: "Intro snippet", relevance: 0.95 },
            ];

            const elements = createActionButtonsElements(builder, {
                messageId: "msg-ui-1",
                chatMessageId: "chat-msg-1",
                sourcesCount: 1,
                sources,
            });

            expect(elements.length).toBe(5); // 👍, 👎, 🔄, 📋, 🔍

            const encoded = encodeActionPayload(ActionButtonActionId.FEEDBACK_POSITIVE, {
                messageId: "msg-ui-1",
                chatMessageId: "chat-msg-1",
            });
            const parsed = JSON.parse(encoded);
            expect(parsed.action).toBe(ActionButtonActionId.FEEDBACK_POSITIVE);
            expect(parsed.messageId).toBe("msg-ui-1");
            expect(parsed.chatMessageId).toBe("chat-msg-1");

            // Build into BlockBuilder
            buildActionButtonsBlock(builder, { messageId: "msg-ui-1" });
            const blocks = builder.getBlocks();
            expect(blocks.length).toBeGreaterThanOrEqual(1);
            expect(blocks[0].type).toBe("actions");
        });

        it("DocumentListBlock renders source list with status, chunks count, and delete buttons", () => {
            const builder = new BlockBuilder("ragchat");
            const sources = [
                { id: "src-1", filename: "financial_report.pdf", status: "READY", chunksCount: 42, createdAt: "2026-03-01T12:00:00Z" },
                { id: "src-2", filename: "api_guide.docx", status: "PROCESSING", chunksCount: 0 },
            ];

            buildDocumentListBlocks(builder, sources, { roomId: "room-doc-1" });
            const blocks = builder.getBlocks();

            expect(blocks.length).toBeGreaterThanOrEqual(2);
            const blockString = JSON.stringify(blocks);
            expect(blockString).toContain("financial_report.pdf");
            expect(blockString).toContain("42");
            expect(blockString).toContain("api_guide.docx");
        });

        it("SourceCardsBlock renders citation cards with relevance badges", () => {
            const builder = new BlockBuilder("ragchat");
            const sources: CitationSource[] = [
                { title: "Deployment Spec", snippet: "Kubernetes helm chart instructions", relevance: 0.92, page: 3 },
                { title: "Network Policy", snippet: "Ingress security rules", relevance: 0.78 },
            ];

            buildSourceCardsBlock(builder, sources);
            const blocks = builder.getBlocks();

            expect(blocks.length).toBeGreaterThanOrEqual(2);
            const blockString = JSON.stringify(blocks);
            expect(blockString).toContain("Deployment Spec");
            expect(blockString).toContain("92%");
            expect(blockString).toContain("Trang 3");
        });

        it("SuggestionChipsBlock renders follow-up suggestion action chips", () => {
            const suggestions = [
                { label: "Làm sao để cấu hình Redis?", query: "Làm sao để cấu hình Redis?" },
                { label: "Giải thích chi tiết bước 2", query: "Giải thích chi tiết bước 2" },
            ];

            const actionBlock = buildSuggestionChipsBlock(harness.mockModify, suggestions);
            expect(actionBlock.type).toBe("actions");
            expect(actionBlock.elements.length).toBe(2);

            // Test addSuggestionChipsBlocks helper
            const builder = new BlockBuilder("ragchat");
            addSuggestionChipsBlocks(builder);
            expect(builder.getBlocks().length).toBe(1);
        });
    });

    describe("2. UIKit Modals E2E", () => {
        it("ConfirmDeleteModal constructs valid modal view with filename and sourceId", () => {
            const modal = buildConfirmDeleteModal({
                sourceId: "src-del-123",
                filename: "important_document.pdf",
                roomId: "room-abc",
            });

            expect(modal.id).toBe("confirm-delete-source");
            expect(modal.title.text).toContain("Xoá");
            const viewString = JSON.stringify(modal);
            expect(viewString).toContain("important_document.pdf");
            expect(viewString).toContain("src-del-123");
        });

        it("RagSettingsModal constructs valid configuration modal", () => {
            const modal = buildRagSettingsModal({
                appId: "ragchat",
                currentSettings: {
                    model: "anthropic/claude-3.5-sonnet",
                    searchMode: "hybrid",
                    topK: 8,
                },
            });

            expect(modal.id).toBe("rag-settings-modal");
            const viewString = JSON.stringify(modal);
            expect(viewString).toContain("anthropic/claude-3.5-sonnet");
        });

        it("RawMarkdownModal constructs codeblock markdown inspection view", () => {
            const rawContent = "# Title\n\n- item 1\n- item 2\n```ts\nconsole.log(1);\n```";
            const modal = buildRawMarkdownModal({
                rawMarkdown: rawContent,
            });

            expect(modal.id).toBe("raw-markdown-modal");
            const viewString = JSON.stringify(modal);
            expect(viewString).toContain("console.log(1)");
        });

        it("SourceDetailModal constructs citation snippet modal view", () => {
            const modal = buildSourceDetailModal({
                sources: [
                    {
                        title: "Security Architecture",
                        snippet: "All egress traffic is encrypted via TLS 1.3.",
                        relevance: 0.96,
                    },
                ],
                sourceId: "src-sec-1",
            });

            expect(modal.id).toBe("source-detail-modal");
            const viewString = JSON.stringify(modal);
            expect(viewString).toContain("Security Architecture");
            expect(viewString).toContain("TLS 1.3");
            expect(viewString).toContain("96%");
        });
    });

    describe("3. Persistence Layer E2E", () => {
        it("SessionStore saves multi-turn history, respects max history bounds, and clears", async () => {
            const sessionStore = new SessionStore(harness.mockRead, harness.mockPersistence);
            const userId = "user-sess-1";
            const roomId = "room-sess-1";

            // Add 15 turns
            for (let i = 1; i <= 15; i++) {
                await sessionStore.addMessages(userId, roomId, undefined, [
                    {
                        role: i % 2 === 1 ? "user" : "assistant",
                        content: `Message ${i}`,
                        timestamp: Date.now(),
                    },
                ], 10);
            }

            const history = await sessionStore.getHistory(userId, roomId, undefined, 10);
            expect(history.length).toBeLessThanOrEqual(10);
            expect(history[history.length - 1].content).toBe("Message 15");

            const hasHist = await sessionStore.hasHistory(userId, roomId);
            expect(hasHist).toBe(true);

            await sessionStore.clearHistory(userId, roomId);
            const clearedHist = await sessionStore.getHistory(userId, roomId);
            expect(clearedHist.length).toBe(0);
        });

        it("messagePayloadStore saves, retrieves, and deletes message payloads", async () => {
            const messageId = "msg-store-99";
            const payloadData = {
                messageId,
                createdAt: Date.now(),
                query: "What are vector indexes?",
                rawMarkdown: "Vector indexes enable fast nearest neighbor search.",
                sources: [
                    { title: "HNSW Paper", snippet: "Hierarchical Navigable Small World", relevance: 0.98 },
                ],
            };

            await saveMessageActionPayload(harness.mockPersistence, payloadData);

            const retrieved = await loadMessageActionPayload(harness.mockRead, messageId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.query).toBe("What are vector indexes?");
            expect(retrieved?.sources?.length).toBe(1);

            await removeMessageActionPayload(harness.mockPersistence, messageId);
            const afterDelete = await loadMessageActionPayload(harness.mockRead, messageId);
            expect(afterDelete).toBeUndefined();
        });
    });

    describe("4. Utilities E2E", () => {
        it("Validator correctly validates and bounds inputs", () => {
            expect(Validator.isValidUrl("http://localhost:3000")).toBe(true);
            expect(Validator.isValidUrl("https://chat.domain.com/app")).toBe(true);
            expect(Validator.isValidUrl("invalid-url-string")).toBe(false);

            expect(Validator.sanitizeInput("  Hello world!  ")).toBe("Hello world!");
            expect(Validator.sanitizeInput(null as any)).toBe("");
            expect(Validator.sanitizeInput(12345 as any)).toBe("12345");
            expect(Validator.sanitizeInput(true as any)).toBe("true");

            const longInput = "a".repeat(5000);
            expect(Validator.sanitizeInput(longInput).length).toBe(4000);
        });

        it("Formatter correctly generates standard templates", () => {
            const sources: CitationSource[] = [
                { title: "Doc 1", snippet: "Snippet 1", relevance: 0.85 },
            ];
            const formatted = Formatter.formatSources(sources);
            expect(formatted.fields?.[0].value).toContain("Doc 1");
            expect(formatted.fields?.[0].title).toContain("85%");

            const help = Formatter.formatHelpMessage();
            expect(help).toContain("/ask");
            expect(help).toContain("/search");

            const welcome = Formatter.formatWelcomeMessage();
            expect(welcome).toContain("RAGChat");
        });

        it("SettingReader reads app settings safely with defaults", () => {
            const maxHistory = readMaxHistory(10);
            expect(maxHistory).toBe(10);

            const fallbackHistory = readMaxHistory("invalid");
            expect(fallbackHistory).toBe(10);

            const boolVal = readBoolean(true);
            expect(boolVal).toBe(true);

            const fallbackBool = readBoolean(undefined, false);
            expect(fallbackBool).toBe(false);
        });

        it("CallbackUrl builds valid public webhook callback URLs", async () => {
            const url = await buildCallbackUrl(harness.mockRead, "8a800b09-3cc1-4bc1-8dbf-12592fc223eb");
            expect(url).toBe("http://rocketchat.internal:3000/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback");
        });
    });
});
