import { describe, expect, it } from "vitest";
import { splitIntoSegments, splitParsedDocumentSegments } from "../../rag/chunking.js";

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

    it("preserves parser page, slide, or sheet metadata on emitted chunks", async () => {
        const chunks = await splitParsedDocumentSegments({
            format: "xlsx",
            segments: [{
                content: "--- Sheet: Revenue ---\nQ1,100\nQ2,200",
                metadata: { documentType: "xlsx", locator: "sheet:Revenue", sheet: "Revenue", segmentIndex: 0 },
            }],
        }, { chunkSize: 40, chunkOverlap: 5 });
        expect(chunks).toEqual(expect.arrayContaining([
            expect.objectContaining({ metadata: expect.objectContaining({ sheet: "Revenue", locator: "sheet:Revenue" }) }),
        ]));
    });
});
