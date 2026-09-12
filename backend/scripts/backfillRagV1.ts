import { readFile, writeFile } from "node:fs/promises";
import prisma from "../utils/prismaClient.js";
import { qdrant } from "../utils/ragClients.js";
import { generateVectorEmbeddings, getEmbeddingDimensionsForModel } from "../utils/ragUtilities.js";
import { config } from "../config/runtime.js";
import { createRagScope } from "../rag/types.js";
import { indexRagDocumentV1 } from "../rag/ingestion.js";

export interface BackfillCheckpoint { completed: Record<string, { versionHash: string; status: "completed" | "skipped" | "failed"; reason?: string }> }

export function createEmptyBackfillCheckpoint(): BackfillCheckpoint { return { completed: {} }; }

async function loadCheckpoint(path: string): Promise<BackfillCheckpoint> {
    try { return JSON.parse(await readFile(path, "utf8")) as BackfillCheckpoint; }
    catch { return createEmptyBackfillCheckpoint(); }
}

export async function runBackfill(options: { checkpointPath: string; limit?: number }): Promise<BackfillCheckpoint> {
    const checkpoint = await loadCheckpoint(options.checkpointPath);
    const sources = await prisma.chatSource.findMany({
        where: { collectionName: { not: null } },
        include: { chats: { select: { id: true }, take: 1 } },
        take: options.limit,
        orderBy: { createdAt: "asc" },
    });
    const model = config.llm.embeddingModel;
    const dimensions = getEmbeddingDimensionsForModel(model);
    for (const source of sources) {
        if (checkpoint.completed[source.id]?.status === "completed") continue;
        try {
            const scroll = await qdrant.scroll(source.collectionName!, { limit: 10000, with_payload: true, with_vector: true });
            const points = Array.isArray(scroll?.points) ? scroll.points : [];
            const bodies: string[] = points.map((point: any) => String(point.payload?.body || point.payload?.content || "").trim()).filter((body: string) => Boolean(body));
            if (!bodies.length) {
                checkpoint.completed[source.id] = { versionHash: "", status: "skipped", reason: "legacy collection has no payload bodies" };
                continue;
            }
            const scope = source.rocketchatRoomId
                ? createRagScope({ kind: "rocketchat", workspaceId: source.rocketchatWorkspaceId, roomId: source.rocketchatRoomId, threadId: source.rocketchatThreadId })
                : source.chats[0] ? createRagScope({ kind: "web", chatId: source.chats[0].id }) : null;
            if (!scope) {
                checkpoint.completed[source.id] = { versionHash: "", status: "skipped", reason: "source has no recoverable scope" };
                continue;
            }
            const embeddings = await generateVectorEmbeddings(bodies, { model, dimensions }) as number[][];
            const result = await indexRagDocumentV1({
                sourceId: source.id,
                sourceUrl: source.documentationUrl,
                filename: source.heading,
                documentType: "legacy",
                content: bodies.join("\n\n"),
                embeddingModel: model,
                dimensions,
                indexVersion: config.rag.indexVersion,
                scope,
                chunks: bodies.map((body, index) => ({ content: body, locator: `legacy:${index}`, metadata: { legacyPointId: points[index]?.id } })),
                embeddings,
            }, { prisma, qdrant });
            checkpoint.completed[source.id] = { versionHash: result.versionHash, status: "completed" };
        } catch (error) {
            checkpoint.completed[source.id] = { versionHash: "", status: "failed", reason: error instanceof Error ? error.message : String(error) };
        }
        await writeFile(options.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");
    }
    await writeFile(options.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");
    return checkpoint;
}

if (process.argv[1]?.endsWith("backfillRagV1.ts")) {
    const checkpointPath = process.env.RAG_BACKFILL_CHECKPOINT || "./rag-v1-backfill.checkpoint.json";
    const limitArg = process.env.RAG_BACKFILL_LIMIT;
    runBackfill({ checkpointPath, limit: limitArg ? Number(limitArg) : undefined })
        .then((checkpoint) => console.log(`RAG v1 backfill finished: ${Object.keys(checkpoint.completed).length} sources checkpointed`))
        .catch((error) => { console.error(error); process.exitCode = 1; });
}
