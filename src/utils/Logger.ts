import { ILogger } from '@rocket.chat/apps-engine/definition/accessors';

/**
 * Scoped logging utility wrapping the Apps-Engine `ILogger`.
 * Prefixes log output with the class/component context.
 */
export class Logger {
    constructor(
        private logger?: ILogger | null,
        private context: string = 'RAGChat',
    ) {}

    public debug(message: string, ...args: unknown[]): void {
        if (this.logger) {
            this.logger.debug(`[${this.context}] ${message}`, ...args);
        } else {
            console.debug(`[${this.context}] ${message}`, ...args);
        }
    }

    public info(message: string, ...args: unknown[]): void {
        if (this.logger) {
            this.logger.info(`[${this.context}] ${message}`, ...args);
        } else {
            console.info(`[${this.context}] ${message}`, ...args);
        }
    }

    public warn(message: string, ...args: unknown[]): void {
        if (this.logger) {
            this.logger.warn(`[${this.context}] ${message}`, ...args);
        } else {
            console.warn(`[${this.context}] ${message}`, ...args);
        }
    }

    public error(message: string, ...args: unknown[]): void {
        if (this.logger) {
            this.logger.error(`[${this.context}] ${message}`, ...args);
        } else {
            console.error(`[${this.context}] ${message}`, ...args);
        }
    }
}

