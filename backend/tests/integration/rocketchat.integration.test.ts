import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";

const userFindFirstMock = vi.fn();
const userCreateMock = vi.fn();
const chatFindFirstMock = vi.fn();
const chatCreateMock = vi.fn();
const chatUpdateMock = vi.fn();
const chatSourceFindManyMock = vi.fn();
const chatSourceFindUniqueMock = vi.fn();
const chatSourceCreateMock = vi.fn();
const chatSourceDeleteMock = vi.fn();
const chatSourceCountMock = vi.fn();
const documentPageCreateManyMock = vi.fn();
const documentPageFindManyMock = vi.fn();
const usageEventsAggregateMock = vi.fn();
const usageEventsCreateMock = vi.fn();
const auditEventCreateMock = vi.fn();
const chatMessageCreateMock = vi.fn();
const chatMessageFindUniqueMock = vi.fn();
const chatMessageSourceCreateManyMock = vi.fn();

const qdrantCreateCollectionMock = vi.fn().mockResolvedValue({});
const qdrantUpsertMock = vi.fn().mockResolvedValue({});
const qdrantQueryMock = vi.fn().mockResolvedValue({ points: [] });
const qdrantDeleteCollectionMock = vi.fn().mockResolvedValue({});

vi.mock("../../utils/ragClients.js", () => ({
    qdrant: {
        createCollection: (...args: any[]) => qdrantCreateCollectionMock(...args),
        upsert: (...args: any[]) => qdrantUpsertMock(...args),
        query: (...args: any[]) => qdrantQueryMock(...args),
        deleteCollection: (...args: any[]) => qdrantDeleteCollectionMock(...args),
    },
    treeindex: {},
}));

const generateVectorEmbeddingsMock = vi.fn();
vi.mock("../../utils/ragUtilities.js", async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return {
        ...actual,
        generateVectorEmbeddings: (...args: any[]) => generateVectorEmbeddingsMock(...args),
    };
});

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
            findUnique: (...args: any[]) => chatSourceFindUniqueMock(...args),
            create: (...args: any[]) => chatSourceCreateMock(...args),
            delete: (...args: any[]) => chatSourceDeleteMock(...args),
            count: (...args: any[]) => chatSourceCountMock(...args),
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
            findUnique: (...args: any[]) => chatMessageFindUniqueMock(...args),
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
        chatSourceFindUniqueMock.mockReset();
        chatSourceCreateMock.mockReset();
        chatSourceDeleteMock.mockReset();
        chatSourceCountMock.mockReset().mockResolvedValue(0);
        documentPageCreateManyMock.mockReset();
        documentPageFindManyMock.mockReset();
        usageEventsAggregateMock.mockReset();
        usageEventsCreateMock.mockReset();
        auditEventCreateMock.mockReset();
        chatMessageCreateMock.mockReset();
        chatMessageFindUniqueMock.mockReset();
        chatMessageSourceCreateManyMock.mockReset();
        qdrantCreateCollectionMock.mockReset().mockResolvedValue({});
        qdrantUpsertMock.mockReset().mockResolvedValue({});
        qdrantQueryMock.mockReset().mockResolvedValue({ points: [] });
        qdrantDeleteCollectionMock.mockReset().mockResolvedValue({});
        generateVectorEmbeddingsMock.mockReset().mockImplementation(async (texts: string | string[]) => {
            if (Array.isArray(texts)) {
                return texts.map(() => new Array(1536).fill(0.1));
            }
            return new Array(1536).fill(0.1);
        });
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

    describe("GET /sources", () => {
        it("returns formatted sources list filtered by workspace and room", async () => {
            chatSourceFindManyMock.mockResolvedValue([
                {
                    id: "source-1",
                    heading: "guide.md",
                    documentationUrl: "rocketchat://default/room-1/guide.md",
                    totalPages: 5,
                    createdAt: new Date("2026-09-01T00:00:00.000Z"),
                    lastIndexedAt: new Date("2026-09-01T00:00:00.000Z"),
                    _count: { pagesIndexed: 5 },
                },
            ]);

            const app = buildTestApp();
            const res = await request(app)
                .get("/api/v1/integrations/rocketchat/sources?workspaceId=default&roomId=room-1")
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(200);
            expect(res.body.data.sources).toHaveLength(1);
            expect(res.body.data.sources[0]).toEqual({
                id: "source-1",
                filename: "guide.md",
                documentationUrl: "rocketchat://default/room-1/guide.md",
                chunksCount: 5,
                totalPages: 5,
                createdAt: "2026-09-01T00:00:00.000Z",
                lastIndexedAt: "2026-09-01T00:00:00.000Z",
                status: "ACTIVE",
            });
            expect(chatSourceFindManyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.arrayContaining([
                            expect.objectContaining({
                                rocketchatWorkspaceId: "default",
                                rocketchatRoomId: "room-1",
                            }),
                        ]),
                    }),
                }),
            );
        });
    });

    describe("DELETE /sources/:id", () => {
        const validSourceId = "a0000000-0000-4000-8000-000000000001";

        it("returns 400 when workspaceId or roomId is missing in room mode", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .delete(`/api/v1/integrations/rocketchat/sources/${validSourceId}`)
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(400);
        });

        it("returns 404 if source is not found", async () => {
            chatSourceFindUniqueMock.mockResolvedValue(null);

            const app = buildTestApp();
            const res = await request(app)
                .delete(`/api/v1/integrations/rocketchat/sources/${validSourceId}?workspaceId=default&roomId=room-1`)
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(404);
            expect(res.body.message).toMatch(/Source not found/i);
        });

        it("returns 403 if source does not belong to specified room", async () => {
            chatSourceFindUniqueMock.mockResolvedValue({
                id: validSourceId,
                rocketchatWorkspaceId: "default",
                rocketchatRoomId: "other-room",
                documentationUrl: "rocketchat://default/other-room/doc.md",
                collectionName: "rc_123",
            });

            const app = buildTestApp();
            const res = await request(app)
                .delete(`/api/v1/integrations/rocketchat/sources/${validSourceId}?workspaceId=default&roomId=room-1`)
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(403);
        });

        it("deletes source and cleans up Qdrant collection when no other source shares collection", async () => {
            chatSourceFindUniqueMock.mockResolvedValue({
                id: validSourceId,
                rocketchatWorkspaceId: "default",
                rocketchatRoomId: "room-1",
                documentationUrl: "rocketchat://default/room-1/doc.md",
                collectionName: "rc_test_collection",
            });
            chatSourceCountMock.mockResolvedValue(0);
            qdrantDeleteCollectionMock.mockResolvedValue({});
            chatSourceDeleteMock.mockResolvedValue({ id: validSourceId });

            const app = buildTestApp();
            const res = await request(app)
                .delete(`/api/v1/integrations/rocketchat/sources/${validSourceId}?workspaceId=default&roomId=room-1`)
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({
                id: validSourceId,
                deleted: true,
                vectorsRemoved: true,
                qdrant: { deleted: true },
            });
            expect(qdrantDeleteCollectionMock).toHaveBeenCalledWith("rc_test_collection", { timeout: 60000 });
            expect(chatSourceDeleteMock).toHaveBeenCalledWith({ where: { id: validSourceId } });
        });

        it("does not delete Qdrant collection if another source shares it", async () => {
            chatSourceFindUniqueMock.mockResolvedValue({
                id: validSourceId,
                rocketchatWorkspaceId: "default",
                rocketchatRoomId: "room-1",
                documentationUrl: "rocketchat://default/room-1/doc.md",
                collectionName: "rc_shared_collection",
            });
            chatSourceCountMock.mockResolvedValue(1);
            chatSourceDeleteMock.mockResolvedValue({ id: validSourceId });

            const app = buildTestApp();
            const res = await request(app)
                .delete(`/api/v1/integrations/rocketchat/sources/${validSourceId}?workspaceId=default&roomId=room-1`)
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(200);
            expect(res.body.data.deleted).toBe(true);
            expect(res.body.data.vectorsRemoved).toBe(false);
            expect(qdrantDeleteCollectionMock).not.toHaveBeenCalled();
            expect(chatSourceDeleteMock).toHaveBeenCalledWith({ where: { id: validSourceId } });
        });
    });

    describe("POST /feedback", () => {
        const validMsgId = "a0000000-0000-4000-8000-000000000002";

        it("validates required fields", async () => {
            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/feedback")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    rating: "positive",
                    // missing rocketUserId
                });

            expect(res.status).toBe(400);
        });

        it("successfully records feedback and writes audit log", async () => {
            userFindFirstMock.mockResolvedValue({ id: "user-feedback-1" });
            chatMessageFindUniqueMock.mockResolvedValue({ id: validMsgId, chatId: "chat-feedback-1" });
            auditEventCreateMock.mockResolvedValue({ id: "audit-1" });

            const app = buildTestApp();
            const res = await request(app)
                .post("/api/v1/integrations/rocketchat/feedback")
                .set("Authorization", "Bearer test-secret-token")
                .send({
                    workspaceId: "team-ws",
                    rocketUserId: "u777",
                    roomId: "GENERAL",
                    chatMessageId: validMsgId,
                    rating: "positive",
                    feedbackText: "Great and accurate answer!",
                });

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({
                recorded: true,
                rating: "positive",
                chatMessageId: validMsgId,
            });

            expect(auditEventCreateMock).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    type: "rocketchat.feedback",
                    userId: "user-feedback-1",
                    chatId: "chat-feedback-1",
                    metadata: expect.objectContaining({
                        rocketUserId: "u777",
                        rating: "positive",
                        feedbackText: "Great and accurate answer!",
                    }),
                }),
            });
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

            expect(qdrantCreateCollectionMock).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    vectors: { size: 1536, distance: "Cosine" },
                }),
            );

            expect(generateVectorEmbeddingsMock).toHaveBeenCalled();
            expect(qdrantUpsertMock).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    wait: true,
                    points: expect.arrayContaining([
                        expect.objectContaining({
                            id: expect.any(String),
                            vector: expect.any(Array),
                            payload: expect.objectContaining({
                                url: "rocketchat://team-ws/ROOM_TECH/architecture.md",
                                title: "architecture.md",
                                chatSourceId: "source-scoped",
                            }),
                        }),
                    ]),
                }),
            );
            expect(documentPageCreateManyMock).toHaveBeenCalled();
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
