/**
 * Coerces unknown input to non-empty string or returns fallback.
 */
export function asNonEmptyString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Validation and sanitization helpers for URL verification and string normalization.
 */
export class Validator {
    /**
     * Validates whether a string is a well-formed http or https URL.
     */
    public static isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * Type guard verifying that value is a non-empty string.
     */
    public static isNonEmptyString(value: unknown): value is string {
        return typeof value === 'string' && value.trim().length > 0;
    }

    /**
     * Coerces unknown input to non-empty string or returns fallback.
     */
    public static asNonEmptyString(value: unknown, fallback: string): string {
        return asNonEmptyString(value, fallback);
    }

    /**
     * Trims and bounds user input to a safe character limit.
     */
    public static sanitizeInput(input: string): string {
        return input.trim().slice(0, 4000);
    }
}


