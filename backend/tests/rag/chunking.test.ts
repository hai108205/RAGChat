import { describe, expect, it } from "vitest";
import { splitIntoSegments } from "../../rag/chunking.js";

describe("type-aware chunking", () => {
    it("preserves markdown heading metadata and removes duplicate/empty segments", async () => {
        const segments = await splitIntoSegments({
            text: "# Intro\n\nFirst paragraph.\n\n## Details\n\nSecond paragraph.",
            documentType: "markdown",
            options: { chunkSize: 40, chunkOverlap: 5 },
        });
        expect(segments.length).toBeGreaterThan(1);
        expect(segments.some((segment) => segment.metadata.heading === "Intro")).toBe(true);
        expect(segments.every((segment) => segment.content.trim().length > 0)).toBe(true);
    });

    it("uses language-aware splitting for source code", async () => {
        const segments = await splitIntoSegments({
            text: "export function one() { return 1; }\n\nexport function two() { return 2; }",
            documentType: "code",
            options: { chunkSize: 45, chunkOverlap: 5 },
        });
        expect(segments.length).toBeGreaterThan(0);
        expect(segments[0].metadata.documentType).toBe("code");
    });
});
