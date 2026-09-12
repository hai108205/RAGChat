import type { RagScope } from "./types.js";

export interface LexicalRetrievalInput {
    readonly query: string;
    readonly scope: RagScope;
    readonly limit: number;
    readonly minScore?: number;
}

export interface LexicalSearchResult {
    readonly title: string;
    readonly snippet: string;
    readonly pageUrl: string;
    readonly relevance: number;
    readonly metadata: {
        readonly retrievalMode: "lexical";
        readonly sourceId: string;
        readonly chunkId: string;
        readonly documentId?: string;
        readonly versionHash?: string;
        readonly locator?: string;
        readonly heading?: string;
        readonly [key: string]: unknown;
    };
}

export interface LexicalRetrievalDependencies {
    readonly prisma: {
        readonly $queryRaw: <T = any>(query: any, ...values: any[]) => Promise<T>;
    };
}

/**
 * Strips common search punctuation/operators to test if the query contains
 * genuine searchable alphanumeric terms.
 */
export function hasSearchableTerms(query: string): boolean {
    const stripped = query.replace(/[&|!():*~^"[\]{}+\\/<=>@?#$,.;_-]/g, " ").trim();
    return stripped.length > 0;
}

/**
 * Extracts a bounded excerpt of text centered around query terms.
 */
export function extractExcerpt(content: string, query: string, maxCharacters = 280): string {
    const trimmed = content.trim();
    if (trimmed.length <= maxCharacters) {
        return trimmed;
    }

    const terms = query
        .toLowerCase()
        .replace(/[&|!():*~^"[\]{}+\\/<=>@?#$,.;_-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);

    let matchIndex = -1;
    for (const term of terms) {
        const idx = trimmed.toLowerCase().indexOf(term);
        if (idx !== -1) {
            matchIndex = idx;
            break;
        }
    }

    if (matchIndex === -1) {
        return `${trimmed.slice(0, maxCharacters).trim()}...`;
    }

    const half = Math.floor(maxCharacters / 2);
    const start = Math.max(0, matchIndex - half);
    const end = Math.min(trimmed.length, start + maxCharacters);

    let excerpt = trimmed.slice(start, end).trim();
    if (start > 0) excerpt = `...${excerpt}`;
    if (end < trimmed.length) excerpt = `${excerpt}...`;

    return excerpt;
}

export async function searchLexical(
    input: LexicalRetrievalInput,
    deps: LexicalRetrievalDependencies,
): Promise<LexicalSearchResult[]> {
    const query = input.query.trim();
    if (!query || !hasSearchableTerms(query)) {
        return [];
    }

    const limit = Math.max(1, input.limit || 5);
    const scope = input.scope;

    // Execute safe scoped query via Prisma raw query with parameterized arguments
    let rows: any[] = [];
    try {
        if (scope.kind === "rocketchat") {
            const workspaceId = scope.workspaceId;
            const roomId = scope.roomId;
            const threadId = scope.threadId ?? "";

            rows = await deps.prisma.$queryRaw`
                SELECT
                    c.chunk_id AS "chunkId",
                    c.chat_source_id AS "chatSourceId",
                    c.content AS "content",
                    c.locator AS "locator",
                    c.heading AS "heading",
                    c.page_url AS "pageUrl",
                    c.document_id AS "documentId",
                    c.version_hash AS "versionHash",
                    rd.status AS "documentStatus",
                    ts_rank_cd(to_tsvector('simple', c.content), websearch_to_tsquery('simple', ${query})) AS "rankScore"
                FROM "RagLexicalChunk" c
                JOIN "ChatSource" cs ON c.chat_source_id = cs.id
                LEFT JOIN "RagDocument" rd ON c.document_id = rd.id
                WHERE cs.rocketchat_workspace_id = ${workspaceId}
                  AND cs.rocketchat_room_id = ${roomId}
                  AND (
                      (${threadId} != '' AND (cs.rocketchat_thread_id = ${threadId} OR cs.rocketchat_thread_id IS NULL OR cs.rocketchat_thread_id = ''))
                      OR
                      (${threadId} = '' AND (cs.rocketchat_thread_id IS NULL OR cs.rocketchat_thread_id = ''))
                  )
                  AND to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', ${query})
                ORDER BY "rankScore" DESC
                LIMIT ${limit * 2}
            `;
        } else {
            const chatId = scope.chatId;
            rows = await deps.prisma.$queryRaw`
                SELECT
                    c.chunk_id AS "chunkId",
                    c.chat_source_id AS "chatSourceId",
                    c.content AS "content",
                    c.locator AS "locator",
                    c.heading AS "heading",
                    c.page_url AS "pageUrl",
                    c.document_id AS "documentId",
                    c.version_hash AS "versionHash",
                    rd.status AS "documentStatus",
                    ts_rank_cd(to_tsvector('simple', c.content), websearch_to_tsquery('simple', ${query})) AS "rankScore"
                FROM "RagLexicalChunk" c
                JOIN "ChatSource" cs ON c.chat_source_id = cs.id
                JOIN "_ChatToChatSource" ccs ON cs.id = ccs."B"
                LEFT JOIN "RagDocument" rd ON c.document_id = rd.id
                WHERE ccs."A" = ${chatId}
                  AND to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', ${query})
                ORDER BY "rankScore" DESC
                LIMIT ${limit * 2}
            `;
        }
    } catch {
        // Safe empty behavior: syntax, malformed, or operator-only errors return empty
        return [];
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }

    // Filter out inactive/superseded document versions when documentId is present
    const validRows = rows.filter((row) => {
        if (row.documentId && row.documentStatus && row.documentStatus !== "ACTIVE") {
            return false;
        }
        return true;
    });

    // Deduplicate by chunkId
    const seenChunkIds = new Set<string>();
    const results: LexicalSearchResult[] = [];

    for (const row of validRows) {
        const chunkId = String(row.chunkId || row.id);
        if (seenChunkIds.has(chunkId)) continue;
        seenChunkIds.add(chunkId);

        const rankScore = typeof row.rankScore === "number" && Number.isFinite(row.rankScore)
            ? row.rankScore
            : 0.8;
        const relevance = Math.round(Math.max(0, Math.min(1, rankScore)) * 100) / 100;

        results.push({
            title: row.heading || "Document",
            snippet: extractExcerpt(row.content || "", query),
            pageUrl: row.pageUrl || "",
            relevance,
            metadata: {
                retrievalMode: "lexical",
                sourceId: row.chatSourceId,
                chunkId,
                ...(row.documentId ? { documentId: row.documentId } : {}),
                ...(row.versionHash ? { versionHash: row.versionHash } : {}),
                ...(row.locator ? { locator: row.locator } : {}),
                ...(row.heading ? { heading: row.heading } : {}),
            },
        });

        if (results.length >= limit) break;
    }

    return results;
}

export const RRF_DEFAULT_K = 60;

/**
 * Fuses dense vector candidates and lexical candidates using Reciprocal Rank Fusion (RRF).
 * Breaks score ties deterministically by chunkId lexicographical comparison.
 */
export function fuseRankingsRrf<T extends { title?: string; snippet?: string; pageUrl?: string; relevance?: number; metadata?: Record<string, any> }>(
    denseResults: readonly T[],
    lexicalResults: readonly T[],
    options?: { k?: number; topK?: number },
): T[] {
    const k = options?.k ?? RRF_DEFAULT_K;
    const topK = options?.topK ?? 10;

    const itemMap = new Map<string, T>();
    const fusedScores = new Map<string, number>();

    const getKey = (item: T): string => {
        const chunkId = item.metadata?.chunkId;
        if (chunkId && typeof chunkId === "string") {
            return chunkId;
        }
        const sourceId = item.metadata?.sourceId || "";
        const snippetSnippet = (item.snippet || "").slice(0, 40);
        return `${sourceId}::${snippetSnippet}`;
    };

    denseResults.forEach((item, rank) => {
        const key = getKey(item);
        if (!itemMap.has(key)) itemMap.set(key, item);
        const current = fusedScores.get(key) ?? 0;
        fusedScores.set(key, current + 1 / (k + rank + 1));
    });

    lexicalResults.forEach((item, rank) => {
        const key = getKey(item);
        if (!itemMap.has(key)) itemMap.set(key, item);
        const current = fusedScores.get(key) ?? 0;
        fusedScores.set(key, current + 1 / (k + rank + 1));
    });

    const items = [...itemMap.values()];

    return items
        .sort((left, right) => {
            const keyLeft = getKey(left);
            const keyRight = getKey(right);
            const scoreLeft = fusedScores.get(keyLeft) ?? 0;
            const scoreRight = fusedScores.get(keyRight) ?? 0;

            const diff = scoreRight - scoreLeft;
            if (Math.abs(diff) > 1e-9) {
                return diff;
            }

            // Stable tie-breaker: compare chunkId or key lexicographically
            const leftId = String(left.metadata?.chunkId || keyLeft);
            const rightId = String(right.metadata?.chunkId || keyRight);
            return leftId.localeCompare(rightId);
        })
        .slice(0, topK);
}
