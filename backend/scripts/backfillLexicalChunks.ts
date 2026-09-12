import { readFile, writeFile } from "node:fs/promises";
import defaultPrisma from "../utils/prismaClient.js";
import { qdrant as defaultQdrant } from "../utils/ragClients.js";
import { upsertLexicalChunks, type LexicalChunkInput } from "../rag/lexicalChunks.js";

export interface LexicalBackfillCheckpoint {
    completed: Record<string, {
        status: "completed" | "skipped" | "failed";
        chunkCount?: number;
        reason?: string;
    }>;
}

export function createEmptyBackfillCheckpoint(): LexicalBackfillCheckpoint {
    return { completed: {} };
}

async function loadCheckpoint(filePath: string): Promise<LexicalBackfillCheckpoint> {
    try {
        const raw = await readFile(filePath, "utf8");
        return JSON.parse(raw) as LexicalBackfillCheckpoint;
    } catch {
        return createEmptyBackfillCheckpoint();
    }
}

export interface RunLexicalBackfillOptions {
    checkpointPath: string;
    limit?: number;
    deps?: {
        prisma: any;
        qdrant: any;
    };
}

export interface LexicalBackfillResult {
    checkpoint: LexicalBackfillCheckpoint;
    summary: {
        totalSources: number;
        completed: number;
        skipped: number;
        failed: number;
        totalChunks: number;
    };
}

export async function runLexicalBackfill(
    options: RunLexicalBackfillOptions,
): Promise<LexicalBackfillResult> {
    const prisma = options.deps?.prisma ?? defaultPrisma;
    const qdrant = options.deps?.qdrant ?? defaultQdrant;
    const checkpoint = await loadCheckpoint(options.checkpointPath);

    const sources = await prisma.chatSource.findMany({
        where: {
            collectionName: { not: null },
        },
        take: options.limit,
        orderBy: { createdAt: "asc" },
    });

    let completed = 0;
    let skipped = 0;
    let failed = 0;
    let totalChunks = 0;

    for (const source of sources) {
        if (checkpoint.completed[source.id]?.status === "completed") {
            skipped++;
            continue;
        }

        const collectionName = source.collectionName?.trim();
        if (!collectionName) {
            checkpoint.completed[source.id] = {
                status: "skipped",
                reason: "missing collectionName",
            };
            skipped++;
            continue;
        }

        try {
            const scroll = await qdrant.scroll(collectionName, {
                limit: 10000,
                with_payload: true,
            });
            const points: any[] = Array.isArray(scroll?.points) ? scroll.points : [];

            const chunks: LexicalChunkInput[] = [];
            for (let index = 0; index < points.length; index++) {
                const pt = points[index];
                const payload = pt.payload || {};
                const body = String(payload.body || payload.content || payload.chunkText || "").trim();
                if (!body) continue;

                const chunkId = String(payload.chunkId || pt.id);
                chunks.push({
                    chatSourceId: source.id,
                    chunkId,
                    chunkIndex: typeof payload.chunkIndex === "number" ? payload.chunkIndex : index,
                    content: body,
                    contentHash: payload.contentHash,
                    locator: payload.locator || `chunk:${index}`,
                    heading: payload.heading || payload.title || source.heading,
                    pageUrl: payload.url || payload.pageUrl || payload.sourceUrl || source.documentationUrl,
                    documentId: payload.documentId,
                    versionHash: payload.versionHash,
                    metadata: payload,
                });
            }

            if (chunks.length === 0) {
                checkpoint.completed[source.id] = {
                    status: "skipped",
                    reason: "no valid chunk bodies found in collection",
                };
                skipped++;
                continue;
            }

            await upsertLexicalChunks(chunks, { prisma });
            checkpoint.completed[source.id] = {
                status: "completed",
                chunkCount: chunks.length,
            };
            completed++;
            totalChunks += chunks.length;
        } catch (error) {
            checkpoint.completed[source.id] = {
                status: "failed",
                reason: error instanceof Error ? error.message : String(error),
            };
            failed++;
        }

        await writeFile(options.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");
    }

    await writeFile(options.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");

    return {
        checkpoint,
        summary: {
            totalSources: sources.length,
            completed,
            skipped,
            failed,
            totalChunks,
        },
    };
}

if (process.argv[1]?.endsWith("backfillLexicalChunks.ts")) {
    const checkpointPath = process.env.RAG_LEXICAL_BACKFILL_CHECKPOINT || "./lexical-chunks-backfill.checkpoint.json";
    const limitArg = process.env.RAG_LEXICAL_BACKFILL_LIMIT;

    runLexicalBackfill({
        checkpointPath,
        limit: limitArg ? Number(limitArg) : undefined,
    })
        .then((result) => {
            console.log(
                `Lexical backfill completed: ${result.summary.completed} sources completed (${result.summary.totalChunks} chunks), ${result.summary.skipped} skipped, ${result.summary.failed} failed out of ${result.summary.totalSources} total.`,
            );
        })
        .catch((err) => {
            console.error("Lexical backfill failed with error:", err);
            process.exitCode = 1;
        });
}
