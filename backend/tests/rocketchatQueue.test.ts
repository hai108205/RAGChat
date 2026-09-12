/**
 * Tests for RocketChat integration queue (Task 5)
 *
 * Covers:
 * 1. Enqueue idempotency: duplicate (workspaceId, requestId, type) → isDuplicate=true, no second BullMQ add
 * 2. Job deduplication: DB unique constraint catch on P2002 → returns existing job ID
 * 3. Worker failure dispatch: processRocketChatJob updates DB status to FAILED and re-throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before imports that use the mocked modules
// ---------------------------------------------------------------------------

// Mock prisma client
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("../utils/prismaClient.js", () => ({
    default: {
        rocketChatIntegrationJob: {
            create: (...args: any[]) => mockCreate(...args),
            findUnique: (...args: any[]) => mockFindUnique(...args),
            updateMany: (...args: any[]) => mockUpdateMany(...args),
        },
    },
}));

// Mock BullMQ Queue — track add() calls
const mockQueueAdd = vi.fn().mockResolvedValue({ id: "bull-job-id" });
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

vi.mock("bullmq", () => {
    const MockQueue = function (this: any) {
        this.add = mockQueueAdd;
        this.close = mockQueueClose;
    };
    const MockWorker = function (this: any) {
        this.on = mockWorkerOn;
        this.close = mockWorkerClose;
    };
    return {
        Queue: MockQueue,
        Worker: MockWorker,
    };
});

// Mock redis client
vi.mock("../utils/redis.js", () => ({
    default: {
        on: vi.fn(),
        ping: vi.fn().mockResolvedValue("PONG"),
        quit: vi.fn().mockResolvedValue("OK"),
    },
}));

// Mock logger
vi.mock("../utils/logger.js", () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock notification dispatcher
vi.mock("../utils/notificationDispatcher.js", () => ({
    dispatchAlert: vi.fn().mockResolvedValue(undefined),
}));

// Mock processRocketChatChat and processRocketChatIngestion for worker tests
const mockProcessChat = vi.fn();
const mockProcessIngestion = vi.fn();

vi.mock("../services/rocketchatChat.service.js", () => ({
    processRocketChatChat: (...args: any[]) => mockProcessChat(...args),
}));

vi.mock("../services/rocketchatIngestion.service.js", () => ({
    processRocketChatIngestion: (...args: any[]) => mockProcessIngestion(...args),
}));

// ---------------------------------------------------------------------------
// Import modules under test (after mocks are registered)
// ---------------------------------------------------------------------------
import {
    enqueueRocketChatJob,
    getRocketChatJobId,
    closeRocketChatQueue,
    type RocketChatChatJobPayload,
} from "../utils/rocketchatQueue.js";
import { processRocketChatJob } from "../workers/rocketchatIntegrationWorker.js";
import type { Job } from "bullmq";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeChatPayload(overrides: Partial<RocketChatChatJobPayload> = {}): RocketChatChatJobPayload {
    return {
        workspaceId: "ws-test",
        rocketUserId: "rc-user-1",
        roomId: "room-abc",
        query: "What is RAGChat?",
        requestId: "req-unique-001",
        ...overrides,
    };
}

function makeDbJob(id: string = "db-job-id-1", status = "PENDING") {
    return { id, type: "chat", workspaceId: "ws-test", requestId: "req-unique-001", status };
}

function makeBullJob(overrides: Partial<Job> = {}): Job {
    return {
        id: "bull-job-id",
        name: "chat",
        data: {
            type: "chat",
            payload: makeChatPayload(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        ...overrides,
    } as unknown as Job;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RocketChat Queue — enqueueRocketChatJob", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset module-level singleton queue between tests
        // by closing and re-creating via the factory
        closeRocketChatQueue().catch(() => {});
    });

    afterEach(async () => {
        await closeRocketChatQueue().catch(() => {});
    });

    it("enqueues a new job and returns isDuplicate=false on first call", async () => {
        const dbJob = makeDbJob();
        mockCreate.mockResolvedValueOnce(dbJob);

        const result = await enqueueRocketChatJob("chat", makeChatPayload());

        expect(result.isDuplicate).toBe(false);
        expect(result.status).toBe("PENDING");
        expect(result.dbJobId).toBe(dbJob.id);
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockQueueAdd).toHaveBeenCalledTimes(1);

        // Verify deterministic job ID
        const expectedJobId = getRocketChatJobId("ws-test", "req-unique-001", "chat");
        expect(mockQueueAdd).toHaveBeenCalledWith(
            "chat",
            expect.objectContaining({ type: "chat" }),
            expect.objectContaining({ jobId: expectedJobId }),
        );
    });

    it("detects duplicate via P2002 unique constraint and returns isDuplicate=true without re-enqueuing", async () => {
        // First call creates normally
        const dbJob = makeDbJob();
        mockCreate.mockResolvedValueOnce(dbJob);
        await enqueueRocketChatJob("chat", makeChatPayload());
        mockQueueAdd.mockClear();

        // Second call simulates DB unique constraint violation (P2002)
        const p2002Error = new Error("Unique constraint failed on the fields: (`workspace_id`,`request_id`,`type`)");
        (p2002Error as any).code = "P2002";
        mockCreate.mockRejectedValueOnce(p2002Error);
        mockFindUnique.mockResolvedValueOnce(dbJob);

        const result = await enqueueRocketChatJob("chat", makeChatPayload());

        expect(result.isDuplicate).toBe(true);
        expect(result.dbJobId).toBe(dbJob.id);
        // BullMQ add must NOT be called for a duplicate
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("detects duplicate via 'duplicate key' error message when code is not set", async () => {
        const dbJob = makeDbJob();

        // Simulate a postgres duplicate key error without P2002 code
        const dupKeyError = new Error("duplicate key value violates unique constraint");
        mockCreate.mockRejectedValueOnce(dupKeyError);
        mockFindUnique.mockResolvedValueOnce(dbJob);

        const result = await enqueueRocketChatJob("chat", makeChatPayload());

        expect(result.isDuplicate).toBe(true);
        expect(mockQueueAdd).not.toHaveBeenCalled();
        expect(mockFindUnique).toHaveBeenCalledWith({
            where: {
                workspaceId_requestId_type: {
                    workspaceId: "ws-test",
                    requestId: "req-unique-001",
                    type: "chat",
                },
            },
        });
    });

    it("uses a deterministic jobId based on workspaceId, requestId, and type", () => {
        const id1 = getRocketChatJobId("ws-a", "req-123", "chat");
        const id2 = getRocketChatJobId("ws-a", "req-123", "chat");
        const id3 = getRocketChatJobId("ws-a", "req-123", "ingestion");
        const id4 = getRocketChatJobId("ws-b", "req-123", "chat");

        expect(id1).toBe(id2); // same inputs → same id
        expect(id1).not.toBe(id3); // different type → different id
        expect(id1).not.toBe(id4); // different workspace → different id
    });

    it("propagates non-duplicate DB errors", async () => {
        const networkError = new Error("DB connection refused");
        mockCreate.mockRejectedValueOnce(networkError);

        await expect(enqueueRocketChatJob("chat", makeChatPayload())).rejects.toThrow("DB connection refused");
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("supports ingestion job type correctly", async () => {
        const dbJob = makeDbJob("db-ingestion-job-1", "PENDING");
        (dbJob as any).type = "ingestion";
        mockCreate.mockResolvedValueOnce(dbJob);

        const payload = {
            workspaceId: "ws-test",
            rocketUserId: "rc-user-1",
            roomId: "room-abc",
            requestId: "req-unique-002",
            filename: "doc.pdf",
            contentBase64: "dGVzdA==",
        };

        const result = await enqueueRocketChatJob("ingestion", payload as any);

        expect(result.isDuplicate).toBe(false);
        const expectedJobId = getRocketChatJobId("ws-test", "req-unique-002", "ingestion");
        expect(mockQueueAdd).toHaveBeenCalledWith(
            "ingestion",
            expect.objectContaining({ type: "ingestion" }),
            expect.objectContaining({ jobId: expectedJobId }),
        );
    });
});

describe("RocketChat Queue — processRocketChatJob (worker)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateMany.mockResolvedValue({ count: 1 });
    });

    it("processes a 'chat' job and marks DB as COMPLETED on success", async () => {
        const chatResult = { answer: "Hello!", event: "chat_completed" };
        mockProcessChat.mockResolvedValueOnce(chatResult);

        const job = makeBullJob();
        const result = await processRocketChatJob(job);

        expect(mockProcessChat).toHaveBeenCalledWith(makeChatPayload());
        expect(result).toEqual(chatResult);

        // Should mark PROCESSING first, then COMPLETED
        const calls = mockUpdateMany.mock.calls;
        expect(calls[0][0].data.status).toBe("PROCESSING");
        expect(calls[1][0].data.status).toBe("COMPLETED");
    });

    it("processes an 'ingestion' job and marks DB as COMPLETED on success", async () => {
        const ingestionResult = { sourceId: "src-123", chunksCount: 42 };
        mockProcessIngestion.mockResolvedValueOnce(ingestionResult);

        const job = {
            ...makeBullJob(),
            name: "ingestion",
            data: {
                type: "ingestion",
                payload: {
                    workspaceId: "ws-test",
                    rocketUserId: "rc-user-1",
                    roomId: "room-abc",
                    requestId: "req-ing-001",
                    filename: "doc.txt",
                    contentBase64: "dGVzdA==",
                },
            },
        } as unknown as Job;

        const result = await processRocketChatJob(job);

        expect(mockProcessIngestion).toHaveBeenCalled();
        expect(result).toEqual(ingestionResult);

        const calls = mockUpdateMany.mock.calls;
        expect(calls[0][0].data.status).toBe("PROCESSING");
        expect(calls[1][0].data.status).toBe("COMPLETED");
    });

    it("marks DB as FAILED and re-throws when 'chat' processing throws", async () => {
        const chatError = new Error("LLM API timeout");
        mockProcessChat.mockRejectedValueOnce(chatError);

        const job = makeBullJob();
        await expect(processRocketChatJob(job)).rejects.toThrow("LLM API timeout");

        // Should have called updateMany with FAILED status
        const failedCall = mockUpdateMany.mock.calls.find(
            (call) => call[0]?.data?.status === "FAILED",
        );
        expect(failedCall).toBeDefined();
        expect(failedCall![0].data.error).toBe("LLM API timeout");
    });

    it("marks DB as FAILED and re-throws when 'ingestion' processing throws", async () => {
        const ingestionError = new Error("Qdrant unavailable");
        mockProcessIngestion.mockRejectedValueOnce(ingestionError);

        const job = {
            ...makeBullJob(),
            name: "ingestion",
            data: {
                type: "ingestion",
                payload: {
                    workspaceId: "ws-test",
                    rocketUserId: "rc-user-1",
                    roomId: "room-abc",
                    requestId: "req-ing-err",
                    filename: "doc.pdf",
                    contentBase64: "dGVzdA==",
                },
            },
        } as unknown as Job;

        await expect(processRocketChatJob(job)).rejects.toThrow("Qdrant unavailable");

        const failedCall = mockUpdateMany.mock.calls.find(
            (call) => call[0]?.data?.status === "FAILED",
        );
        expect(failedCall).toBeDefined();
    });

    it("throws for unknown job type", async () => {
        const job = {
            ...makeBullJob(),
            name: "unknown",
            data: { type: "unknown", payload: makeChatPayload() },
        } as unknown as Job;

        await expect(processRocketChatJob(job)).rejects.toThrow("Unknown job type: unknown");
    });
});
