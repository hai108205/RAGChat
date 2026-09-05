export type DocumentType = "markdown" | "html" | "pdf" | "code" | "plain" | "docx" | "pptx" | "xlsx";

export interface DocumentSegment {
    content: string;
    metadata: {
        documentType: DocumentType;
        heading?: string;
        page?: number;
        section?: string;
        locator: string;
        segmentIndex: number;
        [key: string]: unknown;
    };
}

export function validateSegments(segments: readonly DocumentSegment[]): DocumentSegment[] {
    const seen = new Set<string>();
    return segments.filter((segment) => {
        const content = segment.content.replace(/\s+/g, " ").trim();
        if (!content) return false;
        const key = `${segment.metadata.locator}|${content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map((segment, index) => ({
        ...segment,
        content: segment.content.trim(),
        metadata: { ...segment.metadata, segmentIndex: index },
    }));
}
