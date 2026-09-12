import crypto from "crypto";
import prisma from "../utils/prismaClient.js";
import logger from "../utils/logger.js";
import { qdrant } from "../utils/ragClients.js";
import { ApiError } from "../utils/ApiError.js";
import { config } from "../config/runtime.js";
import {
    generateVectorEmbeddings,
    getEmbeddingDimensionsForModel,
} from "../utils/ragUtilities.js";
import {
    buildChatSourceScopeWhere,
    normalizeWorkspaceId,
    normalizeRoomId,
    normalizeThreadId,
    type RocketChatScopeFilter,
} from "../utils/rocketchatScope.js";
import { selectGroundedCandidates } from "../utils/retrievalQuality.js";
import { createRagScope } from "../rag/types.js";
import { resolveLegacyReadDecision, searchRagV1 } from "../rag/retrieval.js";
import { searchLexical, fuseRankingsRrf } from "../rag/lexicalRetrieval.js";

export interface ScopedVectorSearchInput {
    query: string;
    scope?: {
        workspaceId?: string | null;
        roomId?: string | null;
        threadId?: string | null;
        mode?: "room" | "global";
        allowGlobal?: boolean;
    };
    workspaceId?: string | null;
    roomId?: string | null;
    threadId?: string | null;
    limit?: number;
    topK?: number;
    searchMode?: "semantic" | "keyword" | "hybrid";
    similarityThreshold?: number;
    embeddingModel?: string | null;
    minScore?: number;
    mode?: "room" | "global";
    allowGlobal?: boolean;
    throwOnQdrantError?: boolean;
    fallbackToKeyword?: boolean;
    /** Restricts a migration legacy read to v1-uncovered source IDs. */
    legacySourceIds?: readonly string[];
    /** Internal guard used while reading the legacy index during migration. */
    __skipRagV1?: boolean;
}

export interface ScopedSearchResult {
    title: string;
    snippet: string;
    pageUrl: string;
    relevance: number;
    metadata: Record<string, unknown>;
}

interface SourceWithModel {
    id: string;
    heading: string | null;
    documentationUrl: string | null;
    collectionName: string;
    embeddingModel: string;
    embeddingDimensions: number;
}

/**
 * Calibrate and normalize raw score to [0.0, 1.0] range with 2 decimal precision.
 */
export function normalizeRelevanceScore(rawScore: unknown): number {
    if (typeof rawScore !== "number" || Number.isNaN(rawScore)) {
        return 0;
    }
    // If raw score > 1, assume 0-100 percentage scale and normalize
    const normalized = rawScore > 1 ? rawScore / 100 : rawScore;
    const clamped = Math.max(0, Math.min(1, normalized));
    return Math.round(clamped * 100) / 100;
}

export function getDeduplicationKey(item: ScopedSearchResult): string {
    const chunkId = item.metadata?.chunkId;
    if (typeof chunkId === "string" && chunkId.trim().length > 0) {
        return `chunk:${chunkId.trim()}`;
    }
    const sourceId = (item.metadata?.sourceId as string) || "";
    const normalizedContent = (item.snippet || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalizedTitle = (item.title || "").trim().toLowerCase();
    const hash = crypto.createHash("sha256").update(`${normalizedTitle}::${normalizedContent}`).digest("hex");
    return `hash:${sourceId}:${hash}`;
}

/**
 * Deduplicates and sorts search results by relevance descending.
 */
export function deduplicateAndRankResults(
    results: ScopedSearchResult[],
    limit: number,
): ScopedSearchResult[] {
    const seen = new Set<string>();
    const unique: ScopedSearchResult[] = [];

    // Sort by relevance descending
    const sorted = [...results].sort((a, b) => b.relevance - a.relevance);

    for (const item of sorted) {
        const key = getDeduplicationKey(item);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    return unique.slice(0, limit);
}

function deduplicateAndRankVectorResults(
    results: ScopedSearchResult[],
    limit: number,
): ScopedSearchResult[] {
    const seen = new Set<string>();
    const unique: ScopedSearchResult[] = [];
    const rawScore = (result: ScopedSearchResult): number => {
        const score = result.metadata.rawScore;
        return typeof score === "number" && Number.isFinite(score)
            ? Math.max(0, Math.min(1, score))
            : 0;
    };

    const sorted = [...results].sort((a, b) => rawScore(b) - rawScore(a));
    for (const item of sorted) {
        const key = getDeduplicationKey(item);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    return unique.slice(0, limit);
}

/**
 * Scoped Vector Search Service
 * 
 * Responsibilities:
 * 1. Resolves all eligible ChatSource records strictly matching the multi-tenant scope (workspace, room, thread).
 * 2. Groups collections by (embeddingModel, embeddingDimensions).
 * 3. Generates query embeddings ONCE per (model, dimension) group.
 * 4. Queries only matching vector spaces.
 * 5. Normalizes relevance scores (0 to 1 range), merges, sorts, and deduplicates.
 * 6. Returns { title, snippet, pageUrl, relevance, metadata }.
 * 7. Provides fallback to keyword-based database search when Qdrant is unavailable or empty.
 */
export async function scopedVectorSearch(
    input: ScopedVectorSearchInput,
): Promise<ScopedSearchResult[]> {
    const query = (input.query || "").trim();
    if (!query) {
        return [];
    }

    const limit = Math.max(1, Math.min(15, input.topK || input.limit || 3));
    const candidateLimit = Math.min(30, Math.max(20, limit * 2));
    const minScore =
        typeof input.similarityThreshold === "number"
            ? input.similarityThreshold
            : typeof input.minScore === "number" && input.minScore >= 0.3
                ? Math.min(1, input.minScore)
                : 0.5;
    const workspaceId = normalizeWorkspaceId(input.scope?.workspaceId ?? input.workspaceId);
    const roomId = normalizeRoomId(input.scope?.roomId ?? input.roomId);
    const threadId = normalizeThreadId(input.scope?.threadId ?? input.threadId);
    const mode = input.scope?.mode ?? input.mode ?? "room";
    const allowGlobal = Boolean(input.scope?.allowGlobal ?? input.allowGlobal);
    const throwOnQdrantError = Boolean(input.throwOnQdrantError);
    const fallbackToKeyword = input.fallbackToKeyword !== false;
    const legacySourceIds = input.legacySourceIds;
    const searchMode = input.searchMode ?? "semantic";

    // If room mode and no roomId specified, return empty to prevent scope leakage
    if (mode === "room" && !roomId) {
        logger.warn({ workspaceId }, "scopedVectorSearch called without roomId in room mode; returning empty");
        return [];
    }

    // 1. Keyword search mode: dispatch directly to PostgreSQL lexical search without dense query or cosine threshold
    if (searchMode === "keyword") {
        const ragScope = createRagScope({
            kind: "rocketchat",
            workspaceId,
            roomId: roomId!,
            threadId,
        });
        const lexicalResults = await searchLexical({
            query,
            scope: ragScope,
            limit,
        }, { prisma });
        return lexicalResults.map((r) => ({
            title: r.title,
            snippet: r.snippet,
            pageUrl: r.pageUrl,
            relevance: r.relevance,
            metadata: { ...r.metadata },
        }));
    }

    // 2. Hybrid search mode: over-fetch dense candidates (with cosine similarity threshold)
    // and lexical candidates (without cosine threshold), then fuse with RRF k=60
    if (searchMode === "hybrid") {
        const ragScope = createRagScope({
            kind: "rocketchat",
            workspaceId,
            roomId: roomId!,
            threadId,
        });
        const [denseCandidates, lexicalCandidates] = await Promise.all([
            scopedVectorSearch({
                ...input,
                searchMode: "semantic",
                limit: candidateLimit,
                topK: candidateLimit,
                minScore,
            }),
            searchLexical({
                query,
                scope: ragScope,
                limit: candidateLimit,
            }, { prisma }),
        ]);

        return fuseRankingsRrf(denseCandidates, lexicalCandidates, { k: 60, topK: limit });
    }

    if (config.rag.v1Enabled && !input.__skipRagV1 && mode === "room") {
        const ragScope = createRagScope({
            kind: "rocketchat",
            workspaceId,
            roomId,
            threadId,
        });
        const profileModel = input.embeddingModel || config.llm.embeddingModel;
        const profileDimensions = getEmbeddingDimensionsForModel(profileModel);
        try {
            const v1 = await searchRagV1({
                query,
                scope: ragScope,
                indexVersion: config.rag.indexVersion,
                embeddingModel: profileModel,
                dimensions: profileDimensions,
                limit: candidateLimit,
                minScore,
            }, { prisma, embed: generateVectorEmbeddings, qdrant });
            const legacyCandidates = await prisma.chatSource.findMany({
                where: {
                    AND: [
                        buildChatSourceScopeWhere({ workspaceId, roomId, threadId, mode: "room", allowGlobal: false }),
                        { collectionName: { not: null } },
                    ],
                },
                select: { id: true },
            });
            const uncoveredSourceIds = legacyCandidates
                .map((source: { id: string }) => source.id)
                .filter((sourceId: string) => !v1.activeSourceIds.includes(sourceId));
            const legacyDecision = resolveLegacyReadDecision({
                uncoveredSourceIds,
                dualReadEnabled: config.rag.dualReadEnabled,
                allowAvailabilityFallback: config.rag.allowLegacyAvailabilityFallback,
            });
            if (!legacyDecision.shouldReadLegacy) return v1.results.slice(0, limit);
            logger.info({
                ragEvent: legacyDecision.reason,
                queryLength: query.length,
                workspaceId,
                roomId,
                uncoveredSourceCount: uncoveredSourceIds.length,
            }, "RAG v1 legacy-read policy activated");
            const legacyResults = await scopedVectorSearch({
                ...input,
                searchMode: "semantic",
                __skipRagV1: true,
                legacySourceIds: uncoveredSourceIds,
                limit: candidateLimit,
                topK: candidateLimit,
            });
            const merged: ScopedSearchResult[] = [
                ...v1.results,
                ...legacyResults.map((result) => ({
                    ...result,
                    metadata: { ...result.metadata, legacy_fallback_reason: legacyDecision.reason } as Record<string, unknown>,
                })),
            ];
            return deduplicateAndRankResults(merged, limit);
        } catch (error: any) {
            logger.error({ err: error?.message || String(error), queryLength: query.length }, "RAG v1 retrieval failed");
            const legacyDecision = resolveLegacyReadDecision({
                uncoveredSourceIds: [],
                dualReadEnabled: false,
                allowAvailabilityFallback: config.rag.allowLegacyAvailabilityFallback,
                v1Failed: true,
            });
            if (!legacyDecision.shouldReadLegacy) throw error;
            logger.warn({
                ragEvent: legacyDecision.reason,
                queryLength: query.length,
                workspaceId,
                roomId,
            }, "RAG v1 failed; using explicitly enabled legacy availability fallback");
            return (await scopedVectorSearch({
                ...input,
                searchMode: "semantic",
                __skipRagV1: true,
                limit,
                topK: limit,
            })).map((result) => ({
                ...result,
                metadata: { ...result.metadata, legacy_fallback_reason: legacyDecision.reason } as Record<string, unknown>,
            }));
        }
    }

    // If room mode and no roomId specified, return empty to prevent scope leakage
    if (mode === "room" && !roomId) {
        logger.warn({ workspaceId }, "scopedVectorSearch called without roomId in room mode; returning empty");
        return [];
    }

    // 1. Build Prisma where clause matching scope
    let scopeWhere: any;
    try {
        scopeWhere = buildChatSourceScopeWhere({
            workspaceId,
            roomId,
            threadId,
            mode,
            allowGlobal,
        });
    } catch (scopeErr: any) {
        logger.warn({ err: scopeErr.message, workspaceId, roomId }, "Scope validation failed during search");
        return [];
    }

    // 2. Query ChatSource records matching scope
    let sources: any[] = [];
    try {
        sources = await prisma.chatSource.findMany({
            where: {
                AND: [
                    scopeWhere,
                    {
                        collectionName: { not: null },
                    },
                    ...(legacySourceIds ? [{ id: { in: [...legacySourceIds] } }] : []),
                ],
            },
            select: {
                id: true,
                heading: true,
                documentationUrl: true,
                collectionName: true,
                embeddingModel: true,
                embeddingDimensions: true,
            },
        });
    } catch (dbErr: any) {
        logger.error({ err: dbErr.message }, "Database error fetching scoped ChatSources");
        if (fallbackToKeyword) {
            return executeKeywordFallback(query, scopeWhere, limit);
        }
        return [];
    }

    // Filter valid non-empty collection names
    const validSources: SourceWithModel[] = sources
        .filter((s) => s.collectionName && s.collectionName.trim().length > 0)
        .map((s) => {
            const model = s.embeddingModel || config.llm.embeddingModel || input.embeddingModel || "openai/text-embedding-3-small";
            const dimensions = s.embeddingDimensions || getEmbeddingDimensionsForModel(model);
            return {
                id: s.id,
                heading: s.heading,
                documentationUrl: s.documentationUrl,
                collectionName: s.collectionName.trim(),
                embeddingModel: model,
                embeddingDimensions: dimensions,
            };
        });

    if (validSources.length === 0) {
        // No vector collections in scope; try keyword fallback on document pages
        if (fallbackToKeyword) {
            return executeKeywordFallback(query, scopeWhere, limit);
        }
        return [];
    }

    // 3. Group collections by (embeddingModel, embeddingDimensions)
    const modelGroups = new Map<string, {
        model: string;
        dimensions: number;
        sources: SourceWithModel[];
    }>();

    for (const src of validSources) {
        const groupKey = `${src.embeddingModel}::${src.embeddingDimensions}`;
        if (!modelGroups.has(groupKey)) {
            modelGroups.set(groupKey, {
                model: src.embeddingModel,
                dimensions: src.embeddingDimensions,
                sources: [],
            });
        }
        modelGroups.get(groupKey)!.sources.push(src);
    }

    // 4. Query vector spaces per model group
    const rawResults: ScopedSearchResult[] = [];
    let anyQdrantSuccess = false;
    const qdrantErrors: Error[] = [];

    for (const group of modelGroups.values()) {
        const groupCandidates: Array<{ score: unknown; result: ScopedSearchResult }> = [];
        let queryVector: number[];
        try {
            const embResult = await generateVectorEmbeddings(query, {
                model: group.model,
                dimensions: group.dimensions,
            });
            queryVector = Array.isArray(embResult[0])
                ? (embResult as number[][])[0]
                : (embResult as number[]);
        } catch (embErr: any) {
            logger.warn(
                { err: embErr.message, model: group.model },
                "Failed to generate query embedding for model group",
            );
            qdrantErrors.push(embErr);
            continue;
        }

        // Deduplicate collections in this model group
        const collectionMap = new Map<string, SourceWithModel>();
        for (const source of group.sources) {
            if (!collectionMap.has(source.collectionName)) {
                collectionMap.set(source.collectionName, source);
            }
        }

        for (const [collectionName, source] of collectionMap.entries()) {
            try {
                let points: any[] = [];
                if (typeof qdrant.query === "function") {
                    const resp = await qdrant.query(collectionName, {
                        query: queryVector,
                        limit: candidateLimit,
                        with_payload: true,
                        score_threshold: minScore > 0 ? minScore : undefined,
                    });
                    points = Array.isArray(resp?.points) ? resp.points : Array.isArray(resp) ? resp : [];
                } else if (typeof qdrant.search === "function") {
                    const resp = await qdrant.search(collectionName, {
                        vector: queryVector,
                        limit: candidateLimit,
                        with_payload: true,
                        score_threshold: minScore > 0 ? minScore : undefined,
                    });
                    points = Array.isArray(resp) ? resp : [];
                }

                anyQdrantSuccess = true;

                for (const pt of points) {
                    const payload = pt.payload || pt;
                    const relevance = normalizeRelevanceScore(pt.score);

                    const title =
                        payload.title ||
                        payload.heading ||
                        source.heading ||
                        "Document";
                    const snippet =
                        payload.body ||
                        payload.content ||
                        payload.chunkText ||
                        payload.snippet ||
                        "";
                    const pageUrl =
                        payload.url ||
                        payload.pageUrl ||
                        source.documentationUrl ||
                        "";

                    groupCandidates.push({
                        score: pt.score,
                        result: {
                            title,
                            snippet,
                            pageUrl,
                            relevance,
                            metadata: {
                                retrievalMode: "vector",
                                sourceId: source.id,
                                collectionName,
                                chunkId: payload.chunkId || (pt.id ? String(pt.id) : undefined),
                                chunkType: payload.chunkType,
                                embeddingModel: group.model,
                                rawScore: pt.score,
                            },
                        },
                    });
                }
            } catch (qErr: any) {
                logger.warn(
                    { err: qErr.message, collection: collectionName },
                    "Qdrant query failed for collection",
                );
                qdrantErrors.push(qErr);
            }
        }

        rawResults.push(
            ...selectGroundedCandidates(groupCandidates, {
                minimumScore: minScore,
                maximumCandidates: candidateLimit,
            }).map((candidate) => candidate.result),
        );
    }

    // If Qdrant failed completely with errors
    if (!anyQdrantSuccess && qdrantErrors.length > 0) {
        if (throwOnQdrantError) {
            const err = new ApiError(
                503,
                `Vector search failed: ${qdrantErrors[0]?.message || "Qdrant service unavailable"}`,
            );
            (err as any).code = "QDRANT_UNAVAILABLE";
            throw err;
        }

        if (fallbackToKeyword) {
            const fallbackResults = await executeKeywordFallback(query, scopeWhere, limit);
            if (fallbackResults.length > 0) {
                return fallbackResults;
            }
        }

        // Qdrant failed completely and no keyword matches were found
        const err = new ApiError(
            503,
            `Vector search failed: ${qdrantErrors[0]?.message || "Qdrant service unavailable"}`,
        );
        (err as any).code = "QDRANT_UNAVAILABLE";
        throw err;
    }

    // If Qdrant succeeded but returned 0 results, check keyword fallback if enabled
    if (rawResults.length === 0 && fallbackToKeyword) {
        const fallbackResults = await executeKeywordFallback(query, scopeWhere, limit);
        if (fallbackResults.length > 0) {
            return fallbackResults;
        }
    }

    // 5. Deduplicate, sort, and slice to limit
    return deduplicateAndRankVectorResults(rawResults, limit);
}

/**
 * Keyword-based fallback search against PostgreSQL DocumentPage/ChatSource.
 * Used when Qdrant is unavailable or collections have not yet finished indexing.
 */
export async function executeKeywordFallback(
    query: string,
    scopeWhere: any,
    limit: number,
): Promise<ScopedSearchResult[]> {
    try {
        const pages = await prisma.documentPage.findMany({
            where: {
                AND: [
                    {
                        chatSource: scopeWhere,
                    },
                    {
                        OR: [
                            { heading: { contains: query, mode: "insensitive" } },
                            { pageUrl: { contains: query, mode: "insensitive" } },
                        ],
                    },
                ],
            },
            take: limit,
            include: {
                chatSource: {
                    select: {
                        id: true,
                        heading: true,
                        documentationUrl: true,
                    },
                },
            },
        });

        return pages.map((p) => ({
            title: p.heading || p.chatSource?.heading || "Document",
            snippet: `Found in ${p.chatSource?.heading || "knowledge base"} (${p.pageUrl})`,
            pageUrl: p.pageUrl,
            relevance: 0.8,
            metadata: {
                retrievalMode: "keyword_fallback",
                sourceId: p.chatSourceId,
            },
        }));
    } catch (err: any) {
        logger.debug({ err: err.message }, "Keyword search fallback returned no results or failed");
        return [];
    }
}
