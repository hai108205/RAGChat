/**
 * Creates a correlation ID that remains recognizable by its business prefix
 * using a pseudo-random UUID generator, as Node's native crypto module
 * is not consistently available in the Rocket.Chat Apps Engine sandbox.
 */
export function createRequestId(prefix: string): string {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    return `${prefix}-${uuid}`;
}
