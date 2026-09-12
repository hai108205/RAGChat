import { describe, expect, it } from "vitest";
import { createEmptyBackfillCheckpoint } from "../../scripts/backfillRagV1.js";

describe("RAG backfill controls", () => {
    it("starts with an empty resumable checkpoint", () => {
        expect(createEmptyBackfillCheckpoint()).toEqual({ completed: {} });
    });
});
