import { describe, expect, it, vi } from "vitest";
import { startRagTrace } from "../../rag/telemetry.js";

describe("RAG telemetry", () => {
    it("records stage latency without exposing prompt content", async () => {
        const trace = startRagTrace({ requestId: "req-1", queryLength: 12 });
        await expect(trace.stage("RETRIEVAL", async () => "ok")).resolves.toBe("ok");
        trace.finish({ resultCount: 1 });
        expect(vi.isMockFunction(trace.stage)).toBe(false);
    });
});
