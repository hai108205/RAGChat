"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    constructor(logger, context) {
        this.logger = logger;
        this.context = context;
    }
    debug(message, ...args) {
        this.logger.debug(`[${this.context}] ${message}`, ...args);
    }
    info(message, ...args) {
        this.logger.info(`[${this.context}] ${message}`, ...args);
    }
    warn(message, ...args) {
        this.logger.warn(`[${this.context}] ${message}`, ...args);
    }
    error(message, ...args) {
        this.logger.error(`[${this.context}] ${message}`, ...args);
    }
}
exports.Logger = Logger;
