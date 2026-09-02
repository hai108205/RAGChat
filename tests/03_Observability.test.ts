import { describe, it, expect } from "vitest";
import { Logger, StructuredLogRecord } from "../src/utils/Logger";
import { MockLogger, createTestAppHarness } from "./mocks/TestAppHarness";
import { BackendClient } from "../src/lib/BackendClient";
import { AskCommand } from "../src/commands/AskCommand";
import { SearchCommand } from "../src/commands/SearchCommand";
import { SummarizeCommand } from "../src/commands/SummarizeCommand";
import { ExplainCommand } from "../src/commands/ExplainCommand";
import { TranslateCommand } from "../src/commands/TranslateCommand";
import { RagCommand } from "../src/commands/RagCommand";
import { CallbackEndpoint } from "../src/api/CallbackEndpoint";
import { createRequestId } from "../src/utils/RequestId";
import { BlockActionHandler } from "../src/handlers/BlockActionHandler";
import { SlashCommandContext } from "@rocket.chat/apps-engine/definition/slashcommands";
import { RoomType } from "@rocket.chat/apps-engine/definition/rooms";
import { HttpStatusCode } from "@rocket.chat/apps-engine/definition/accessors";

describe("Regression Test Suite 3: Standardized Observability & Logging", () => {
    function parseAllLogs(mockLogger: MockLogger): StructuredLogRecord[] {
        const logs: StructuredLogRecord[] = [];
        for (const [, ...args] of mockLogger.allLogs) {
            for (const item of args) {
                if (typeof item === "string") {
                    try {
                        const parsed = JSON.parse(item);
                        if (parsed && typeof parsed === "object" && parsed.timestamp && parsed.level) {
                            logs.push(parsed as StructuredLogRecord);
                        }
                    } catch {
                        // Non-JSON plain text
                    }
                }
            }
        }
        return logs;
    }

    describe("1. Structured Log Schema & Formatting", () => {
        it("emits single-line valid JSON with mandatory observability fields", () => {
            const mockLogger = new MockLogger();
            const logger = new Logger(mockLogger, "TestComponent");

            logger.logRecord("info", "test op started", {
                event: "test.event",
                operation: "test_op",
                phase: "complete",
                outcome: "success",
                requestId: "req-12345",
                jobId: "job-67890",
                durationMs: 42,
                statusCode: 200,
                details: { foo: "bar" },
            });

            expect(mockLogger.infos.length).toBe(1);
            const rawLog = mockLogger.infos[0][0];
            expect(typeof rawLog).toBe("string");
            expect(rawLog.includes("\n")).toBe(false); // Single-line check

            const parsed = JSON.parse(rawLog);
            expect(parsed.timestamp).toBeDefined();
            expect(parsed.level).toBe("info");
            expect(parsed.component).toBe("TestComponent");
            expect(parsed.source).toBe("ragchat-sdk");
            expect(parsed.event).toBe("test.event");
            expect(parsed.operation).toBe("test_op");
            expect(parsed.phase).toBe("complete");
            expect(parsed.outcome).toBe("success");
            expect(parsed.requestId).toBe("req-12345");
            expect(parsed.jobId).toBe("job-67890");
            expect(parsed.durationMs).toBe(42);
            expect(parsed.statusCode).toBe(200);
            expect(parsed.details).toEqual({ foo: "bar" });
        });

        it("correctly sets phase and outcome for standard lifecycle helpers in chronological order", () => {
            const mockLogger = new MockLogger();
            const logger = new Logger(mockLogger, "LifecycleComponent");

            logger.started("ask", { event: "request.started", requestId: "req-1" });
            logger.accepted("ask", { event: "request.accepted", requestId: "req-1", jobId: "job-1" });
            logger.completed("ask", { event: "request.completed", requestId: "req-1" });
            logger.failed("ask", new Error("Simulated failure"), { event: "request.failed", requestId: "req-1" });
            logger.rejected("ask", "Invalid argument", { event: "request.rejected", requestId: "req-1" });
            logger.duplicate("ask", { event: "request.duplicate", requestId: "req-1" });

            const logs = parseAllLogs(mockLogger);
            expect(logs.length).toBe(6);

            expect(logs[0].phase).toBe("start");
            expect(logs[0].outcome).toBe("in_progress");

            expect(logs[1].phase).toBe("accepted");
            expect(logs[1].outcome).toBe("accepted");

            expect(logs[2].phase).toBe("complete");
            expect(logs[2].outcome).toBe("success");

            expect(logs[3].phase).toBe("fail");
            expect(logs[3].outcome).toBe("failure");
            expect(logs[3].errorName).toBe("Error");
            expect(logs[3].errorMessage).toBe("Simulated failure");

            expect(logs[4].phase).toBe("rejected");
            expect(logs[4].outcome).toBe("failure");

            expect(logs[5].phase).toBe("duplicate");
            expect(logs[5].outcome).toBe("success");
        });
    });

    describe("1.1 Request Correlation IDs", () => {
        it("creates a prefixed UUID v4 without Math.random-style entropy", () => {
            const requestId = createRequestId("ask");

            expect(requestId).toMatch(/^ask-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });
    });

    describe("2. Sensitive Data Redaction & Sanitization", () => {
        it("strips or masks query, prompt, text, base64, token, and credentials from log records", () => {
            const mockLogger = new MockLogger();
            const logger = new Logger(mockLogger, "SanitizerComponent");

            logger.info("Sensitive operation test", {
                event: "test.sanitization",
                operation: "sanitize_check",
                details: {
                    query: "How do I build a nuclear reactor?",
                    prompt: "Tell me secrets",
                    question: "What is the admin password?",
                    text: "Secret confidential message text",
                    rawMarkdown: "# Very private notes",
                    snippet: "Private excerpt",
                    token: "secret-bearer-token-12345",
                    integrationToken: "sensitive-api-key",
                    password: "SuperSecretPassword!",
                    base64Content: "JVBERi0xLjQKJcTl8uXr...",
                    contentBase64: "SGVsbG8gV29ybGQ=",
                    safeField: "this is completely public metadata",
                    nested: {
                        authorization: "Bearer eyJhbGciOi...",
                        userQuery: "Another query string",
                        count: 5,
                    },
                },
            });

            const logs = parseAllLogs(mockLogger);
            expect(logs.length).toBe(1);
            const record = logs[0];
            const details = record.details as Record<string, any>;

            // Sensitive string payload keys must be redacted
            expect(details.query).toBe("[REDACTED]");
            expect(details.prompt).toBe("[REDACTED]");
            expect(details.question).toBe("[REDACTED]");
            expect(details.text).toBe("[REDACTED]");
            expect(details.rawMarkdown).toBe("[REDACTED]");
            expect(details.snippet).toBe("[REDACTED]");
            expect(details.token).toBe("[REDACTED]");
            expect(details.integrationToken).toBe("[REDACTED]");
            expect(details.password).toBe("[REDACTED]");
            expect(details.base64Content).toBe("[REDACTED]");
            expect(details.contentBase64).toBe("[REDACTED]");

            // Nested sensitive keys must also be redacted
            expect(details.nested.authorization).toBe("[REDACTED]");
            expect(details.nested.userQuery).toBe("[REDACTED]");

            // Safe metadata must be preserved
            expect(details.safeField).toBe("this is completely public metadata");
            expect(details.nested.count).toBe(5);
        });

        it("redacts bearer tokens and query strings found inside error messages", () => {
            const mockLogger = new MockLogger();
            const logger = new Logger(mockLogger, "ErrorSanitizer");

            const sensitiveError = new Error("Failed to authenticate with Bearer abc123def456xyz; query=select * from users");
            logger.failed("test_error", sensitiveError, { event: "error.test" });

            const logs = parseAllLogs(mockLogger);
            expect(logs.length).toBe(1);
            const record = logs[0];

            expect(record.errorMessage).not.toContain("abc123def456xyz");
            expect(record.errorMessage).toContain("[REDACTED]");
        });

        it("sanitizes top-level error fields and stack traces before emission", () => {
            const mockLogger = new MockLogger();
            const logger = new Logger(mockLogger, "ErrorSanitizer");

            logger.logRecord("error", "Request failed with Bearer abc123def456", {
                event: "error.top_level_sanitization",
                errorMessage: "Backend rejected query=private customer data with Bearer abc123def456",
                stack: "Error: Bearer abc123def456 at C:\\Users\\ADMIN\\secret.ts?query=private",
            });

            const rawLog = mockLogger.errors[0][0];
            const record = JSON.parse(rawLog) as StructuredLogRecord;

            expect(record.message).not.toContain("abc123def456");
            expect(record.errorMessage).not.toContain("abc123def456");
            expect(record.errorMessage).not.toContain("private customer data");
            expect(record.stack).not.toContain("abc123def456");
            expect(record.stack).not.toContain("private");
            expect(record.stack).not.toContain("C:\\Users\\ADMIN");
        });
    });

    describe("3. Centralized HTTP Observability in BackendClient", () => {
        it("records backend.request.started and backend.request.completed with accurate duration and sanitized URL", async () => {
            const { mockRead, mockHttp, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "test-token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: {
                    results: [
                        { title: "Doc 1", snippet: "Snippet 1", relevance: 0.95 },
                    ],
                },
            });

            const client = new BackendClient(mockHttp, mockRead, new Logger(mockLogger, "BackendClient"));
            const requestId = "search-req-obs-1";

            const results = await client.search("test search query", 5, "user1", "room1", requestId);
            expect(results.length).toBe(1);

            const logs = parseAllLogs(mockLogger);
            const startedLog = logs.find((l) => l.event === "backend.request.started");
            const completedLog = logs.find((l) => l.event === "backend.request.completed");

            expect(startedLog).toBeDefined();
            expect(startedLog?.operation).toBe("http_post");
            expect(startedLog?.phase).toBe("start");
            expect(startedLog?.outcome).toBe("in_progress");
            expect(startedLog?.requestId).toBe(requestId);
            expect(startedLog?.details?.method).toBe("POST");
            expect(startedLog?.details?.path).toContain("/api/v1/integrations/rocketchat/utilities/completion");

            expect(completedLog).toBeDefined();
            expect(completedLog?.operation).toBe("http_post");
            expect(completedLog?.phase).toBe("complete");
            expect(completedLog?.outcome).toBe("success");
            expect(completedLog?.requestId).toBe(requestId);
            expect(completedLog?.statusCode).toBe(200);
            expect(typeof completedLog?.durationMs).toBe("number");
            expect(completedLog?.durationMs).toBeGreaterThanOrEqual(0);
        });

        it("records backend.request.failed with statusCode, errorCode, and duration on HTTP failure", async () => {
            const { mockRead, mockHttp, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "test-token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 502,
                content: JSON.stringify({ error: "Bad Gateway", code: "UPSTREAM_DOWN" }),
            });

            const client = new BackendClient(mockHttp, mockRead, new Logger(mockLogger, "BackendClient"));
            const requestId = "sum-req-obs-fail";

            await expect(client.summarize("test text", requestId)).rejects.toThrow();

            const logs = parseAllLogs(mockLogger);
            const failedLog = logs.find((l) => l.event === "backend.request.failed");

            expect(failedLog).toBeDefined();
            expect(failedLog?.operation).toBe("http_post");
            expect(failedLog?.phase).toBe("fail");
            expect(failedLog?.outcome).toBe("failure");
            expect(failedLog?.requestId).toBe(requestId);
            expect(failedLog?.statusCode).toBe(502);
            expect(failedLog?.errorCode).toBe("HTTP_502");
            expect(typeof failedLog?.durationMs).toBe("number");
        });
    });

    describe("4. End-to-End Async Correlation & Terminal Outcomes (Ask -> Webhook)", () => {
        it("tracks correlation ID from /ask enqueue through CallbackEndpoint terminal outcome", async () => {
            const { app, mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "secure-token");
            mockRead.setSetting("callback-base-url", "http://rocketchat.internal");

            // 1. Mock the async enqueue response from backend
            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/messages/async",
                method: "post",
                statusCode: 202,
                data: {
                    status: "accepted",
                    job_id: "bullmq-job-999",
                },
            });

            // 2. Execute /ask slash command
            const askCommand = new AskCommand(mockLogger);
            const user = { id: "test-user-id", username: "test.user", name: "Test User" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const context = new SlashCommandContext(user, room, ["explain", "quantum", "computing"]);

            await askCommand.executor(context, mockRead, mockModify, mockHttp, mockPersistence);

            const commandLogs = parseAllLogs(mockLogger);
            const startedLog = commandLogs.find((l) => l.event === "request.started");
            const acceptedLog = commandLogs.find((l) => l.event === "request.accepted");

            expect(startedLog).toBeDefined();
            expect(startedLog?.phase).toBe("start");
            expect(startedLog?.outcome).toBe("in_progress");
            expect(startedLog?.requestId).toBeDefined();
            const correlationRequestId = startedLog?.requestId;

            expect(acceptedLog).toBeDefined();
            expect(acceptedLog?.phase).toBe("accepted");
            expect(acceptedLog?.outcome).toBe("accepted");
            expect(acceptedLog?.requestId).toBe(correlationRequestId);
            expect(acceptedLog?.jobId).toBe("bullmq-job-999");

            // 3. Now simulate the backend webhook arriving at CallbackEndpoint
            const callbackEndpoint = new CallbackEndpoint(app);
            const webhookContext = {
                endpoint: callbackEndpoint,
                read: mockRead,
                modify: mockModify,
                http: mockHttp,
                persis: mockPersistence,
                request: {
                    headers: {
                        authorization: "Bearer secure-token",
                        "content-type": "application/json",
                    },
                    content: {
                        event: "chat_completed",
                        request_id: correlationRequestId,
                        job_id: "bullmq-job-999",
                        status: "completed",
                        query: "explain quantum computing",
                        answer: "Quantum computing utilizes superposition and entanglement.",
                        user_id: "test-user-id",
                        room_id: "test-room-id",
                        placeholder_id: "mock-msg-id-1",
                        sources: [
                            { title: "Quantum Physics 101", relevance: 0.98 },
                        ],
                    },
                },
            };

            const callbackResponse = await callbackEndpoint.post(
                webhookContext.request as any,
                {} as any,
                mockRead,
                mockModify,
                mockHttp,
                mockPersistence,
            );

            expect(callbackResponse.status, JSON.stringify(callbackResponse.content)).toBe(HttpStatusCode.OK);
            expect(Array.from(mockModify.messages.values()).some(
                (message) => message.text?.includes("Quantum computing utilizes superposition and entanglement."),
            )).toBe(true);

            const allLogs = parseAllLogs(mockLogger);
            const completedTerminalLog = allLogs.find((l) => l.event === "callback.completed");

            expect(completedTerminalLog).toBeDefined();
            expect(completedTerminalLog?.operation).toBe("ask");
            expect(completedTerminalLog?.phase).toBe("complete");
            expect(completedTerminalLog?.outcome).toBe("success");
            expect(completedTerminalLog?.requestId).toBe(correlationRequestId);
            expect(completedTerminalLog?.jobId).toBe("bullmq-job-999");
            expect(completedTerminalLog?.roomId).toBe("test-room-id");
            expect(completedTerminalLog?.userId).toBe("test-user-id");
        });

        it("logs terminal failure outcome on chat_failed backend callback", async () => {
            const { app, mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("integration-token", "secure-token");

            const callbackEndpoint = new CallbackEndpoint(app);
            const reqId = "ask-fail-obs-test";

            const callbackResponse = await callbackEndpoint.post(
                {
                    headers: { authorization: "Bearer secure-token" },
                    content: {
                        event: "chat_failed",
                        request_id: reqId,
                        job_id: "job-fail-1",
                        status: "failed",
                        data: {
                            error: "LLM rate limit exceeded",
                            error_code: "RATE_LIMIT_EXCEEDED",
                            user_id: "test-user-id",
                            room_id: "test-room-id",
                            placeholder_id: "mock-msg-id-2",
                        },
                    },
                } as any,
                {} as any,
                mockRead,
                mockModify,
                mockHttp,
                mockPersistence,
            );

            expect(callbackResponse.status).toBe(HttpStatusCode.OK);

            const logs = parseAllLogs(mockLogger);
            const failedTerminalLog = logs.find((l) => l.event === "callback.failed");

            expect(failedTerminalLog).toBeDefined();
            expect(failedTerminalLog?.operation).toBe("ask");
            expect(failedTerminalLog?.phase).toBe("fail");
            expect(failedTerminalLog?.outcome).toBe("failure");
            expect(failedTerminalLog?.requestId).toBe(reqId);
            expect(failedTerminalLog?.jobId).toBe("job-fail-1");
            expect(failedTerminalLog?.errorCode).toBe("RATE_LIMIT_EXCEEDED");
            expect(failedTerminalLog?.errorMessage).toBe("LLM rate limit exceeded");
        });
    });

    describe("5. Slash Commands Structured Logging", () => {
        it("records search.started and search.completed in SearchCommand", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { results: [{ title: "RAG Architecture", snippet: "Overview", relevance: 0.9 }] },
            });

            const command = new SearchCommand(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const ctx = new SlashCommandContext(user, room, ["architecture"]);

            await command.executor(ctx, mockRead, mockModify, mockHttp, mockPersistence);

            const logs = parseAllLogs(mockLogger);
            const started = logs.find((l) => l.event === "search.started");
            const completed = logs.find((l) => l.event === "search.completed");

            expect(started).toBeDefined();
            expect(started?.operation).toBe("search");
            expect(started?.phase).toBe("start");

            expect(completed).toBeDefined();
            expect(completed?.operation).toBe("search");
            expect(completed?.phase).toBe("complete");
            expect(completed?.outcome).toBe("success");
            expect(completed?.details?.resultsCount).toBe(1);
        });

        it("records summarize.started and summarize.completed in SummarizeCommand", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { summary: "Concise summary of input." },
            });

            const command = new SummarizeCommand(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const ctx = new SlashCommandContext(user, room, ["Long", "text", "to", "summarize"]);

            await command.executor(ctx, mockRead, mockModify, mockHttp, mockPersistence);

            const logs = parseAllLogs(mockLogger);
            const started = logs.find((l) => l.event === "summarize.started");
            const completed = logs.find((l) => l.event === "summarize.completed");

            expect(started).toBeDefined();
            expect(completed).toBeDefined();
            expect(completed?.outcome).toBe("success");
        });

        it("records explain.started and explain.completed in ExplainCommand", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { explanation: "Clear explanation." },
            });

            const command = new ExplainCommand(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const ctx = new SlashCommandContext(user, room, ["Vector", "Embeddings"]);

            await command.executor(ctx, mockRead, mockModify, mockHttp, mockPersistence);

            const logs = parseAllLogs(mockLogger);
            expect(logs.find((l) => l.event === "explain.started")).toBeDefined();
            expect(logs.find((l) => l.event === "explain.completed")).toBeDefined();
        });

        it("records translate.started and translate.completed in TranslateCommand", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/utilities/completion",
                method: "post",
                statusCode: 200,
                data: { translation: "Xin chào thế giới" },
            });

            const command = new TranslateCommand(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const ctx = new SlashCommandContext(user, room, ["vi", "Hello", "world"]);

            await command.executor(ctx, mockRead, mockModify, mockHttp, mockPersistence);

            const logs = parseAllLogs(mockLogger);
            expect(logs.find((l) => l.event === "translate.started")).toBeDefined();
            expect(logs.find((l) => l.event === "translate.completed")).toBeDefined();
        });

        it("records docs.started and docs.completed in RagCommand", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            mockRead.setSetting("backend-url", "http://localhost:3000");
            mockRead.setSetting("integration-token", "token");

            mockHttp.registerMockResponse({
                url: "/api/v1/integrations/rocketchat/sources",
                method: "get",
                statusCode: 200,
                data: { sources: [{ id: "s1", filename: "doc.pdf", status: "READY", chunksCount: 10 }] },
            });

            const command = new RagCommand(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const ctx = new SlashCommandContext(user, room, ["docs"]);

            await command.executor(ctx, mockRead, mockModify, mockHttp, mockPersistence);

            const logs = parseAllLogs(mockLogger);
            expect(logs.find((l) => l.event === "docs.started")).toBeDefined();
            expect(logs.find((l) => l.event === "docs.completed")).toBeDefined();
        });
    });

    describe("6. UIKit Local Action Lifecycle", () => {
        it("records start and completion for copy-markdown actions", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            const handler = new BlockActionHandler(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const context = {
                getInteractionData: () => ({
                    actionId: "copy_markdown",
                    user,
                    room,
                    value: "# Safe markdown",
                }),
                getInteractionResponder: () => ({
                    successResponse: () => ({ type: "success" }),
                    openModalViewResponse: () => ({ type: "modal" }),
                }),
            };

            await handler.handleBlockAction(context as any, mockRead, mockHttp, mockPersistence, mockModify);

            const logs = parseAllLogs(mockLogger);
            const started = logs.find((log) => log.event === "copy_markdown.started");
            const completed = logs.find((log) => log.event === "copy_markdown.completed");
            expect(started).toBeDefined();
            expect(completed).toBeDefined();
            expect(completed?.requestId).toBe(started?.requestId);
        });

        it("records rejection when delete-source modal lacks a source ID", async () => {
            const { mockRead, mockModify, mockHttp, mockPersistence, mockLogger } = createTestAppHarness();
            const handler = new BlockActionHandler(mockLogger);
            const user = { id: "test-user-id", username: "test.user" } as any;
            const room = { id: "test-room-id", type: RoomType.CHANNEL } as any;
            const context = {
                getInteractionData: () => ({ actionId: "delete_source", user, room }),
                getInteractionResponder: () => ({ successResponse: () => ({ type: "success" }) }),
            };

            await handler.handleBlockAction(context as any, mockRead, mockHttp, mockPersistence, mockModify);

            const logs = parseAllLogs(mockLogger);
            const started = logs.find((log) => log.event === "delete_source.modal_started");
            const rejected = logs.find((log) => log.event === "delete_source.modal_rejected");
            expect(started).toBeDefined();
            expect(rejected).toBeDefined();
            expect(rejected?.requestId).toBe(started?.requestId);
        });
    });
});
