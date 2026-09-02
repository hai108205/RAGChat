import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
    normalizeWorkspaceId,
    normalizeRoomId,
    normalizeThreadId,
    buildRocketChatScopeKey,
    buildRocketChatChatName,
    buildRocketChatDocumentationUrl,
    parseRocketChatDocumentationUrl,
    buildChatSourceScopeWhere,
    buildStatsScopeWhere,
    verifySourceDeletionScope,
    verifyFeedbackScope,
} from "../utils/rocketchatScope.js";
import {
    parseRocketChatChatName,
    runBackfillRocketChatScope,
} from "../scripts/backfillRocketChatScope.js";
import { getOrCreateRocketChatChat } from "../utils/rocketchatIdentity.js";

// Mock Prisma for integration tests
const chatUpsertMock = vi.fn();
const chatFindUniqueMock = vi.fn();
const chatFindFirstMock = vi.fn();
const chatFindManyMock = vi.fn();
const chatCreateMock = vi.fn();
const chatUpdateMock = vi.fn();
const chatDeleteMock = vi.fn();
const chatSourceFindManyMock = vi.fn();
const chatSourceFindUniqueMock = vi.fn();
const chatSourceCreateMock = vi.fn();
const chatSourceDeleteMock = vi.fn();
const chatSourceCountMock = vi.fn();
const chatMessageFindUniqueMock = vi.fn();
const chatMessageUpdateManyMock = vi.fn();
const usageEventsAggregateMock = vi.fn();
const usageEventsUpdateManyMock = vi.fn();
const auditEventCreateMock = vi.fn();
const auditEventUpdateManyMock = vi.fn();
const ingestionRunUpdateManyMock = vi.fn();
const userFindFirstMock = vi.fn();
const userCreateMock = vi.fn();

vi.mock("../utils/prismaClient.js", () => ({
    default: {
        chat: {
            upsert: (...args: any[]) => chatUpsertMock(...args),
            findUnique: (...args: any[]) => chatFindUniqueMock(...args),
            findFirst: (...args: any[]) => chatFindFirstMock(...args),
            findMany: (...args: any[]) => chatFindManyMock(...args),
            create: (...args: any[]) => chatCreateMock(...args),
            update: (...args: any[]) => chatUpdateMock(...args),
            delete: (...args: any[]) => chatDeleteMock(...args),
        },
        chatSource: {
            findMany: (...args: any[]) => chatSourceFindManyMock(...args),
            findUnique: (...args: any[]) => chatSourceFindUniqueMock(...args),
            create: (...args: any[]) => chatSourceCreateMock(...args),
            delete: (...args: any[]) => chatSourceDeleteMock(...args),
            count: (...args: any[]) => chatSourceCountMock(...args),
        },
        chatMessage: {
            findUnique: (...args: any[]) => chatMessageFindUniqueMock(...args),
            updateMany: (...args: any[]) => chatMessageUpdateManyMock(...args),
        },
        usageEvents: {
            aggregate: (...args: any[]) => usageEventsAggregateMock(...args),
            updateMany: (...args: any[]) => usageEventsUpdateManyMock(...args),
        },
        auditEvent: {
            create: (...args: any[]) => auditEventCreateMock(...args),
            updateMany: (...args: any[]) => auditEventUpdateManyMock(...args),
        },
        ingestionRun: {
            updateMany: (...args: any[]) => ingestionRunUpdateManyMock(...args),
        },
        user: {
            findFirst: (...args: any[]) => userFindFirstMock(...args),
            create: (...args: any[]) => userCreateMock(...args),
        },
    },
}));

vi.mock("../utils/ragClients.js", () => ({
    qdrant: {
        createCollection: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
        query: vi.fn().mockResolvedValue({ points: [] }),
        deleteCollection: vi.fn().mockResolvedValue({}),
    },
}));

const { default: rocketchatRouter } = await import(
    "../routers/rocketchatIntegration.route.js"
);

function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/integrations/rocketchat", rocketchatRouter);
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
            statusCode,
            success: false,
            data: null,
            message: err.message,
            errors: err.errors || [],
        });
    });
    return app;
}

describe("Rocket.Chat Scope Policy & Isolation", () => {
    beforeEach(() => {
        process.env.ROCKETCHAT_INTEGRATION_TOKEN = "test-secret-token";
        process.env.ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV = "false";
        chatUpsertMock.mockReset();
        chatFindUniqueMock.mockReset();
        chatFindFirstMock.mockReset();
        chatFindManyMock.mockReset().mockResolvedValue([]);
        chatCreateMock.mockReset();
        chatUpdateMock.mockReset();
        chatDeleteMock.mockReset();
        chatSourceFindManyMock.mockReset().mockResolvedValue([]);
        chatSourceFindUniqueMock.mockReset();
        chatSourceCreateMock.mockReset();
        chatSourceDeleteMock.mockReset();
        chatSourceCountMock.mockReset().mockResolvedValue(0);
        chatMessageFindUniqueMock.mockReset();
        chatMessageUpdateManyMock.mockReset();
        usageEventsAggregateMock.mockReset().mockResolvedValue({ _sum: { inputTokens: 0, outputTokens: 0 } });
        usageEventsUpdateManyMock.mockReset();
        auditEventCreateMock.mockReset();
        auditEventUpdateManyMock.mockReset();
        ingestionRunUpdateManyMock.mockReset();
        userFindFirstMock.mockReset().mockResolvedValue({ id: "user-1" });
        userCreateMock.mockReset();
    });

    describe("Normalization and Scope Keys", () => {
        it("normalizes workspace, room, and thread identifiers", () => {
            expect(normalizeWorkspaceId("")).toBe("default");
            expect(normalizeWorkspaceId(null)).toBe("default");
            expect(normalizeWorkspaceId("  ws-prod  ")).toBe("ws-prod");

            expect(normalizeRoomId(" GENERAL ")).toBe("GENERAL");
            expect(normalizeRoomId(null)).toBe("");

            expect(normalizeThreadId("")).toBeNull();
            expect(normalizeThreadId(null)).toBeNull();
            expect(normalizeThreadId("  thread-123  ")).toBe("thread-123");
        });

        it("constructs canonical concurrency-safe scope key", () => {
            const key1 = buildRocketChatScopeKey({
                userId: "u-100",
                workspaceId: "ws-1",
                roomId: "room-a",
                threadId: "th-1",
            });
            expect(key1).toBe("rc_scope:u-100:ws-1:room-a:th-1");

            const key2 = buildRocketChatScopeKey({
                userId: "u-100",
                workspaceId: null,
                roomId: "room-a",
                threadId: null,
            });
            expect(key2).toBe("rc_scope:u-100:default:room-a:");
        });

        it("constructs standard chat name", () => {
            expect(
                buildRocketChatChatName({
                    workspaceId: "ws-1",
                    roomId: "room-a",
                    threadId: "th-1",
                }),
            ).toBe("RC_ws-1_Room_room-a_Thread_th-1");

            expect(
                buildRocketChatChatName({
                    workspaceId: null,
                    roomId: "room-a",
                    threadId: null,
                }),
            ).toBe("RC_default_Room_room-a");
        });
    });

    describe("Documentation URL Format & Parsing", () => {
        it("builds collision-free modern rocketchat documentation URLs", () => {
            const url = buildRocketChatDocumentationUrl({
                workspaceId: "ws-1",
                roomId: "room-a",
                threadId: "th-1",
                sourceId: "src-uuid-123",
                filename: "quarterly report.pdf",
            });
            expect(url).toBe("rocketchat://ws-1/room-a/th-1/src-uuid-123/quarterly%20report.pdf");

            const roomUrl = buildRocketChatDocumentationUrl({
                workspaceId: "ws-1",
                roomId: "room-a",
                threadId: null,
                sourceId: "src-uuid-456",
                filename: "notes.txt",
            });
            expect(roomUrl).toBe("rocketchat://ws-1/room-a/_room/src-uuid-456/notes.txt");
        });

        it("parses modern rocketchat URLs", () => {
            const parsed = parseRocketChatDocumentationUrl(
                "rocketchat://ws-1/room-a/th-1/src-uuid-123/quarterly%20report.pdf",
            );
            expect(parsed).toEqual({
                workspaceId: "ws-1",
                roomId: "room-a",
                threadId: "th-1",
                sourceId: "src-uuid-123",
                filename: "quarterly report.pdf",
                isLegacy: false,
            });

            const parsedRoom = parseRocketChatDocumentationUrl(
                "rocketchat://ws-1/room-a/_room/src-uuid-456/notes.txt",
            );
            expect(parsedRoom).toEqual({
                workspaceId: "ws-1",
                roomId: "room-a",
                threadId: null,
                sourceId: "src-uuid-456",
                filename: "notes.txt",
                isLegacy: false,
            });
        });

        it("parses legacy rocketchat URLs with backward compatibility", () => {
            const legacy3 = parseRocketChatDocumentationUrl("rocketchat://default/GENERAL/guide.md");
            expect(legacy3).toEqual({
                workspaceId: "default",
                roomId: "GENERAL",
                threadId: null,
                sourceId: null,
                filename: "guide.md",
                isLegacy: true,
            });

            const legacy4 = parseRocketChatDocumentationUrl("rocketchat://ws-1/room-a/thread-99/guide.md");
            expect(legacy4).toEqual({
                workspaceId: "ws-1",
                roomId: "room-a",
                threadId: "thread-99",
                sourceId: null,
                filename: "guide.md",
                isLegacy: true,
            });
        });
    });

    describe("2 Workspaces x 2 Rooms x 2 Threads Scope Isolation Matrix", () => {
        // Dataset simulation
        const mockDatabaseSources = [
            // Workspace 1 (ws-alpha)
            // Room 1 (room-a)
            { id: "s-wa-ra-root", rocketchatWorkspaceId: "ws-alpha", rocketchatRoomId: "room-a", rocketchatThreadId: null, heading: "wa-ra-root.md" },
            { id: "s-wa-ra-t1", rocketchatWorkspaceId: "ws-alpha", rocketchatRoomId: "room-a", rocketchatThreadId: "th-1", heading: "wa-ra-t1.md" },
            { id: "s-wa-ra-t2", rocketchatWorkspaceId: "ws-alpha", rocketchatRoomId: "room-a", rocketchatThreadId: "th-2", heading: "wa-ra-t2.md" },
            // Room 2 (room-b)
            { id: "s-wa-rb-root", rocketchatWorkspaceId: "ws-alpha", rocketchatRoomId: "room-b", rocketchatThreadId: null, heading: "wa-rb-root.md" },
            { id: "s-wa-rb-t1", rocketchatWorkspaceId: "ws-alpha", rocketchatRoomId: "room-b", rocketchatThreadId: "th-1", heading: "wa-rb-t1.md" },
            { id: "s-wa-rb-t2", rocketchatWorkspaceId: "ws-alpha", rocketchatRoomId: "room-b", rocketchatThreadId: "th-2", heading: "wa-rb-t2.md" },

            // Workspace 2 (ws-beta)
            // Room 1 (room-a)
            { id: "s-wb-ra-root", rocketchatWorkspaceId: "ws-beta", rocketchatRoomId: "room-a", rocketchatThreadId: null, heading: "wb-ra-root.md" },
            { id: "s-wb-ra-t1", rocketchatWorkspaceId: "ws-beta", rocketchatRoomId: "room-a", rocketchatThreadId: "th-1", heading: "wb-ra-t1.md" },
            { id: "s-wb-ra-t2", rocketchatWorkspaceId: "ws-beta", rocketchatRoomId: "room-a", rocketchatThreadId: "th-2", heading: "wb-ra-t2.md" },
            // Room 2 (room-b)
            { id: "s-wb-rb-root", rocketchatWorkspaceId: "ws-beta", rocketchatRoomId: "room-b", rocketchatThreadId: null, heading: "wb-rb-root.md" },
            { id: "s-wb-rb-t1", rocketchatWorkspaceId: "ws-beta", rocketchatRoomId: "room-b", rocketchatThreadId: "th-1", heading: "wb-rb-t1.md" },
            { id: "s-wb-rb-t2", rocketchatWorkspaceId: "ws-beta", rocketchatRoomId: "room-b", rocketchatThreadId: "th-2", heading: "wb-rb-t2.md" },
        ];

        function filterInMemory(where: any) {
            return mockDatabaseSources.filter((s) => {
                if (where.OR) {
                    return where.OR.some((clause: any) => {
                        if (clause.rocketchatWorkspaceId !== undefined && clause.rocketchatWorkspaceId !== s.rocketchatWorkspaceId) return false;
                        if (clause.rocketchatRoomId !== undefined && clause.rocketchatRoomId !== s.rocketchatRoomId) return false;
                        if (clause.rocketchatThreadId !== undefined && clause.rocketchatThreadId !== s.rocketchatThreadId) return false;
                        if (clause.OR) {
                            return clause.OR.some((sub: any) => {
                                if (sub.rocketchatThreadId === null && s.rocketchatThreadId === null) return true;
                                if (sub.rocketchatThreadId && sub.rocketchatThreadId === s.rocketchatThreadId) return true;
                                return false;
                            });
                        }
                        return true;
                    });
                }
                return true;
            });
        }

        it("room-only request sees ONLY room-level sources (threadId = null)", () => {
            const where = buildChatSourceScopeWhere({
                workspaceId: "ws-alpha",
                roomId: "room-a",
            });
            const matches = filterInMemory(where);
            const ids = matches.map((m) => m.id);

            expect(ids).toEqual(["s-wa-ra-root"]);
            expect(ids).not.toContain("s-wa-ra-t1");
            expect(ids).not.toContain("s-wa-ra-t2");
            expect(ids).not.toContain("s-wa-rb-root");
            expect(ids).not.toContain("s-wb-ra-root");
        });

        it("thread request sees room-level sources (threadId = null) + its specific thread sources", () => {
            const where = buildChatSourceScopeWhere({
                workspaceId: "ws-alpha",
                roomId: "room-a",
                threadId: "th-1",
            });
            const matches = filterInMemory(where);
            const ids = matches.map((m) => m.id);

            expect(ids).toContain("s-wa-ra-root");
            expect(ids).toContain("s-wa-ra-t1");
            expect(ids).not.toContain("s-wa-ra-t2"); // other thread in same room isolated!
            expect(ids).not.toContain("s-wa-rb-t1"); // other room in same ws isolated!
            expect(ids).not.toContain("s-wb-ra-t1"); // other workspace isolated!
        });

        it("different workspace queries are strictly isolated", () => {
            const where = buildChatSourceScopeWhere({
                workspaceId: "ws-beta",
                roomId: "room-b",
                threadId: "th-2",
            });
            const matches = filterInMemory(where);
            const ids = matches.map((m) => m.id);

            expect(ids).toEqual(["s-wb-rb-root", "s-wb-rb-t2"]);
            expect(ids).not.toContain("s-wa-rb-t2");
            expect(ids).not.toContain("s-wb-rb-t1");
            expect(ids).not.toContain("s-wb-ra-t2");
        });
    });

    describe("Concurrency Safety for getOrCreateRocketChatChat", () => {
        it("uses atomic upsert with rocketchatScopeKey", async () => {
            const expectedScopeKey = "rc_scope:user-concurrent:ws-prod:room-general:th-xyz";
            const mockChat = {
                id: "chat-conc-123",
                name: "RC_ws-prod_Room_room-general_Thread_th-xyz",
                rocketchatScopeKey: expectedScopeKey,
                chatSources: [],
            };

            chatUpsertMock.mockResolvedValue(mockChat);
            chatSourceFindManyMock.mockResolvedValue([]);

            const results = await Promise.all([
                getOrCreateRocketChatChat({
                    userId: "user-concurrent",
                    workspaceId: "ws-prod",
                    roomId: "room-general",
                    threadId: "th-xyz",
                }),
                getOrCreateRocketChatChat({
                    userId: "user-concurrent",
                    workspaceId: "ws-prod",
                    roomId: "room-general",
                    threadId: "th-xyz",
                }),
            ]);

            expect(results[0].id).toBe("chat-conc-123");
            expect(results[1].id).toBe("chat-conc-123");
            expect(chatUpsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { rocketchatScopeKey: expectedScopeKey },
                }),
            );
        });
    });

    describe("Pagination and Listing (/sources)", () => {
        it("returns sources with pagination nextCursor and hasMore", async () => {
            const mockSources = [
                {
                    id: "src-1",
                    heading: "doc1.md",
                    documentationUrl: "rocketchat://default/r1/_room/src-1/doc1.md",
                    totalPages: 2,
                    createdAt: new Date("2026-09-02T10:00:00Z"),
                    lastIndexedAt: new Date("2026-09-02T10:00:00Z"),
                    _count: { pagesIndexed: 2 },
                },
                {
                    id: "src-2",
                    heading: "doc2.md",
                    documentationUrl: "rocketchat://default/r1/_room/src-2/doc2.md",
                    totalPages: 3,
                    createdAt: new Date("2026-09-02T09:00:00Z"),
                    lastIndexedAt: new Date("2026-09-02T09:00:00Z"),
                    _count: { pagesIndexed: 3 },
                },
                {
                    id: "src-3",
                    heading: "doc3.md",
                    documentationUrl: "rocketchat://default/r1/_room/src-3/doc3.md",
                    totalPages: 1,
                    createdAt: new Date("2026-09-02T08:00:00Z"),
                    lastIndexedAt: new Date("2026-09-02T08:00:00Z"),
                    _count: { pagesIndexed: 1 },
                },
            ];

            // take = 2, so prisma returns 3 items (limit + 1)
            chatSourceFindManyMock.mockResolvedValue(mockSources);

            const app = buildTestApp();
            const res = await request(app)
                .get("/api/v1/integrations/rocketchat/sources?workspaceId=default&roomId=r1&limit=2")
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(200);
            expect(res.body.data.sources).toHaveLength(2);
            expect(res.body.data.hasMore).toBe(true);
            expect(res.body.data.nextCursor).toBe("src-2");
        });

        it("handles last page with hasMore = false and nextCursor undefined", async () => {
            const mockSources = [
                {
                    id: "src-3",
                    heading: "doc3.md",
                    documentationUrl: "rocketchat://default/r1/_room/src-3/doc3.md",
                    totalPages: 1,
                    createdAt: new Date("2026-09-02T08:00:00Z"),
                    lastIndexedAt: new Date("2026-09-02T08:00:00Z"),
                    _count: { pagesIndexed: 1 },
                },
            ];

            chatSourceFindManyMock.mockResolvedValue(mockSources);

            const app = buildTestApp();
            const res = await request(app)
                .get("/api/v1/integrations/rocketchat/sources?workspaceId=default&roomId=r1&limit=2&cursor=src-2")
                .set("Authorization", "Bearer test-secret-token");

            expect(res.status).toBe(200);
            expect(res.body.data.sources).toHaveLength(1);
            expect(res.body.data.hasMore).toBe(false);
            expect(res.body.data.nextCursor).toBeUndefined();
        });
    });

    describe("Delete & Feedback Scope Verification", () => {
        it("rejects deletion of source from different room or workspace", () => {
            const source = {
                rocketchatWorkspaceId: "ws-alpha",
                rocketchatRoomId: "room-a",
                documentationUrl: "rocketchat://ws-alpha/room-a/_room/s1/doc.md",
            };

            // Cross-room deletion attempt
            expect(() =>
                verifySourceDeletionScope(source, {
                    workspaceId: "ws-alpha",
                    roomId: "room-b",
                }),
            ).toThrow(/does not belong to the specified workspace and room/i);

            // Cross-workspace deletion attempt
            expect(() =>
                verifySourceDeletionScope(source, {
                    workspaceId: "ws-beta",
                    roomId: "room-a",
                }),
            ).toThrow(/does not belong to the specified workspace and room/i);

            // Authorized deletion
            expect(() =>
                verifySourceDeletionScope(source, {
                    workspaceId: "ws-alpha",
                    roomId: "room-a",
                }),
            ).not.toThrow();
        });

        it("rejects feedback when chat message belongs to another workspace or room", () => {
            const chat = {
                rocketchatWorkspaceId: "ws-alpha",
                rocketchatRoomId: "room-a",
                name: "RC_ws-alpha_Room_room-a",
            };

            // Cross-room feedback attempt
            expect(() =>
                verifyFeedbackScope(chat, {
                    workspaceId: "ws-alpha",
                    roomId: "room-b",
                }),
            ).toThrow(/does not belong to the specified room/i);

            // Cross-workspace feedback attempt
            expect(() =>
                verifyFeedbackScope(chat, {
                    workspaceId: "ws-beta",
                    roomId: "room-a",
                }),
            ).toThrow(/does not belong to the specified workspace/i);

            // Authorized feedback
            expect(() =>
                verifyFeedbackScope(chat, {
                    workspaceId: "ws-alpha",
                    roomId: "room-a",
                }),
            ).not.toThrow();
        });
    });

    describe("Backfill & Reconciliation Script", () => {
        it("parses legacy chat names correctly", () => {
            expect(parseRocketChatChatName("RC_default_Room_GENERAL")).toEqual({
                workspaceId: "default",
                roomId: "GENERAL",
                threadId: null,
            });

            expect(parseRocketChatChatName("RC_ws1_Room_roomA_Thread_th99")).toEqual({
                workspaceId: "ws1",
                roomId: "roomA",
                threadId: "th99",
            });

            expect(parseRocketChatChatName("Standard Web Chat")).toBeNull();
        });

        it("reconciles duplicate chats and relinks relations to canonical oldest chat", async () => {
            const mockChats = [
                {
                    id: "chat-oldest",
                    userId: "u-1",
                    name: "RC_default_Room_GENERAL",
                    createdAt: new Date("2026-08-01T00:00:00Z"),
                    chatSources: [{ id: "src-1" }],
                },
                {
                    id: "chat-duplicate-1",
                    userId: "u-1",
                    name: "RC_default_Room_GENERAL",
                    createdAt: new Date("2026-08-02T00:00:00Z"),
                    chatSources: [{ id: "src-2" }],
                },
            ];

            const mockSources = [
                {
                    id: "src-legacy",
                    documentationUrl: "rocketchat://ws-prod/finance/budget.xlsx",
                    rocketchatWorkspaceId: null,
                    rocketchatRoomId: null,
                    rocketchatThreadId: null,
                },
            ];

            const mockPrisma = {
                chat: {
                    findMany: vi.fn().mockResolvedValue(mockChats),
                    update: vi.fn().mockResolvedValue({}),
                    delete: vi.fn().mockResolvedValue({}),
                },
                chatSource: {
                    findMany: vi.fn().mockResolvedValue(mockSources),
                    update: vi.fn().mockResolvedValue({}),
                },
                chatMessage: {
                    updateMany: vi.fn().mockResolvedValue({ count: 2 }),
                },
                usageEvents: {
                    updateMany: vi.fn().mockResolvedValue({ count: 2 }),
                },
                auditEvent: {
                    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                },
                ingestionRun: {
                    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                },
            };

            const summary = await runBackfillRocketChatScope(mockPrisma);

            expect(summary.chatsProcessed).toBe(2);
            expect(summary.duplicateChatsReconciled).toBe(1);
            expect(summary.chatsUpdated).toBe(1);
            expect(summary.sourcesUpdated).toBe(1);

            // Verify ChatMessage relinked
            expect(mockPrisma.chatMessage.updateMany).toHaveBeenCalledWith({
                where: { chatId: "chat-duplicate-1" },
                data: { chatId: "chat-oldest" },
            });

            // Verify duplicate chat deleted
            expect(mockPrisma.chat.delete).toHaveBeenCalledWith({
                where: { id: "chat-duplicate-1" },
            });

            // Verify canonical updated with unique scope key
            expect(mockPrisma.chat.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "chat-oldest" },
                    data: expect.objectContaining({
                        rocketchatScopeKey: "rc_scope:u-1:default:GENERAL:",
                        rocketchatWorkspaceId: "default",
                        rocketchatRoomId: "GENERAL",
                    }),
                }),
            );

            // Verify legacy ChatSource backfilled
            expect(mockPrisma.chatSource.update).toHaveBeenCalledWith({
                where: { id: "src-legacy" },
                data: {
                    rocketchatWorkspaceId: "ws-prod",
                    rocketchatRoomId: "finance",
                    rocketchatThreadId: null,
                },
            });
        });
    });
});
