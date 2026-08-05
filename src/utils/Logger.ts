import { ILogger } from '@rocket.chat/apps-engine/definition/accessors';

export class Logger {
    constructor(
        private logger: ILogger,
        private context: string,
    ) {}

    public debug(message: string, ...args: unknown[]): void {
        this.logger.debug(`[${this.context}] ${message}`, ...args);
    }

    public info(message: string, ...args: unknown[]): void {
        this.logger.info(`[${this.context}] ${message}`, ...args);
    }

    public warn(message: string, ...args: unknown[]): void {
        this.logger.warn(`[${this.context}] ${message}`, ...args);
    }

    public error(message: string, ...args: unknown[]): void {
        this.logger.error(`[${this.context}] ${message}`, ...args);
    }
}
