import { getRagCollectionName } from "./qdrantIndex.service.js";
import type { RagScope } from "./types.js";
import { buildChatSourceScopeWhere } from "../utils/rocketchatScope.js";

export interface RagV1SearchResult {
    title: string;
    snippet: string;
    pageUrl: string;
    relevance: number;
    metadata: Record<string, unknown>;
}

interface Manifest {
    id: string;
    chatSourceId: string;
    collectionName: string;
    embeddingModel: string;
    embeddingDimensions: number;
    versionHash: string;
    chatSource?: { heading: string; documentationUrl: string } | null;
}

export interface RagV1SearchDependencies {
    prisma: { ragDocument: { findMany: (args: any) => Promise<Manifest[]> } };
    embed: (query: string, options: { model: string; dimensions: number }) => Promise<number[] | number[][]>;
    qdrant: { query: (collection: string, request: any) => Promise<any> };
}

export interface RagV1SearchWithCoverage {
    results: RagV1SearchResult[];
    activeSourceIds: string[];
}

export function buildRagScopeFilter(scope: RagScope): Record<string, unknown> {
    if (scope.kind === "web") return { must: [{ key: "chatId", match: { value: scope.chatId } }] };
    const must = [
        { key: "workspaceId", match: { value: scope.workspaceId } },
        { key: "roomId", match: { value: scope.roomId } },
    ];
    if (scope.threadId) {
        return {
            must,
            should: [
                { key: "threadId", match: { value: scope.threadId } },
                { key: "threadId", match: { value: "" } },
            ],
        };
    }
    return { must: [...must, { key: "threadId", match: { value: "" } }] };
}

function score(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export async function searchRagV1(
    input: { query: string; scope: RagScope; indexVersion: string; embeddingModel: string; dimensions: number; limit: number; minScore?: number },
    deps: RagV1SearchDependencies,
): Promise<RagV1SearchWithCoverage> {
    const query = input.query.trim();
    if (!query) return { results: [], activeSourceIds: [] };

    const sourceWhere = input.scope.kind === "web"
        ? { chats: { some: { id: input.scope.chatId } } }
        : buildChatSourceScopeWhere({
            workspaceId: input.scope.workspaceId,
            roomId: input.scope.roomId,
            threadId: input.scope.threadId,
            mode: "room",
        });
    const manifests = await deps.prisma.ragDocument.findMany({
        where: {
            status: "ACTIVE",
            embeddingModel: input.embeddingModel,
            embeddingDimensions: input.dimensions,
            chatSource: sourceWhere,
        },
        include: { chatSource: { select: { heading: true, documentationUrl: true } } },
        orderBy: { activatedAt: "desc" },
    });
    if (manifests.length === 0) return { results: [], activeSourceIds: [] };

    const embeddingResult = await deps.embed(query, { model: input.embeddingModel, dimensions: input.dimensions });
    const vector = Array.isArray(embeddingResult[0]) ? (embeddingResult as number[][])[0] : embeddingResult as number[];
    if (vector.length !== input.dimensions) throw new Error("Query embedding dimensions do not match the RAG profile");
    const collection = getRagCollectionName(input.indexVersion, input.embeddingModel, input.dimensions);
    const response = await deps.qdrant.query(collection, {
        query: vector,
        limit: Math.max(input.limit, 1),
        with_payload: true,
        score_threshold: input.minScore ?? 0,
        filter: buildRagScopeFilter(input.scope),
    });
    // A source can have several ACTIVE manifests transiently while a re-index is
    // being migrated. The database query is newest-first, so retain only the
    // latest active version for each source and never surface stale chunks.
    const latestManifestBySource = new Map<string, Manifest>();
    for (const manifest of manifests) {
        if (!latestManifestBySource.has(manifest.chatSourceId)) {
            latestManifestBySource.set(manifest.chatSourceId, manifest);
        }
    }
    const manifestById = new Map(
        [...latestManifestBySource.values()].map((manifest) => [manifest.id, manifest]),
    );
    const seen = new Set<string>();
    const results = (response?.points ?? []).flatMap((point: any) => {
        const payload = (point.payload ?? {}) as Record<string, any>;
        const manifest = manifestById.get(payload.documentId);
        if (!manifest || seen.has(point.id)) return [];
        seen.add(point.id);
        return [{
            title: payload.title || payload.filename || manifest.chatSource?.heading || "Document",
            snippet: payload.body || payload.content || "",
            pageUrl: payload.sourceUrl || payload.url || manifest.chatSource?.documentationUrl || "",
            relevance: score(point.score),
            metadata: {
                retrievalMode: "rag_v1",
                sourceId: manifest.chatSourceId,
                documentId: manifest.id,
                chunkId: payload.chunkId || point.id,
                versionHash: manifest.versionHash,
                collectionName: collection,
                rawScore: point.score,
                locator: payload.locator,
                ...payload,
            },
        }];
    }).sort((a: RagV1SearchResult, b: RagV1SearchResult) => b.relevance - a.relevance).slice(0, input.limit);
    return { results, activeSourceIds: [...latestManifestBySource.keys()] };
}

export type LegacyFallbackReason = "V1_COVERAGE_GAP" | "V1_RUNTIME_FAILURE";

export function resolveLegacyReadDecision(input: {
    uncoveredSourceIds: readonly string[];
    dualReadEnabled: boolean;
    allowAvailabilityFallback: boolean;
    v1Failed?: boolean;
}): { shouldReadLegacy: boolean; reason?: LegacyFallbackReason } {
    if (input.v1Failed) {
        return input.allowAvailabilityFallback
            ? { shouldReadLegacy: true, reason: "V1_RUNTIME_FAILURE" }
            : { shouldReadLegacy: false };
    }
    return input.dualReadEnabled && input.uncoveredSourceIds.length > 0
        ? { shouldReadLegacy: true, reason: "V1_COVERAGE_GAP" }
        : { shouldReadLegacy: false };
}

export async function searchWebRagV1(
    input: { query: string; chatId: string; indexVersion: string; embeddingModel: string; dimensions: number; limit: number; minScore?: number },
    deps: RagV1SearchDependencies,
): Promise<RagV1SearchWithCoverage> {
    return searchRagV1({ ...input, scope: { kind: "web", chatId: input.chatId } }, deps);
}
