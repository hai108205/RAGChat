/**
 * Safe setting readers — coerce raw app-setting values into usable types with
 * sensible fallbacks, so a missing or misconfigured setting can never propagate
 * ``undefined``/``NaN`` into the app logic.
 */

const DEFAULT_MAX_HISTORY = 10;

/** Coerce a `max-history` setting value into a positive integer. */
export function readMaxHistory(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_HISTORY;
}

/** Coerce a boolean setting; anything unset/misconfigured falls back to `true`. */
export function readBoolean(value: unknown, fallback = true): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    return fallback;
}