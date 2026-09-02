import path from "path";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import {
    getFileExtension,
    isSupportedExtension,
    sanitizeFilename,
    type SupportedExtension,
} from "../utils/uploadPolicy.js";

export type DocumentFormat =
    | "pdf"
    | "docx"
    | "pptx"
    | "xlsx"
    | "txt"
    | "md"
    | "csv"
    | "html";

export type DocumentParserErrorCode =
    | "EMPTY_FILE"
    | "CORRUPT_FILE"
    | "ENCRYPTED_FILE"
    | "UNSUPPORTED_FORMAT"
    | "PARSING_FAILED";

export class DocumentParserError extends Error {
    public readonly code: DocumentParserErrorCode;
    public readonly details?: Record<string, unknown>;

    constructor(
        code: DocumentParserErrorCode,
        message: string,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "DocumentParserError";
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, DocumentParserError.prototype);
    }
}

export interface ParseDocumentOptions {
    filename?: string;
    contentType?: string | null;
}

export interface ParsedDocument {
    text: string;
    format: DocumentFormat;
    metadata: {
        filename?: string;
        contentType?: string;
        totalPages?: number;
        slideCount?: number;
        sheetCount?: number;
        sheetNames?: string[];
        characterCount: number;
        [key: string]: unknown;
    };
}

/**
 * Checks if buffer matches standard magic bytes
 */
function hasMagicBytes(buffer: Buffer, bytes: number[]): boolean {
    if (buffer.length < bytes.length) return false;
    for (let i = 0; i < bytes.length; i++) {
        if (buffer[i] !== bytes[i]) return false;
    }
    return true;
}

/**
 * Detects document format based on magic bytes, file extension, and content type.
 */
export function detectDocumentFormat(
    buffer: Buffer,
    filename?: string,
    contentType?: string | null,
): DocumentFormat {
    if (!buffer || buffer.length === 0) {
        throw new DocumentParserError("EMPTY_FILE", "Cannot detect format of empty buffer");
    }

    const ext = filename ? getFileExtension(filename) : "";
    const cleanContentType = contentType ? contentType.split(";")[0].trim().toLowerCase() : "";

    // 1. PDF Magic Bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    if (hasMagicBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
        return "pdf";
    }

    // 2. ZIP Magic Bytes: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (hasMagicBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        if (ext === ".docx" || cleanContentType.includes("wordprocessingml") || cleanContentType === "application/docx") {
            return "docx";
        }
        if (ext === ".pptx" || cleanContentType.includes("presentationml") || cleanContentType === "application/pptx") {
            return "pptx";
        }
        if (ext === ".xlsx" || cleanContentType.includes("spreadsheetml") || cleanContentType === "application/xlsx") {
            return "xlsx";
        }

        // Check extension first if present
        if (ext === ".docx") return "docx";
        if (ext === ".pptx") return "pptx";
        if (ext === ".xlsx") return "xlsx";

        // Fallback for zip files without clear extension: default by ext or throw
        if (ext) {
            throw new DocumentParserError(
                "UNSUPPORTED_FORMAT",
                `ZIP container with extension "${ext}" is not a supported Office document`,
            );
        }
    }

    // 3. Extension & Content-Type based detection for text-like formats
    if (ext === ".md" || cleanContentType === "text/markdown" || cleanContentType === "text/x-markdown") {
        return "md";
    }
    if (ext === ".csv" || cleanContentType === "text/csv" || cleanContentType === "application/csv") {
        return "csv";
    }
    if (
        ext === ".html" ||
        ext === ".htm" ||
        cleanContentType === "text/html" ||
        cleanContentType === "application/xhtml+xml"
    ) {
        return "html";
    }
    if (ext === ".txt" || cleanContentType === "text/plain") {
        return "txt";
    }
    if (ext === ".pdf" || cleanContentType === "application/pdf") {
        return "pdf";
    }
    if (ext === ".docx") return "docx";
    if (ext === ".pptx") return "pptx";
    if (ext === ".xlsx") return "xlsx";

    // Check if starts with HTML DOCTYPE or <html>
    const preview = buffer.slice(0, 256).toString("utf8").trim().toLowerCase();
    if (preview.startsWith("<!doctype html") || preview.startsWith("<html")) {
        return "html";
    }

    throw new DocumentParserError(
        "UNSUPPORTED_FORMAT",
        `Unable to determine document format for file "${filename || "unknown"}" (Content-Type: "${contentType || "unknown"}")`,
    );
}

/**
 * Strips UTF-8 / UTF-16 Byte Order Mark (BOM) and decodes text buffer.
 */
function decodeTextWithBom(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        // UTF-8 BOM
        return buffer.slice(3).toString("utf8");
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        // UTF-16 LE BOM
        return buffer.slice(2).toString("utf16le");
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        // UTF-16 BE BOM
        const swapped = Buffer.alloc(buffer.length - 2);
        for (let i = 2; i < buffer.length - 1; i += 2) {
            swapped[i - 2] = buffer[i + 1];
            swapped[i - 1] = buffer[i];
        }
        return swapped.toString("utf16le");
    }

    // Default UTF-8 decode, strip leading \uFEFF if any
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }
    return text;
}

/**
 * Parses plain text, Markdown, or CSV.
 */
async function parseTextDocument(
    buffer: Buffer,
    format: "txt" | "md" | "csv",
): Promise<string> {
    const text = decodeTextWithBom(buffer).trim();
    if (!text) {
        throw new DocumentParserError("EMPTY_FILE", `The ${format.toUpperCase()} file contains no text content`);
    }
    return text;
}

/**
 * Parses HTML documents, stripping scripts, styles, and tags using Cheerio.
 */
async function parseHtmlDocument(buffer: Buffer): Promise<string> {
    const rawHtml = decodeTextWithBom(buffer);
    if (!rawHtml.trim()) {
        throw new DocumentParserError("EMPTY_FILE", "The HTML document is empty");
    }

    try {
        const $ = cheerio.load(rawHtml);
        $("script, style, noscript, svg, iframe, template, head link, head meta").remove();

        // Extract body text or fallback to document text
        let extractedText = $("body").text();
        if (!extractedText.trim()) {
            extractedText = $.text();
        }

        // Clean up excessive blank lines and whitespace
        const cleanText = extractedText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join("\n");

        if (!cleanText) {
            throw new DocumentParserError("EMPTY_FILE", "HTML document contains no readable text content");
        }

        return cleanText;
    } catch (err: unknown) {
        if (err instanceof DocumentParserError) throw err;
        throw new DocumentParserError(
            "CORRUPT_FILE",
            `Failed to parse HTML document: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

/**
 * Parses PDF documents using PDFParse.
 */
async function parsePdfDocument(buffer: Buffer): Promise<{ text: string; totalPages: number }> {
    if (!hasMagicBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
        throw new DocumentParserError("CORRUPT_FILE", "File does not start with valid PDF magic bytes (%PDF-)");
    }

    try {
        const parser = new PDFParse({ data: buffer });
        if (typeof (parser as any).load === "function") {
            await (parser as any).load();
        }
        const result = await parser.getText();

        const text = (typeof result === "string" ? result : result?.text || "").trim();
        const totalPages = typeof result === "object" && result?.total ? result.total : 1;

        if (!text) {
            throw new DocumentParserError("EMPTY_FILE", "PDF document contains no extractable text");
        }

        return { text, totalPages };
    } catch (err: unknown) {
        if (err instanceof DocumentParserError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        const errName = err instanceof Error ? err.name : "";

        if (
            errName === "PasswordException" ||
            /password|encrypted|decrypt/i.test(msg)
        ) {
            throw new DocumentParserError("ENCRYPTED_FILE", "PDF file is encrypted or password-protected");
        }

        if (
            errName === "InvalidPDFException" ||
            errName === "FormatError" ||
            /invalid pdf|corrupted|bad xref|unexpected eof/i.test(msg)
        ) {
            throw new DocumentParserError("CORRUPT_FILE", `PDF file is corrupted or invalid: ${msg}`);
        }

        throw new DocumentParserError("PARSING_FAILED", `Failed to parse PDF document: ${msg}`);
    }
}

/**
 * Parses DOCX documents using Mammoth.
 */
async function parseDocxDocument(buffer: Buffer): Promise<string> {
    if (!hasMagicBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        throw new DocumentParserError("CORRUPT_FILE", "DOCX file is not a valid ZIP package");
    }

    try {
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value.trim();

        if (!text) {
            throw new DocumentParserError("EMPTY_FILE", "DOCX document contains no readable text");
        }

        return text;
    } catch (err: unknown) {
        if (err instanceof DocumentParserError) throw err;
        const msg = err instanceof Error ? err.message : String(err);

        if (/password|encrypted/i.test(msg)) {
            throw new DocumentParserError("ENCRYPTED_FILE", "DOCX document is encrypted or password-protected");
        }

        if (/zip|corrupted|central directory|invalid/i.test(msg)) {
            throw new DocumentParserError("CORRUPT_FILE", `DOCX file is corrupted or invalid: ${msg}`);
        }

        throw new DocumentParserError("PARSING_FAILED", `Failed to parse DOCX document: ${msg}`);
    }
}

/**
 * Parses XLSX spreadsheets using the xlsx library.
 */
async function parseXlsxDocument(
    buffer: Buffer,
): Promise<{ text: string; sheetCount: number; sheetNames: string[] }> {
    if (!hasMagicBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        throw new DocumentParserError("CORRUPT_FILE", "XLSX file is not a valid ZIP spreadsheet package");
    }

    try {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetNames = workbook.SheetNames || [];

        if (sheetNames.length === 0) {
            throw new DocumentParserError("EMPTY_FILE", "XLSX workbook contains no sheets");
        }

        const sheetOutputs: string[] = [];

        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;

            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
            const cleanCsv = csv
                .split("\n")
                .map((row) => row.trim())
                .filter((row) => row.length > 0 && !/^,+$/.test(row))
                .join("\n");

            if (cleanCsv.trim()) {
                sheetOutputs.push(`--- Sheet: ${sheetName} ---\n${cleanCsv.trim()}`);
            }
        }

        const combinedText = sheetOutputs.join("\n\n").trim();

        if (!combinedText) {
            throw new DocumentParserError("EMPTY_FILE", "XLSX spreadsheet contains no data or readable cells");
        }

        return {
            text: combinedText,
            sheetCount: sheetNames.length,
            sheetNames,
        };
    } catch (err: unknown) {
        if (err instanceof DocumentParserError) throw err;
        const msg = err instanceof Error ? err.message : String(err);

        if (/password|encrypted/i.test(msg)) {
            throw new DocumentParserError("ENCRYPTED_FILE", "XLSX file is encrypted or password-protected");
        }

        if (/zip|corrupt|unsupported/i.test(msg)) {
            throw new DocumentParserError("CORRUPT_FILE", `XLSX file is corrupted: ${msg}`);
        }

        throw new DocumentParserError("PARSING_FAILED", `Failed to parse XLSX document: ${msg}`);
    }
}

/**
 * Helper to decode XML entities in PPTX slide texts.
 */
function decodeXmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

/**
 * Parses PPTX presentations by extracting slide text from ppt/slides/slide*.xml using JSZip.
 */
async function parsePptxDocument(
    buffer: Buffer,
): Promise<{ text: string; slideCount: number }> {
    if (!hasMagicBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        throw new DocumentParserError("CORRUPT_FILE", "PPTX file is not a valid ZIP presentation package");
    }

    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(buffer);
    } catch (err: unknown) {
        throw new DocumentParserError(
            "CORRUPT_FILE",
            `PPTX file is corrupted or cannot be unzipped: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    // Match slide XML files like ppt/slides/slide1.xml, ppt/slides/slide2.xml
    const slideFilePaths = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)![0], 10);
            const numB = parseInt(b.match(/\d+/)![0], 10);
            return numA - numB;
        });

    if (slideFilePaths.length === 0) {
        throw new DocumentParserError("EMPTY_FILE", "PPTX presentation contains no slide XML files");
    }

    const slideTexts: string[] = [];

    for (let i = 0; i < slideFilePaths.length; i++) {
        const slidePath = slideFilePaths[i];
        const slideZipObj = zip.file(slidePath);
        if (!slideZipObj) continue;

        const xmlContent = await slideZipObj.async("text");

        // Extract all text content inside <a:t>...</a:t> tags
        const matches = xmlContent.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi);
        if (matches && matches.length > 0) {
            const rawParts = matches
                .map((m) => m.replace(/<[^>]+>/g, ""))
                .map(decodeXmlEntities)
                .map((t) => t.trim())
                .filter((t) => t.length > 0);

            if (rawParts.length > 0) {
                slideTexts.push(`--- Slide ${i + 1} ---\n${rawParts.join(" ")}`);
            }
        }
    }

    const combinedText = slideTexts.join("\n\n").trim();

    if (!combinedText) {
        throw new DocumentParserError("EMPTY_FILE", "PPTX presentation contains no readable text content in slides");
    }

    return {
        text: combinedText,
        slideCount: slideFilePaths.length,
    };
}

/**
 * Universal document parser dispatching to the appropriate format extractor.
 * Supports: .txt, .md, .csv, .html, .pdf, .docx, .pptx, .xlsx
 */
export async function parseDocument(
    buffer: Buffer,
    options: ParseDocumentOptions = {},
): Promise<ParsedDocument> {
    if (!buffer || buffer.length === 0) {
        throw new DocumentParserError("EMPTY_FILE", "Document buffer is empty (0 bytes)");
    }

    const cleanFilename = options.filename ? sanitizeFilename(options.filename) : undefined;
    const format = detectDocumentFormat(buffer, cleanFilename, options.contentType);

    let extractedText = "";
    let totalPages: number | undefined;
    let slideCount: number | undefined;
    let sheetCount: number | undefined;
    let sheetNames: string[] | undefined;

    switch (format) {
        case "txt":
        case "md":
        case "csv": {
            extractedText = await parseTextDocument(buffer, format);
            break;
        }
        case "html": {
            extractedText = await parseHtmlDocument(buffer);
            break;
        }
        case "pdf": {
            const pdfResult = await parsePdfDocument(buffer);
            extractedText = pdfResult.text;
            totalPages = pdfResult.totalPages;
            break;
        }
        case "docx": {
            extractedText = await parseDocxDocument(buffer);
            break;
        }
        case "pptx": {
            const pptxResult = await parsePptxDocument(buffer);
            extractedText = pptxResult.text;
            slideCount = pptxResult.slideCount;
            break;
        }
        case "xlsx": {
            const xlsxResult = await parseXlsxDocument(buffer);
            extractedText = xlsxResult.text;
            sheetCount = xlsxResult.sheetCount;
            sheetNames = xlsxResult.sheetNames;
            break;
        }
        default: {
            throw new DocumentParserError(
                "UNSUPPORTED_FORMAT",
                `Unsupported document format: ${format}`,
            );
        }
    }

    const characterCount = extractedText.length;

    return {
        text: extractedText,
        format,
        metadata: {
            filename: cleanFilename,
            contentType: options.contentType || undefined,
            totalPages,
            slideCount,
            sheetCount,
            sheetNames,
            characterCount,
        },
    };
}
