import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
    parseDocument,
    detectDocumentFormat,
    DocumentParserError,
} from "../services/documentParser.js";
import {
    sanitizeFilename,
    validateAndDecodeBase64,
    validateFileMetadata,
    UploadPolicyError,
    DEFAULT_MAX_FILE_SIZE_BYTES,
    SUPPORTED_EXTENSIONS,
} from "../utils/uploadPolicy.js";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures/uploads");

function loadFixture(filename: string): Buffer {
    const fixturePath = path.join(FIXTURES_DIR, filename);
    return fs.readFileSync(fixturePath);
}

describe("Upload Policy & Sanitization", () => {
    describe("sanitizeFilename", () => {
        it("strips directory traversal paths", () => {
            expect(sanitizeFilename("../../../etc/passwd.txt")).toBe("passwd.txt");
            expect(sanitizeFilename("..\\..\\windows\\system32\\hosts.txt")).toBe("hosts.txt");
            expect(sanitizeFilename("/var/log/app.log.md")).toBe("app.log.md");
        });

        it("strips null bytes and control characters", () => {
            expect(sanitizeFilename("test\x00file\x1fname.pdf")).toBe("testfilename.pdf");
        });

        it("replaces invalid filesystem characters with underscores", () => {
            expect(sanitizeFilename('report:?"*|<>name.docx')).toBe("report_______name.docx");
        });

        it("trims leading and trailing dots and spaces", () => {
            expect(sanitizeFilename("  ...my-document.pdf...  ")).toBe("my-document.pdf");
        });

        it("throws UploadPolicyError on empty or invalid filename", () => {
            expect(() => sanitizeFilename("")).toThrow(UploadPolicyError);
            expect(() => sanitizeFilename("   ...   ")).toThrow(UploadPolicyError);
        });

        it("truncates excessively long filenames while preserving extension", () => {
            const longBase = "a".repeat(300);
            const sanitized = sanitizeFilename(`${longBase}.pdf`);
            expect(sanitized.length).toBeLessThanOrEqual(255);
            expect(sanitized.endsWith(".pdf")).toBe(true);
        });
    });

    describe("validateAndDecodeBase64", () => {
        it("decodes valid base64 payload into Buffer", () => {
            const raw = "Hello, world!";
            const b64 = Buffer.from(raw).toString("base64");
            const decoded = validateAndDecodeBase64(b64);
            expect(decoded.toString("utf8")).toBe(raw);
        });

        it("handles data URI prefix correctly", () => {
            const raw = "Data URI test content";
            const b64 = `data:text/plain;base64,${Buffer.from(raw).toString("base64")}`;
            const decoded = validateAndDecodeBase64(b64);
            expect(decoded.toString("utf8")).toBe(raw);
        });

        it("throws UploadPolicyError for empty payload", () => {
            expect(() => validateAndDecodeBase64("")).toThrow(UploadPolicyError);
            expect(() => validateAndDecodeBase64("   ")).toThrow(UploadPolicyError);
        });

        it("throws UploadPolicyError for invalid base64 characters", () => {
            expect(() => validateAndDecodeBase64("not-valid-base64-content!@#$%")).toThrow(UploadPolicyError);
        });

        it("throws UploadPolicyError when payload exceeds max size limit", () => {
            const smallLimit = 100;
            const largeData = Buffer.alloc(200, "a").toString("base64");
            expect(() => validateAndDecodeBase64(largeData, smallLimit)).toThrow(UploadPolicyError);
            expect(() => validateAndDecodeBase64(largeData, smallLimit)).toThrow(/exceeds maximum limit/i);
        });
    });

    describe("validateFileMetadata", () => {
        it("accepts all supported extensions", () => {
            for (const ext of SUPPORTED_EXTENSIONS) {
                const result = validateFileMetadata(`document${ext}`);
                expect(result.extension).toBe(ext);
            }
        });

        it("throws UploadPolicyError on unsupported extensions", () => {
            expect(() => validateFileMetadata("malicious.exe")).toThrow(UploadPolicyError);
            expect(() => validateFileMetadata("script.sh")).toThrow(UploadPolicyError);
            expect(() => validateFileMetadata("archive.tar.gz")).toThrow(UploadPolicyError);
        });
    });
});

describe("Document Parser Service", () => {
    describe("Format Detection", () => {
        it("detects PDF by magic bytes (%PDF-)", () => {
            const buf = loadFixture("sample.pdf");
            expect(detectDocumentFormat(buf, "unknown_name")).toBe("pdf");
        });

        it("detects DOCX by ZIP magic bytes and extension", () => {
            const buf = loadFixture("sample.docx");
            expect(detectDocumentFormat(buf, "document.docx")).toBe("docx");
        });

        it("detects PPTX by ZIP magic bytes and extension", () => {
            const buf = loadFixture("sample.pptx");
            expect(detectDocumentFormat(buf, "presentation.pptx")).toBe("pptx");
        });

        it("detects XLSX by ZIP magic bytes and extension", () => {
            const buf = loadFixture("sample.xlsx");
            expect(detectDocumentFormat(buf, "spreadsheet.xlsx")).toBe("xlsx");
        });

        it("detects text, markdown, csv, and html by extension", () => {
            expect(detectDocumentFormat(Buffer.from("text"), "test.txt")).toBe("txt");
            expect(detectDocumentFormat(Buffer.from("# md"), "test.md")).toBe("md");
            expect(detectDocumentFormat(Buffer.from("a,b,c"), "test.csv")).toBe("csv");
            expect(detectDocumentFormat(Buffer.from("<html></html>"), "test.html")).toBe("html");
        });
    });

    describe("Parsing All Supported Formats with Sentinel Verification", () => {
        it("parses .txt correctly and extracts sentinel text", async () => {
            const buf = loadFixture("sample.txt");
            const result = await parseDocument(buf, { filename: "sample.txt" });
            expect(result.format).toBe("txt");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_TXT");
            expect(result.metadata.characterCount).toBeGreaterThan(0);
        });

        it("parses .txt with UTF-8 BOM correctly and strips BOM header", async () => {
            const buf = loadFixture("sample_bom.txt");
            const result = await parseDocument(buf, { filename: "sample_bom.txt" });
            expect(result.format).toBe("txt");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_TXT_BOM");
            expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
        });

        it("parses .md correctly and extracts sentinel text", async () => {
            const buf = loadFixture("sample.md");
            const result = await parseDocument(buf, { filename: "sample.md" });
            expect(result.format).toBe("md");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_MD");
            expect(result.text).toContain("Bold text here");
        });

        it("emits heading-aware structural segments for Markdown without changing text", async () => {
            const result = await parseDocument(Buffer.from("# Intro\nText\n\n## Details\nMore text"), {
                filename: "sections.md",
            });
            expect(result.text).toContain("More text");
            expect(result.segments).toEqual(expect.arrayContaining([
                expect.objectContaining({ metadata: expect.objectContaining({ heading: "Intro" }) }),
                expect.objectContaining({ metadata: expect.objectContaining({ heading: "Intro > Details" }) }),
            ]));
        });

        it("parses .csv correctly and extracts sentinel text", async () => {
            const buf = loadFixture("sample.csv");
            const result = await parseDocument(buf, { filename: "sample.csv" });
            expect(result.format).toBe("csv");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_CSV");
            expect(result.text).toContain("Alice");
            expect(result.text).toContain("Bob");
        });

        it("parses .html correctly, stripping script/style tags and extracting sentinel text", async () => {
            const buf = loadFixture("sample.html");
            const result = await parseDocument(buf, { filename: "sample.html" });
            expect(result.format).toBe("html");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_HTML");
            expect(result.text).toContain("Documentation Title");
            expect(result.text).not.toContain("IGNORE_THIS_SCRIPT_TAG");
            expect(result.text).not.toContain("font-family");
        });

        it("parses .pdf correctly and extracts sentinel text", async () => {
            const buf = loadFixture("sample.pdf");
            const result = await parseDocument(buf, { filename: "sample.pdf" });
            expect(result.format).toBe("pdf");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_PDF");
            expect(result.metadata.totalPages).toBe(1);
        });

        it("parses .docx correctly and extracts sentinel text", async () => {
            const buf = loadFixture("sample.docx");
            const result = await parseDocument(buf, { filename: "sample.docx" });
            expect(result.format).toBe("docx");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_DOCX");
            expect(result.text).toContain("Secondary paragraph in DOCX file");
        });

        it("parses .pptx correctly and extracts slide sentinel text", async () => {
            const buf = loadFixture("sample.pptx");
            const result = await parseDocument(buf, { filename: "sample.pptx" });
            expect(result.format).toBe("pptx");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_PPTX");
            expect(result.text).toContain("Presentation slide notes & details");
            expect(result.metadata.slideCount).toBe(1);
            expect(result.segments?.[0]?.metadata).toMatchObject({ slide: 1, locator: "slide:1" });
        });

        it("parses .xlsx correctly and extracts sheet sentinel text", async () => {
            const buf = loadFixture("sample.xlsx");
            const result = await parseDocument(buf, { filename: "sample.xlsx" });
            expect(result.format).toBe("xlsx");
            expect(result.text).toContain("SENTINEL_PARSER_TEST_CONTENT_XLSX");
            expect(result.text).toContain("TestSheet");
            expect(result.metadata.sheetCount).toBe(1);
            expect(result.segments?.[0]?.metadata).toMatchObject({ sheet: "TestSheet", locator: "sheet:TestSheet" });
        });
    });

    describe("Error Handling & Edge Cases", () => {
        it("throws EMPTY_FILE on 0-byte buffer", async () => {
            const emptyBuf = loadFixture("empty.txt");
            await expect(parseDocument(emptyBuf, { filename: "empty.txt" })).rejects.toThrow(
                DocumentParserError,
            );
            await expect(parseDocument(emptyBuf, { filename: "empty.txt" })).rejects.toMatchObject({
                code: "EMPTY_FILE",
            });
        });

        it("throws EMPTY_FILE on whitespace-only text document", async () => {
            const wsBuf = Buffer.from("   \n\n\t   ", "utf8");
            await expect(parseDocument(wsBuf, { filename: "ws.txt" })).rejects.toMatchObject({
                code: "EMPTY_FILE",
            });
        });

        it("throws CORRUPT_FILE on corrupted PDF", async () => {
            const corruptPdf = loadFixture("corrupted.pdf");
            await expect(parseDocument(corruptPdf, { filename: "corrupted.pdf" })).rejects.toMatchObject({
                code: "CORRUPT_FILE",
            });
        });

        it("throws CORRUPT_FILE on corrupted DOCX", async () => {
            const corruptDocx = loadFixture("corrupted.docx");
            await expect(parseDocument(corruptDocx, { filename: "corrupted.docx" })).rejects.toMatchObject({
                code: "CORRUPT_FILE",
            });
        });

        it("throws UNSUPPORTED_FORMAT on unsupported binary file", async () => {
            const randomBuf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
            await expect(parseDocument(randomBuf, { filename: "random.bin" })).rejects.toMatchObject({
                code: "UNSUPPORTED_FORMAT",
            });
        });
    });
});
