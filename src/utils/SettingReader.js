"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMaxHistory = readMaxHistory;
exports.readBoolean = readBoolean;
const DEFAULT_MAX_HISTORY = 10;
function readMaxHistory(value) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_HISTORY;
}
function readBoolean(value, fallback = true) {
    if (typeof value === 'boolean') {
        return value;
    }
    return fallback;
}
