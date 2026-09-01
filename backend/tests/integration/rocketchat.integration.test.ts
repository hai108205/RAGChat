import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";

const userFindFirstMock = vi.fn();
const userCreateMock = vi.fn();
const chatFindFirstMock = vi.fn();
const chatCreateMock = vi.fn();
const chatUpdateMock = vi.fn();
const chatSourceFindManyMock = vi.fn();
const chatSourceCreateMock = vi.fn();
const documentPageCreateManyMock = vi.fn();
const documentPageFindManyMock = vi.fn();
const usageEventsAggregateMock = vi.fn();
const usageEventsCreateMock = vi.fn();
const auditEventCreateMock = vi.fn();
const chatMessageCreateMock = vi.fn();
const chatMessageSourceCreateManyMock = vi.fn();

vi.mock("ioredis", () => {
    class MockRedis {
        constructor() {}
        on() {
            return this;
        }
        once() {
            return this;
        }
        off() {
            return this;
        }
        quit() {
            return Promise.resolve();
        }
        disconnect() {
            return Promise.resolve();
        }
        connect() {
            return Promise.resolve();
        }
        get() {
            return Promise.resolve(null);
        }
        set() {
            return Promise.resolve("OK");
        }
    }
    return {
        default: MockRedis,
        Redis: MockRedis,
    };
});

vi.mock("../../utils/prismaClient.js", () => ({
    default: {
        user: {
            findFirst: (...args: any[]) => userFindFirstMock(...args),
            create: (...args: any[]) => userCreateMock(...args),
        },
        chat: {
            findFirst: (...args: any[]) => chatFindFirstMock(...args),
            create: (...args: any[]) => chatCreateMock(...args),
            update: (...args: any[]) => chatUpdateMock(...args),
        },
        chatSource: {
            findMany: (...args: any[]) => chatSourceFindManyMock(...args),
            create: (...args: any[]) => chatSourceCreateMock(...args),
        },
        documentPage: {
            findMany: (...args: any[]) => documentPageFindManyMock(...args),
            createMany: (...args: any[]) => documentPageCreateManyMock(...args),
        },
        usageEvents: {
            aggregate: (...args: any[]) => usageEventsAggregateMock(...args),
            create: (...args: any[]) => usageEventsCreateMock(...args),
        },
        auditEvent: {
            create: (...args: any[]) => auditEventCreateMock(...args),
        },
        chatMessage: {
            create: (...args: any[]) => chatMessageCreateMock(...args),
        },
        chatMessageSource: {
            createMany: (...args: any[]) => chatMessageSourceCreateManyMock(...args),
        },
    },
}));

vi.mock("openai", () => {
    return {
        default: class MockOpenAI {
            chat: any;
            constructor() {
                this.chat = {
                    completions: {
                        create: async ({ messages }: { messages: any[] }) => {
                            const lastUser = messages.find((m) => m.role === "user")?.content || "";
                            return {
                                choices: [
                                    {
                                        message: {
                                            content: `Mocked AI response for: ${lastUser}`,
                                        },
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 15,
                                    completion_tokens: 25,
                                },
                            };
                        },
                    },
                };
            }
        },
    };
});

const { default: rocketchatRouter } = await import(
    "../../routers/rocketchatIntegration.route.js"
);
const { app: mainApp } = await import("../../app.js");

function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/integrations/rocketchat", rocketchatRouter);
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
            statusCode,
            message: err.message,
            errors: err.errors || [],
        });
    });
    return app;
}

describe("Rocket.Chat Integration Router", () => {
    const originalToken = process.env.ROCKETCHAT_INTEGRATION_TOKEN;

    beforeEach(() => {
        process.env.ROCKETCHAT_INTEGRATION_TOKEN = "test-secret-token";
        userFindFirstMock.mockReset();
        userCreateMock.mockReset();
        chatFindFirstMock.mockReset();
        chatCreateMock.mockReset();
        chatUpdateMock.mockReset();
        chatSourceFindManyMock.mockReset();
        chatSourceFindManyMock.mockResolvedValue([]);
        chatSourceCreateMock.mockReset();
        documentPageCreateManyMock.mockReset();
        documentPageFindManyMock.mockReset();
        usageEventsAggregateMock.mockReset();
        usageEventsCreateMock.mockReset();
        auditEventCreateMock.mockReset();
        chatMessageCreateMock.mockReset();
        chatMessageSourceCreateManyMock.mockReset();
    });

    describe("Authentication", () => {
        it("rejects requests without Authorization header", async () => {
            const app = buildTestApp();
            const res = await request(app).get("/api/v1/integrations/rocketchat/stats");
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/Missing Authorization header/i);
        });

        it("rejects requests with invalid token", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .get("/api/v1/integrations/rocketchat/stats")
                .set("Authorization", "Bearer wrong-token");
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/Invalid integration token/i);
        });

        it("allows requests with valid token", async () => {
            chatSourceFindManyMock.mockResolvedValue([]);
            usageEventsAggregateMock.mockResolvedValue({
                _sum: { inputTokens: 0, outputTokens: 0 },
            });

            const app = buildTestApp();
            const res = await request(app)
                .get("/api/v1/integrations/rocketchat/stats")
                .set("Authorization", "Bearer test-secret-token");
            expect(res.status).toBe(200);
            expect(res.body.data).toBeDefined();
        });
    });

    describe("Route Surface Isolation", () => {
        it("returns 404 for web auth routes when ENABLE_WEB_ROUTES is not enabled", async () => {
            const res = await request(mainApp).post("/api/v1/user/login").send({
                email: "test@example.com",
                password: "password123",
            });
            expect(res.status).toBe(404);
        });

        it("serves rocketchat integration routes on main application with valid token", async () => {
            chatSourceFindManyMock.mockResolvedValue([]);
            usageEventsAggregateMock.mockResolvedValue({
                _sum: { inputTokens: 0, outputTokens: 0 },
            });

            const res = await request(mainApp)
                .get("/api/v1/integrations/rocketchat/stats")
                .set("Authorization", "Bearer test-secret-token");
            expect(res.status).toBe(200);
            expect(res.body.data).toBeDefined();
        });
    });

    describe("POST /messages/async", () => {
        it("queues message and returns HTTP 202 Accepted", async () => {
            userFindFirstMock.mockResolvedValue({ id: "user-1" });
            chatFindFirstMock.mockResolvedValue({ id: "chat-1", chatSources: [] });
            chatMessageCreateMock.mockResolvedValue({ id: "msg-1" });
            usageEventsCreateMock.mockResolvedValue({});
            auditEventCreateMock.mockResolvedValue({});

            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/messages/async")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    workspaceId: "default",
                    rocketUserId: "u123",
                    roomId: "GENERAL",
                    requestId: "req-test-1",
                    query: "How do I deploy?",
                });

            expect(res.status).toBe(202);
            expect(res.body.data.status).toBe("accepted");
            expect(res.body.data.requestId).toBe("req-test-1");
        });

        it("detects duplicate requestId and ignores reprocessing", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/messages/async")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    rocketUserId: "u123",
                    roomId: "GENERAL",
                    requestId: "req-test-1", // duplicate from previous test
                    query: "How do I deploy?",
                });

            expect(res.status).toBe(202);
            expect(res.body.data.duplicate).toBe(true);
        });

        it("validates required fields", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/messages/async")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    query: "Missing user and room",
                });

            expect(res.status).toBe(400);
        });
    });

    describe("GET /stats", () => {
        it("returns formatted documents and usage data", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "source-1",
                    heading: "Deployment Guide",
                    documentationUrl: "https://docs.example.com",
                    totalPages: 10,
                    createdAt: new Date("2026-08-31T00:00:00.000Z"),
                    _count: { pagesIndexed: 10 },
                },
            ]);
            usageEventsAggregateMock.mockResolvedValue({
                _sum: { inputTokens: 500, outputTokens: 250 },
            });

            const app = buildTestApp();
            const res = await request(app)
                .get("/api/v1/integrations/rocketchat/stats")
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(200);
            expect(res.body.data.documents).toHaveLength(1);
            expect(res.body.data.documents[0].filename).toBe("Deployment Guide");
            expect(res.body.data.documents[0].chunks_count).toBe(10);
            expect(res.body.data.usage.totalTokens).toBe(750);
        });
    });

    describe("POST /sources/base64", () => {
        it("accepts base64 document and returns HTTP 202", async () => {
            userFindFirstMock.mockResolvedValue({ id: "user-1" });
            chatFindFirstMock.mockResolvedValue({ id: "chat-1" });
            chatSourceCreateMock.mockResolvedValue({ id: "source-new" });
            documentPageCreateManyMock.mockResolvedValue({ count: 1 });

            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/sources/base64")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    rocketUserId: "u123",
                    roomId: "GENERAL",
                    filename: "test.md",
                    contentBase64: Buffer.from("# Test Markdown Document").toString("base64"),
                    requestId: "upload-req-1",
                });

            expect(res.status).toBe(202);
            expect(res.body.data.status).toBe("accepted");
            expect(res.body.data.requestId).toBe("upload-req-1");
        });

        it("stores workspaceId, roomId, and uploader user id on source creation", async () => {
            userFindFirstMock.mockResolvedValue({ id: "user-1" });
            chatFindFirstMock.mockResolvedValue({ id: "chat-1" });
            chatSourceCreateMock.mockResolvedValue({ id: "source-scoped" });
            documentPageCreateManyMock.mockResolvedValue({ count: 1 });

            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/sources/base64")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    workspaceId: "team-ws",
                    rocketUserId: "u999",
                    roomId: "ROOM_TECH",
                    threadId: "t_456",
                    filename: "architecture.md",
                    contentBase64: Buffer.from("# Architecture").toString("base64"),
                    requestId: "upload-req-scoped",
                });

            expect(res.status).toBe(202);

            // Wait for setImmediate to execute
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(chatSourceCreateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        heading: "architecture.md",
                        rocketchatWorkspaceId: "team-ws",
                        rocketchatRoomId: "ROOM_TECH",
                        rocketchatThreadId: "t_456",
                        uploadedByRocketUserId: "u999",
                    }),
                }),
            );
        });
    });

    describe("POST /utilities/completion", () => {
        it("executes summarize operation", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/utilities/completion")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    operation: "summarize",
                    text: "Long text to summarize for testing.",
                });

            expect(res.status).toBe(200);
            expect(res.body.data.result).toContain("Mocked AI response");
        });

        it("executes explain operation", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/utilities/completion")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    operation: "explain",
                    concept: "RAG",
                });

            expect(res.status).toBe(200);
            expect(res.body.data.result).toContain("Mocked AI response");
        });

        it("executes translate operation", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/utilities/completion")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    operation: "translate",
                    text: "Hello world",
                    targetLang: "vi",
                });

            expect(res.status).toBe(200);
            expect(res.body.data.result).toContain("Mocked AI response");
        });

        it("executes search operation", async () => {
            documentPageFindManyMock.mockResolvedValue([
                {
                    heading: "OAuth Guide",
                    pageUrl: "https://docs.example.com/oauth",
                    chatSource: { heading: "Auth Docs" },
                },
            ]);

            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/utilities/completion")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    operation: "search",
                    query: "oauth",
                });

            expect(res.status).toBe(200);
            expect(res.body.data.results).toHaveLength(1);
            expect(res.body.data.results[0].title).toBe("OAuth Guide");
        });
    });
});
