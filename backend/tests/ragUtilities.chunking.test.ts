import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { splitDocumentationContent } from "../utils/ragUtilities.js";

describe("splitDocumentationContent", () => {
    it("returns chunk objects with code blocks kept intact", () => {
        const fixture = readFileSync(new URL("./fixtures/code-doc-sample.md", import.meta.url), "utf8");

        const chunks = splitDocumentationContent(fixture, {
            chunkSize: 250,
            chunkOverlap: 40,
        });

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.every((chunk) => typeof chunk.content === "string")).toBe(true);
        expect(chunks.every((chunk) => Object.hasOwn(chunk, "heading"))).toBe(true);
        expect(chunks.some((chunk) => chunk.chunkType === "code")).toBe(true);
        expect(chunks.some((chunk) => chunk.chunkType === "api")).toBe(true);

        const codeChunk = chunks.find((chunk) => chunk.chunkType === "code");
        expect(codeChunk).toBeDefined();
        expect(codeChunk!.content).toContain("```js");
        expect(codeChunk!.content).toContain("const token = generateToken();");
        expect(codeChunk!.content).toContain("```");
    });

    it("preserves heading context in emitted chunks", () => {
        const chunks = splitDocumentationContent("# Intro\n\nBody text", {
            chunkSize: 100,
            chunkOverlap: 0,
        });

        expect(chunks[0].heading).toBe("# Intro");
        expect(chunks[0].chunkType).toBe("content");
        expect(chunks[0].hasCodeBlock).toBe(false);
        expect(chunks[0].content).toContain("# Intro");
    });

    it("splits a long plain-text document into bounded overlapping chunks", () => {
        const programDetails = [
            "Tổ chức Tuần lễ hội nhập sinh viên năm học 2026-2027.",
            "Chương trình Viết CV Ấn Tượng – Phỏng Vấn Tự Tin dành cho sinh viên K67.",
            "Thời gian: Thứ Sáu 04/09/2026, từ 19h30 đến 21h30.",
            "Hình thức: trực tuyến bằng MS Teams.",
        ].join("\n\n");
        const text = Array.from({ length: 8 }, () => programDetails).join("\n\n");

        const chunks = splitDocumentationContent(text, {
            chunkSize: 240,
            chunkOverlap: 40,
        });

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.content.length <= 240)).toBe(true);
        expect(chunks.some((chunk) => chunk.content.includes("19h30 đến 21h30"))).toBe(true);
        expect(chunks[1].content).toContain(chunks[0].content.slice(-40).trim());
    });

    it("preserves the separator at an overlapping plain-text split", () => {
        const chunks = splitDocumentationContent(
            "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
            { chunkSize: 22, chunkOverlap: 8 },
        );

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.some((chunk) => /(?:alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliet|kilo)(?:alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliet|kilo)/.test(chunk.content))).toBe(false);
    });
});
