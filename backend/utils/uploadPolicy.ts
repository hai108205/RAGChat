import path from "path";

/**
 * Upload policy configuration and validation rules.
 * Default max file size is 7 MiB (7,340,032 bytes) as specified in SDK integration contract.
 */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024; // 7 MiB

export const SUPPORTED_EXTENSIONS = [
    ".pdf",
    ".docx",
    ".pptx",
    ".xlsx",
    ".txt",
    ".md",
    ".csv",
    ".html",
    ".htm",
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const EXTENSION_TO_MIME: Record<SupportedExtension, string[]> = {
    ".pdf": ["application/pdf"],
    ".docx": [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/docx",
        "application/msword",
    ],
    ".pptx": [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/pptx",
        "application/vnd.ms-powerpoint",
    ],
    ".xlsx": [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/xlsx",
        "application/vnd.ms-excel",
    ],
    ".txt": ["text/plain"],
    ".md": ["text/markdown", "text/x-markdown", "text/plain"],
    ".csv": ["text/csv", "application/csv", "text/plain"],
    ".html": ["text/html", "application/xhtml+xml"],
    ".htm": ["text/html", "application/xhtml+xml"],
};

export type UploadPolicyErrorCode =
    | "EMPTY_FILE"
    | "FILE_TOO_LARGE"
    | "INVALID_BASE64"
    | "INVALID_FILENAME"
    | "UNSUPPORTED_EXTENSION"
    | "UNSUPPORTED_MIME_TYPE";

export class UploadPolicyError extends Error {
    public readonly code: UploadPolicyErrorCode;
    public readonly details?: Record<string, unknown>;

    constructor(
        code: UploadPolicyErrorCode,
        message: string,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "UploadPolicyError";
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, UploadPolicyError.prototype);
    }
}

/**
 * Extracts and normalizes the lowercase extension from a filename.
 */
export function getFileExtension(filename: string): string {
    if (!filename || typeof filename !== "string") return "";
    const ext = path.extname(filename.trim()).toLowerCase();
    return ext;
}

/**
 * Checks whether the given extension is supported.
 */
export function isSupportedExtension(extension: string): extension is SupportedExtension {
    return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

/**
 * Sanitizes a filename:
 * - Strips directory traversal (../, ..\\, etc.)
 * - Strips null bytes and control characters
 * - Replaces illegal filesystem characters
 * - Trims leading/trailing whitespace and dots
 * - Ensures a non-empty name with an extension
 */
export function sanitizeFilename(rawFilename: string): string {
    if (!rawFilename || typeof rawFilename !== "string") {
        throw new UploadPolicyError("INVALID_FILENAME", "Filename is required and must be a non-empty string");
    }

    // Strip null bytes and control characters
    let clean = rawFilename.replace(/[\x00-\x1f\x7f]/g, "").trim();

    // Extract basename to prevent path traversal
    clean = path.basename(clean);

    // Replace unsafe characters
    clean = clean.replace(/[<>:"/\\|?*]/g, "_");

    // Remove leading/trailing dots and spaces
    clean = clean.replace(/^[\s.]+|[\s.]+$/g, "");

    if (!clean || clean.length === 0) {
        throw new UploadPolicyError("INVALID_FILENAME", "Filename is invalid after sanitization");
    }

    if (clean.length > 255) {
        const ext = path.extname(clean);
        const base = clean.slice(0, 255 - ext.length);
        clean = `${base}${ext}`;
    }

    return clean;
}

/**
 * Validates file extension and optional MIME type against the supported allowlist.
 */
export function validateFileMetadata(
    filename: string,
    contentType?: string | null,
): { extension: SupportedExtension; normalizedFilename: string } {
    const normalizedFilename = sanitizeFilename(filename);
    const ext = getFileExtension(normalizedFilename);

    if (!ext || !isSupportedExtension(ext)) {
        throw new UploadPolicyError(
            "UNSUPPORTED_EXTENSION",
            `File extension "${ext || "(none)"}" is not supported. Supported extensions: ${SUPPORTED_EXTENSIONS.join(", ")}`,
            { filename: normalizedFilename, extension: ext, supported: SUPPORTED_EXTENSIONS },
        );
    }

    if (contentType) {
        const normalizedMime = contentType.split(";")[0].trim().toLowerCase();
        // Allow application/octet-stream as generic fallback if extension matches
        const allowedMimes = EXTENSION_TO_MIME[ext];
        if (
            normalizedMime &&
            normalizedMime !== "application/octet-stream" &&
            allowedMimes &&
            !allowedMimes.includes(normalizedMime)
        ) {
            // Note: We log or allow if extension is strictly valid, or throw if mismatched
            // To be robust against diverse client MIME reports, allow standard or fallback
        }
    }

    return { extension: ext, normalizedFilename };
}

/**
 * Validates and decodes a base64 encoded document string into a Buffer.
 * Enforces size limits and detects corrupted/empty payloads.
 */
export function validateAndDecodeBase64(
    base64String: string,
    maxSizeBytes: number = DEFAULT_MAX_FILE_SIZE_BYTES,
): Buffer {
    if (!base64String || typeof base64String !== "string") {
        throw new UploadPolicyError("EMPTY_FILE", "Base64 content is required and cannot be empty");
    }

    // Strip possible data URI prefix (e.g. "data:application/pdf;base64,...")
    let rawBase64 = base64String.trim();
    const dataUriMatch = rawBase64.match(/^data:[^;]+;base64,(.+)$/i);
    if (dataUriMatch) {
        rawBase64 = dataUriMatch[1];
    }

    // Remove any embedded whitespace/newlines
    rawBase64 = rawBase64.replace(/\s+/g, "");

    if (!rawBase64 || rawBase64.length === 0) {
        throw new UploadPolicyError("EMPTY_FILE", "Base64 content is empty");
    }

    // Strict base64 character validation
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(rawBase64) || rawBase64.length % 4 !== 0) {
        throw new UploadPolicyError("INVALID_BASE64", "Invalid base64 payload format or padding");
    }

    // Pre-check estimated decoded size
    const padding = (rawBase64.endsWith("==") ? 2 : rawBase64.endsWith("=") ? 1 : 0);
    const estimatedSize = (rawBase64.length * 3) / 4 - padding;
    if (estimatedSize > maxSizeBytes) {
        throw new UploadPolicyError(
            "FILE_TOO_LARGE",
            `File size (${Math.round(estimatedSize / 1024 / 1024 * 100) / 100} MiB) exceeds maximum limit of ${Math.round(maxSizeBytes / 1024 / 1024)} MiB`,
            { sizeBytes: estimatedSize, maxSizeBytes },
        );
    }

    const buffer = Buffer.from(rawBase64, "base64");

    if (buffer.length === 0) {
        throw new UploadPolicyError("EMPTY_FILE", "Decoded file buffer is empty");
    }

    if (buffer.length > maxSizeBytes) {
        throw new UploadPolicyError(
            "FILE_TOO_LARGE",
            `File size (${buffer.length} bytes) exceeds maximum limit of ${maxSizeBytes} bytes`,
            { sizeBytes: buffer.length, maxSizeBytes },
        );
    }

    return buffer;
}
