import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
    runLexicalBackfill,
    createEmptyBackfillCheckpoint,
    type LexicalBackfillCheckpoint,
} from "../../scripts/backfillLexicalChunks.js";

describe("Lexical Backfill Script", () => {
    let tempDir: string;
    let checkpointPath: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lexical-backfill-test-"));
        checkpointPath = path.join(tempDir, "checkpoint.json");
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    });

    it("creates an empty checkpoint structure", () => {
        expect(createEmptyBackfillCheckpoint()).toEqual({ completed: {} });
    });

    it("scrolls active collections and upserts lexical chunks idempotently", async () => {
        const mockSources = [
            {
                id: "source-1",
                heading: "Doc 1",
                documentationUrl: "https://doc1",
                collectionName: "col_1",
            },
        ];

        const mockPoints = [
            {
                id: "p-1",
                payload: {
                    chunkId: "c-1",
                    body: "First chunk of doc 1",
                    heading: "Section 1",
                    url: "https://doc1#sec1",
                },
            },
            {
                id: "p-2",
                payload: {
                    body: "Second chunk with no explicit chunkId",
                    content: "Second chunk with no explicit chunkId",
                },
            },
        ];

        const upsertMock = vi.fn().mockResolvedValue({ id: "rec" });
        const prisma = {
            chatSource: {
                findMany: vi.fn().mockResolvedValue(mockSources),
            },
            ragLexicalChunk: {
                upsert: upsertMock,
            },
        };

        const qdrant = {
            scroll: vi.fn().mockResolvedValue({ points: mockPoints }),
        };

        const result = await runLexicalBackfill({
            checkpointPath,
            deps: { prisma: prisma as any, qdrant: qdrant as any },
        });

        expect(result.summary.completed).toBe(1);
        expect(result.summary.totalChunks).toBe(2);
        expect(upsertMock).toHaveBeenCalledTimes(2);

        // Verify checkpoint file was written
        const savedCheckpoint: LexicalBackfillCheckpoint = JSON.parse(
            await fs.readFile(checkpointPath, "utf8"),
        );
        expect(savedCheckpoint.completed["source-1"]).toMatchObject({
            status: "completed",
            chunkCount: 2,
        });

        // Re-running with existing checkpoint should skip already completed source
        const rerunResult = await runLexicalBackfill({
            checkpointPath,
            deps: { prisma: prisma as any, qdrant: qdrant as any },
        });
        expect(rerunResult.summary.skipped).toBe(1);
        expect(upsertMock).toHaveBeenCalledTimes(2); // no additional calls
    });

    it("handles collection errors gracefully and records failure in checkpoint without crashing", async () => {
        const mockSources = [
            {
                id: "failing-source",
                heading: "Bad Doc",
                documentationUrl: "https://bad",
                collectionName: "bad_col",
            },
        ];

        const prisma = {
            chatSource: {
                findMany: vi.fn().mockResolvedValue(mockSources),
            },
            ragLexicalChunk: {
                upsert: vi.fn(),
            },
        };

        const qdrant = {
            scroll: vi.fn().mockRejectedValue(new Error("Qdrant collection not found")),
        };

        const result = await runLexicalBackfill({
            checkpointPath,
            deps: { prisma: prisma as any, qdrant: qdrant as any },
        });

        expect(result.summary.failed).toBe(1);
        expect(result.checkpoint.completed["failing-source"]).toMatchObject({
            status: "failed",
            reason: expect.stringContaining("collection not found"),
        });
    });
});
