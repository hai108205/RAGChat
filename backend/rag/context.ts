export interface RagContextCandidate {
    title: string;
    snippet: string;
    pageUrl: string;
    relevance: number;
    metadata?: Record<string, unknown>;
}

export interface RagContextResult {
    text: string;
    sources: RagContextCandidate[];
    estimatedTokens: number;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export function buildRagContext(candidates: readonly RagContextCandidate[], tokenBudget: number): RagContextResult {
    const seen = new Set<string>();
    const sources: RagContextCandidate[] = [];
    let used = 0;
    const blocks: string[] = [];
    const ordered = [...candidates].sort((a, b) => b.relevance - a.relevance);

    for (const candidate of ordered) {
        const body = String(candidate.snippet || "").replace(/\s+/g, " ").trim();
        if (!body) continue;
        const key = String(candidate.metadata?.chunkId || `${candidate.pageUrl}|${body.slice(0, 120)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        const sourceNumber = sources.length + 1;
        const header = `[${sourceNumber}] ${candidate.title || "Document"}${candidate.pageUrl ? ` (${candidate.pageUrl})` : ""}`;
        const available = Math.max(tokenBudget - used - estimateTokens(header) - 2, 0);
        if (available <= 0) break;
        const maxChars = available * 4;
        const excerpt = body.length > maxChars ? `${body.slice(0, Math.max(0, maxChars - 3)).trim()}...` : body;
        const block = `${header}\n${excerpt}`;
        const blockTokens = estimateTokens(block) + 1;
        if (used + blockTokens > tokenBudget && sources.length > 0) break;
        used += blockTokens;
        sources.push(candidate);
        blocks.push(block);
    }

    return { text: blocks.length ? blocks.join("\n\n") : "", sources, estimatedTokens: used };
}

export function rewriteConversationalQuery(query: string, history: readonly { role?: string; content?: string }[]): string {
    const current = query.trim();
    if (!current || history.length === 0) return current;
    const isFollowUp = current.split(/\s+/).length <= 12 && /\b(it|they|them|he|she|that|those|this|there|above|previous)\b/i.test(current);
    if (!isFollowUp) return current;
    const priorUser = [...history].reverse().find((message) => message.role === "user" && message.content?.trim());
    return priorUser ? `${priorUser.content!.trim()}\nFollow-up: ${current}` : current;
}
