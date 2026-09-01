"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
exports.asNonEmptyString = asNonEmptyString;
function asNonEmptyString(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
}
class Validator {
    static isValidUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        }
        catch (_a) {
            return false;
        }
    }
    static isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }
    static asNonEmptyString(value, fallback) {
        return asNonEmptyString(value, fallback);
    }
    static sanitizeInput(input) {
        return input.trim().slice(0, 4000);
    }
}
exports.Validator = Validator;
