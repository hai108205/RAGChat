import type { EvaluatorReport } from "./types.js";

export function redactSensitive(value: unknown, secrets: readonly string[] = []): unknown {
    if (Array.isArray(value)) return value.map((item) => redactSensitive(item, secrets));
    if (typeof value === "string") {
        let text = value;
        for (const secret of secrets) if (secret) text = text.split(secret).join("[REDACTED]");
        return text.replace(/Bearer\s+[^\s,}]+/gi, "Bearer [REDACTED]");
    }
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
        /token|authorization|api.?key/i.test(key) ? [key, "[REDACTED]"] : [key, redactSensitive(item, secrets)],
    ));
}

export function renderMarkdownReport(report: EvaluatorReport): string {
    const aggregate = report.aggregate;
    const lines = [
        "# Rocket.Chat RAG E2E Evaluation",
        "",
        "> Synthetic question labels (synthetic); this report is exploratory and is not a human-labelled release corpus.",
        "",
        `- Run: ${report.run.runId}`,
        `- Scope: ${report.run.workspaceId} / ${report.run.roomId}`,
        `- Source: ${report.ingestion.sourceId || "unknown"} (${report.ingestion.chunksCount || 0} chunks)`,
        `- Ingestion: ${report.ingestion.status} (${report.ingestion.durationMs ?? "n/a"} ms)`,
        `- Result: ${aggregate.passed ? "PASS" : "FAIL"}`,
        "",
        "## Aggregate",
        "",
        `- Cases: ${aggregate.generatedCount}; completed: ${aggregate.completedCount}; failed: ${aggregate.failedCount}`,
        `- Judge eligible: ${aggregate.scoreEligibleCount}; judge errors: ${aggregate.judgeErrorCount}`,
        `- Correctness: ${aggregate.averageScores.correctness ?? "n/a"}`,
        `- Groundedness: ${aggregate.averageScores.groundedness ?? "n/a"}`,
        `- Citation support: ${aggregate.averageScores.citationSupport ?? "n/a"}`,
        `- Refusal: ${aggregate.averageScores.refusal ?? "n/a"}`,
        `- Error rate: ${aggregate.errorRate}; empty citation rate: ${aggregate.emptyCitationRate}`,
        `- Latency p50/p95: ${aggregate.latencyMs.p50 ?? "n/a"} / ${aggregate.latencyMs.p95 ?? "n/a"} ms`,
        "",
        "## Cases",
        "",
    ];
    for (const item of report.cases) {
        lines.push(`### ${item.caseId} — ${item.category}`, "", `**Q:** ${item.question}`, `**Status:** ${item.status}`, `**Answer:** ${item.answer || item.error || "n/a"}`);
        if (item.judge) lines.push(`**Scores:** correctness ${item.judge.correctness}/2, groundedness ${item.judge.groundedness}/2, citations ${item.judge.citationSupport}/2, refusal ${item.judge.refusal}/2`, `**Rationale:** ${item.judge.rationale}`);
        lines.push("");
    }
    lines.push("## Sanitized configuration", "", "```json", JSON.stringify(redactSensitive(report.run.configuration), null, 2), "```");
    return lines.join("\n");
}
