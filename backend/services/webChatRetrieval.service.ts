import {
    extractNormalizedQueryTerms,
    isVectorEligibleSource,
    rerankCandidatesByTermFrequency,
    selectGroundedCandidates,
} from "../utils/retrievalQuality.js";

const RRF_K = 60;
const FINAL_RESULT_LIMIT = 3;

export type WebChatSource = {
    collectionName: string | null;
    isVectorLess: boolean | null;
};

export type WebChatRetrievedPoint = {
    id: string | number;
    score: unknown;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
};

export type WebChatRetrievalDependencies = {
    generateEmbedding: (query: string) => Promise<number[]>;
    qdrant: {
        query: (
            collectionName: string,
            request: {
                query: number[];
                limit: number;
                with_payload: boolean;
                score_threshold: number;
            },
        ) => Promise<{ points?: WebChatRetrievedPoint[] }>;
    };
};

export type WebChatRetrievalInput = {
    query: string;
    sources: readonly WebChatSource[];
    dependencies: WebChatRetrievalDependencies;
};

type Candidate = {
    key: string;
    point: WebChatRetrievedPoint;
    sourceIndex: number;
};

function rawCosineScore(point: WebChatRetrievedPoint): number {
    return typeof point.score === "number" && Number.isFinite(point.score)
        ? Math.min(1, Math.max(0, point.score))
        : 0;
}

/**
 * Retrieves only grounded vector evidence for a Web chat. Each collection is
 * evaluated independently before candidates are merged, so one noisy source
 * cannot set another source's grounding threshold.
 */
export async function retrieveWebChatSources({
    query,
    sources,
    dependencies,
}: WebChatRetrievalInput): Promise<WebChatRetrievedPoint[]> {
    const eligibleSources = sources
        .map((source, sourceIndex) => ({ source, sourceIndex }))
        .filter(({ source }) => isVectorEligibleSource(source));

    if (eligibleSources.length === 0) return [];

    const embedding = await dependencies.generateEmbedding(query);
    const approvedCandidates: Candidate[] = [];

    for (const { source, sourceIndex } of eligibleSources) {
        const collectionName = source.collectionName!.trim();
        const response = await dependencies.qdrant.query(collectionName, {
            query: embedding,
            limit: 10,
            with_payload: true,
            score_threshold: 0.5,
        });
        const sourceCandidates = selectGroundedCandidates(response?.points ?? []);

        for (const point of sourceCandidates) {
            approvedCandidates.push({
                key: `${sourceIndex}:${String(point.id)}`,
                point,
                sourceIndex,
            });
        }
    }

    if (approvedCandidates.length === 0) return [];

    const denseRanking = [...approvedCandidates].sort(
        (left, right) => rawCosineScore(right.point) - rawCosineScore(left.point) || left.sourceIndex - right.sourceIndex,
    );
    const lexicalRanking = rerankCandidatesByTermFrequency(
        approvedCandidates,
        extractNormalizedQueryTerms(query),
        (candidate) => candidate.point.payload?.body,
    );

    const fusedScores = new Map<string, number>();
    for (const ranking of [denseRanking, lexicalRanking]) {
        ranking.forEach((candidate, rank) => {
            fusedScores.set(candidate.key, (fusedScores.get(candidate.key) ?? 0) + 1 / (RRF_K + rank + 1));
        });
    }

    return [...approvedCandidates]
        .sort(
            (left, right) =>
                (fusedScores.get(right.key) ?? 0) - (fusedScores.get(left.key) ?? 0) ||
                left.sourceIndex - right.sourceIndex,
        )
        .slice(0, FINAL_RESULT_LIMIT)
        .map((candidate) => candidate.point);
}
