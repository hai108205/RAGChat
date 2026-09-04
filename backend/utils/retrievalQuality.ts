const MINIMUM_COSINE_SCORE = 0.5;
const MAXIMUM_SCORE_GAP = 0.12;
const MAXIMUM_CANDIDATES = 3;

type ScoredCandidate = {
    score: unknown;
};

type SourceWithVectorMetadata = {
    collectionName: unknown;
    isVectorLess: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.normalize("NFC").toLocaleLowerCase() : "";
}

function tokenize(value: unknown): string[] {
    return normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function clampedCosineScore(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.min(1, Math.max(0, value));
}

export function extractNormalizedQueryTerms(query: unknown): string[] {
    return tokenize(query);
}

export function normalizedTermFrequency(text: unknown, queryTerms: readonly unknown[]): number {
    const chunkTerms = tokenize(text);
    const terms = queryTerms.flatMap((term) => tokenize(term));

    if (chunkTerms.length === 0 || terms.length === 0) return 0;

    const frequencies = new Map<string, number>();
    for (const term of chunkTerms) {
        frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }

    return terms.reduce((total, term) => total + (frequencies.get(term) ?? 0), 0);
}

export function selectGroundedCandidates<T extends ScoredCandidate>(candidates: readonly T[]): T[] {
    const validCandidates = candidates
        .map((candidate, index) => ({ candidate, index, score: clampedCosineScore(candidate.score) }))
        .filter((entry): entry is { candidate: T; index: number; score: number } => entry.score !== null)
        .filter((entry) => entry.score >= MINIMUM_COSINE_SCORE)
        .sort((left, right) => right.score - left.score || left.index - right.index);

    const bestScore = validCandidates[0]?.score;
    if (bestScore === undefined) return [];

    return validCandidates
        .filter((entry) => bestScore - entry.score <= MAXIMUM_SCORE_GAP)
        .slice(0, MAXIMUM_CANDIDATES)
        .map((entry) => entry.candidate);
}

export function rerankCandidatesByTermFrequency<T>(
    candidates: readonly T[],
    queryTerms: readonly unknown[],
    getChunkText: (candidate: T) => unknown,
): T[] {
    return candidates
        .map((candidate, index) => ({
            candidate,
            index,
            score: normalizedTermFrequency(getChunkText(candidate), queryTerms),
        }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map((entry) => entry.candidate);
}

export function isVectorEligibleSource(source: SourceWithVectorMetadata | null | undefined): boolean {
    return (
        source?.isVectorLess === false &&
        typeof source.collectionName === "string" &&
        source.collectionName.trim().length > 0
    );
}
