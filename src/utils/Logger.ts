import { ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import { Validator } from './Validator';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogPhase = 'start' | 'accepted' | 'complete' | 'fail' | 'rejected' | 'duplicate' | 'in_progress';
export type LogOutcome = 'success' | 'failure' | 'accepted' | 'rejected' | 'duplicate' | 'in_progress';

export interface LogContext {
    event?: string;
    operation?: string;
    phase?: LogPhase;
    outcome?: LogOutcome;
    requestId?: string;
    jobId?: string;
    source?: string;
    component?: string;
    durationMs?: number;
    statusCode?: number;
    errorCode?: string;
    errorName?: string;
    errorMessage?: string;
    stack?: string;
    userId?: string;
    roomId?: string;
    workspaceId?: string;
    threadId?: string;
    method?: string;
    path?: string;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface StructuredLogRecord extends LogContext {
    timestamp: string;
    level: LogLevel;
    message: string;
    source: string;
    component: string;
}

const SENSITIVE_KEY_PATTERNS = [
    /token/i,
    /key/i,
    /secret/i,
    /password/i,
    /auth/i,
    /bearer/i,
    /base64/i,
    /contentbase64/i,
    /query/i,
    /prompt/i,
    /question/i,
    /rawmarkdown/i,
    /rawtext/i,
    /snippet/i,
    /filecontent/i,
    /body/i,
    /text/i,
    /message/i,
];

/**
 * Sanitizes arbitrary log data recursively by masking sensitive keys and trimming string bounds.
 * Prevents leakage of tokens, base64 payloads, queries, messages, and user secrets.
 */
export function sanitizeLogData<T>(data: T, seen = new WeakSet<object>()): T {
    if (data === null || data === undefined) {
        return data;
    }

    if (typeof data === 'string') {
        if (data.startsWith('Bearer ') || data.startsWith('Basic ')) {
            return '[REDACTED_AUTH]' as unknown as T;
        }
        return Validator.sanitizeInput(data) as unknown as T;
    }

    if (typeof data !== 'object') {
        return data;
    }

    if (seen.has(data as object)) {
        return '[CIRCULAR]' as unknown as T;
    }
    seen.add(data as object);

    if (Array.isArray(data)) {
        return data.map((item) => sanitizeLogData(item, seen)) as unknown as T;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
        if (isSensitiveKey) {
            sanitized[key] = '[REDACTED]';
        } else {
            sanitized[key] = sanitizeLogData(value, seen);
        }
    }

    return sanitized as T;
}

function sanitizeErrorMessage(msg: string): string {
    const sanitized = Validator.sanitizeInput(msg || '');
    return sanitized
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/(?:api[-_]?key|token|integration[-_]?token|secret|password|auth|bearer)=([^\s&;,]+)/gi, 'token=[REDACTED]')
        .replace(/(?:query|prompt|question)=([^\s&;,]+)/gi, 'query=[REDACTED]');
}

function sanitizeStack(stack?: string): string | undefined {
    if (!stack) {
        return undefined;
    }

    return sanitizeErrorMessage(stack)
        .replace(/\b[A-Za-z]:[\\/][^\s)\n]+/g, '[REDACTED_PATH]');
}

/**
 * Normalizes any caught error into a standardized error record.
 */
export function normalizeError(error: unknown): {
    errorName: string;
    errorMessage: string;
    errorCode: string;
    statusCode?: number;
    stack?: string;
} {
    if (error instanceof Error) {
        let statusCode: number | undefined;
        let errorCode: string | undefined = (error as { code?: string }).code;

        if ((error as { statusCode?: number }).statusCode) {
            statusCode = (error as { statusCode?: number }).statusCode;
        } else {
            const statusMatch = error.message.match(/\b(?:status(?:Code)?|error)\s*\(?(\d{3})\)?/i) || error.message.match(/\b(\d{3})\b/);
            if (statusMatch) {
                statusCode = parseInt(statusMatch[1], 10);
            }
        }

        if (!errorCode) {
            errorCode = statusCode ? `HTTP_${statusCode}` : error.name || 'ERROR';
        }

        return {
            errorName: error.name || 'Error',
            errorMessage: sanitizeErrorMessage(error.message),
            errorCode,
            statusCode,
            stack: sanitizeStack(error.stack),
        };
    }

    const rawMsg = typeof error === 'string' ? error : 'Unknown error';
    return {
        errorName: 'Error',
        errorMessage: sanitizeErrorMessage(rawMsg),
        errorCode: 'UNKNOWN_ERROR',
    };
}

/**
 * Contextual, structured JSON logger wrapping the Apps-Engine `ILogger`.
 * Produces parseable JSON log records adhering to the RAGChat SDK observability contract.
 */
export class Logger {
    private readonly defaultSource = 'ragchat-sdk';

    constructor(
        private logger?: ILogger | null,
        private context: string = 'RAGChat',
    ) {}

    public child(childComponent: string): Logger {
        const nextContext = this.context === 'RAGChat'
            ? childComponent
            : `${this.context}:${childComponent}`;
        return new Logger(this.logger, nextContext);
    }

    public getContext(): string {
        return this.context;
    }

    public getUnderlyingLogger(): ILogger | null | undefined {
        return this.logger;
    }

    /**
     * Emits a structured log record with full contract fields.
     */
    public logRecord(level: LogLevel, message: string, context?: LogContext): void {
        const record: StructuredLogRecord = {
            timestamp: new Date().toISOString(),
            level,
            source: context?.source || this.defaultSource,
            component: context?.component || this.context,
            message: sanitizeErrorMessage(message),
            event: context?.event || `${(context?.component || this.context).toLowerCase()}.${context?.operation || 'action'}.${context?.phase || 'event'}`,
            operation: context?.operation,
            phase: context?.phase,
            outcome: context?.outcome,
            requestId: context?.requestId,
            jobId: context?.jobId,
            durationMs: context?.durationMs,
            statusCode: context?.statusCode,
            errorCode: context?.errorCode,
            errorName: context?.errorName,
            errorMessage: context?.errorMessage ? sanitizeErrorMessage(context.errorMessage) : undefined,
            userId: context?.userId,
            roomId: context?.roomId,
            workspaceId: context?.workspaceId,
            threadId: context?.threadId,
            method: context?.method,
            path: context?.path,
            details: context?.details ? (sanitizeLogData(context.details) as Record<string, unknown>) : undefined,
        };

        if (level === 'error' || level === 'debug') {
            if (context?.stack) {
                record.stack = sanitizeStack(context.stack);
            }
        }

        // Clean undefined properties so JSON is compact
        const cleanedRecord: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(record)) {
            if (v !== undefined) {
                cleanedRecord[k] = v;
            }
        }

        const jsonOutput = JSON.stringify(cleanedRecord);

        if (this.logger) {
            switch (level) {
                case 'debug':
                    this.logger.debug(jsonOutput);
                    break;
                case 'info':
                    this.logger.info(jsonOutput);
                    break;
                case 'warn':
                    this.logger.warn(jsonOutput);
                    break;
                case 'error':
                    this.logger.error(jsonOutput);
                    break;
            }
        } else {
            switch (level) {
                case 'debug':
                    console.debug(jsonOutput);
                    break;
                case 'info':
                    console.info(jsonOutput);
                    break;
                case 'warn':
                    console.warn(jsonOutput);
                    break;
                case 'error':
                    console.error(jsonOutput);
                    break;
            }
        }
    }

    // --- High-level lifecycle / phase helpers ---

    public started(operation: string, data?: Partial<LogContext>): void {
        this.logRecord('info', `${this.context} ${operation} started`, {
            ...data,
            operation,
            phase: 'start',
            outcome: 'in_progress',
            event: data?.event || `${this.context.toLowerCase()}.${operation}.started`,
        });
    }

    public accepted(operation: string, data?: Partial<LogContext>): void {
        this.logRecord('info', `${this.context} ${operation} accepted`, {
            ...data,
            operation,
            phase: 'accepted',
            outcome: 'accepted',
            event: data?.event || `${this.context.toLowerCase()}.${operation}.accepted`,
        });
    }

    public completed(operation: string, data?: Partial<LogContext>): void {
        this.logRecord('info', `${this.context} ${operation} completed`, {
            ...data,
            operation,
            phase: 'complete',
            outcome: 'success',
            event: data?.event || `${this.context.toLowerCase()}.${operation}.completed`,
        });
    }

    public failed(operation: string, error: unknown, data?: Partial<LogContext>): void {
        const errorInfo = normalizeError(error);
        this.logRecord('error', `${this.context} ${operation} failed: ${errorInfo.errorMessage}`, {
            ...errorInfo,
            ...data,
            operation,
            phase: 'fail',
            outcome: 'failure',
            event: data?.event || `${this.context.toLowerCase()}.${operation}.failed`,
        });
    }

    public rejected(operation: string, reason: string, data?: Partial<LogContext>): void {
        this.logRecord('warn', `${this.context} ${operation} rejected: ${reason}`, {
            ...data,
            operation,
            phase: 'rejected',
            outcome: 'failure',
            errorMessage: reason,
            event: data?.event || `${this.context.toLowerCase()}.${operation}.rejected`,
        });
    }

    public duplicate(operation: string, data?: Partial<LogContext>): void {
        this.logRecord('info', `${this.context} ${operation} duplicate ignored`, {
            ...data,
            operation,
            phase: 'duplicate',
            outcome: 'success',
            event: data?.event || `${this.context.toLowerCase()}.${operation}.duplicate`,
        });
    }

    // --- Standard Level Helpers ---

    public debug(message: string, context?: Partial<LogContext> | Record<string, unknown>): void {
        this.logRecord('debug', message, context as Partial<LogContext>);
    }

    public info(message: string, context?: Partial<LogContext> | Record<string, unknown>): void {
        this.logRecord('info', message, context as Partial<LogContext>);
    }

    public warn(message: string, context?: Partial<LogContext> | Record<string, unknown>): void {
        this.logRecord('warn', message, context as Partial<LogContext>);
    }

    public error(message: string, errorOrContext?: unknown): void {
        if (errorOrContext instanceof Error || (typeof errorOrContext === 'object' && errorOrContext !== null && !('operation' in errorOrContext))) {
            const errorInfo = normalizeError(errorOrContext);
            this.logRecord('error', message, errorInfo);
        } else {
            this.logRecord('error', message, errorOrContext as Partial<LogContext>);
        }
    }
}

