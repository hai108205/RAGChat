/**
 * Creates a correlation ID that remains recognizable by its business prefix
 * while relying on Web Crypto for collision-resistant entropy.
 */
export function createRequestId(prefix: string): string {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
