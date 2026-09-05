import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { DocumentSegment, DocumentType } from "./segments.js";
import { validateSegments } from "./segments.js";

export interface ChunkingOptions {
    chunkSize: number;
    chunkOverlap: number;
}

/** Approximate tokenizer for deterministic, provider-neutral chunk budgets. */
export function estimateChunkTokens(text: string): number {
    return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

function splitterFor(type: DocumentType, options: ChunkingOptions) {
    const tokenOptions = { ...options, lengthFunction: estimateChunkTokens };
    if (type === "markdown") return new MarkdownTextSplitter(tokenOptions);
    if (type === "code") return RecursiveCharacterTextSplitter.fromLanguage("js", tokenOptions);
    if (type === "html") return RecursiveCharacterTextSplitter.fromLanguage("html", tokenOptions);
    return new RecursiveCharacterTextSplitter({ ...tokenOptions, separators: ["\n\n", "\n", ". ", " ", ""] });
}

function headingAt(text: string, position: number): string | undefined {
    const before = text.slice(0, position);
    const headings = [...before.matchAll(/^#{1,6}\s+(.+)$/gm)];
    return headings.at(-1)?.[1]?.trim();
}

export async function splitIntoSegments(input: {
    text: string;
    documentType: DocumentType;
    locator?: string;
    metadata?: Record<string, unknown>;
    options: ChunkingOptions;
}): Promise<DocumentSegment[]> {
    if (input.options.chunkSize < 1 || input.options.chunkOverlap < 0 || input.options.chunkOverlap >= input.options.chunkSize) {
        throw new Error("Invalid chunking options");
    }
    const text = input.text.replace(/\r\n/g, "\n").trim();
    if (!text) return [];
    const chunks = await splitterFor(input.documentType, input.options).splitText(text);
    let cursor = 0;
    return validateSegments(chunks.map((content) => {
        const index = text.indexOf(content.slice(0, 80), cursor);
        const offset = index >= 0 ? index : cursor;
        cursor = Math.max(cursor, offset + content.length);
        return {
            content,
            metadata: {
                documentType: input.documentType,
                locator: input.locator || "document",
                ...(headingAt(text, offset) ? { heading: headingAt(text, offset) } : {}),
                ...input.metadata,
                segmentIndex: 0,
            },
        };
    }));
}

function toRagDocumentType(format: string): DocumentType {
    if (format === "md") return "markdown";
    if (format === "html") return "html";
    if (["pdf", "docx", "pptx", "xlsx"].includes(format)) return format as DocumentType;
    return "plain";
}

export async function splitParsedDocumentSegments(input: {
    format: string;
    segments: readonly { content: string; metadata: Record<string, unknown> }[];
}, options: ChunkingOptions): Promise<DocumentSegment[]> {
    const documentType = toRagDocumentType(input.format);
    const chunks = await Promise.all(input.segments.map((segment) => splitIntoSegments({
        text: segment.content,
        documentType,
        locator: typeof segment.metadata.locator === "string" ? segment.metadata.locator : "document",
        metadata: segment.metadata,
        options,
    })));
    return validateSegments(chunks.flat());
}
