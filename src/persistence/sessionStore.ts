import {
    IRead,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface SessionData {
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

/** MISC marker that scopes a history record apart from any other app data. */
const HISTORY_SCOPE = 'chat_history';

/**
 * Manages conversational session history per (User + Room + Thread).
 *
 * Design & Architecture:
 * - Scoped Storage: Uses compound `RocketChatAssociationRecord` (User, Room, History Scope, Thread).
 *   Because Rocket.Chat association queries use logical AND, history never leaks across different rooms/threads.
 * - Race Condition Protection: Serializes read-modify-write turns per scope using in-process Promise chains.
 * - Atomic Upsert: Uses `persistence.updateByAssociations(assocs, data, true)` so creation/update is atomic.
 * - Memory Defense: Validates and normalizes corrupted/malformed historical records gracefully.
 */
export class SessionStore {
    private static chains = new Map<string, Promise<unknown>>();

    constructor(
        private read: IRead,
        private persistence: IPersistence,
    ) {}

    /**
     * Retrieves the most recent conversation messages for a user in a room/thread.
     *
     * @param userId The Rocket.Chat user ID
     * @param roomId The Rocket.Chat room ID
     * @param threadId Optional thread ID
     * @param maxHistory Maximum number of messages to return (capped to recent)
     * @returns Array of ChatMessage objects ordered oldest to newest
     */
    public async getHistory(
        userId: string,
        roomId: string,
        threadId?: string,
        maxHistory?: number,
    ): Promise<ChatMessage[]> {
        const assocs = this.getAssociations(userId, roomId, threadId);
        const records = await this.read
            .getPersistenceReader()
            .readByAssociations(assocs);

        if (records.length === 0) {
            return [];
        }

        const data = this.normalizeSessionData(records[0]);
        const limit = this.resolveLimit(maxHistory, data.messages.length);
        return data.messages.slice(-limit);
    }

    /**
     * Appends new messages (user question + assistant response) to the session history.
     * Automatically caps history size to `maxHistory`.
     *
     * @param userId The Rocket.Chat user ID
     * @param roomId The Rocket.Chat room ID
     * @param threadId Optional thread ID
     * @param newMessages Array of new messages to append
     * @param maxHistory Optional maximum message limit
     */
    public addMessages(
        userId: string,
        roomId: string,
        threadId: string | undefined,
        newMessages: ChatMessage[],
        maxHistory?: number,
    ): Promise<void> {
        const scope = this.scopeKey(userId, roomId, threadId);
        return this.enqueue(scope, () =>
            this.append(userId, roomId, threadId, newMessages, maxHistory),
        );
    }

    /**
     * Clears all conversational history for the given user, room, and thread.
     */
    public clearHistory(
        userId: string,
        roomId: string,
        threadId?: string,
    ): Promise<void> {
        const scope = this.scopeKey(userId, roomId, threadId);
        return this.enqueue(scope, async () => {
            const assocs = this.getAssociations(userId, roomId, threadId);
            await this.persistence.removeByAssociations(assocs);
        });
    }

    /**
     * Checks whether any conversation history exists for the given scope.
     */
    public async hasHistory(
        userId: string,
        roomId: string,
        threadId?: string,
    ): Promise<boolean> {
        const history = await this.getHistory(userId, roomId, threadId, 1);
        return history.length > 0;
    }

    /**
     * Internal atomic append operation.
     */
    private async append(
        userId: string,
        roomId: string,
        threadId: string | undefined,
        newMessages: ChatMessage[],
        maxHistory?: number,
    ): Promise<void> {
        const assocs = this.getAssociations(userId, roomId, threadId);
        const existing = await this.read
            .getPersistenceReader()
            .readByAssociations(assocs);

        const prior = this.normalizeSessionData(existing[0] ?? null);
        const now = Date.now();
        const limit = this.resolveLimit(
            maxHistory,
            prior.messages.length + newMessages.length,
        );

        const data: SessionData = {
            messages: [...prior.messages, ...newMessages].slice(-limit),
            createdAt: prior.createdAt || now,
            updatedAt: now,
        };

        // upsert=true creates the record when absent, and replaces it when present.
        await this.persistence.updateByAssociations(assocs, data, true);
    }

    /**
     * Serializes writes per scope. Each task chains onto the scope's previous
     * task so concurrent fast messages cannot interleave read→append→write.
     */
    private enqueue<T>(scope: string, task: () => Promise<T>): Promise<T> {
        const prev = SessionStore.chains.get(scope) ?? Promise.resolve();
        const run = prev.then(task, task);
        // Keep the chain alive after a rejection so one failure doesn't wedge the queue.
        SessionStore.chains.set(scope, run.catch(() => undefined));
        return run;
    }

    /**
     * Constructs compound association records (USER + ROOM + MISC scope + optional Thread).
     */
    private getAssociations(
        userId: string,
        roomId: string,
        threadId?: string,
    ): Array<RocketChatAssociationRecord> {
        const assocs = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId),
            new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, HISTORY_SCOPE),
        ];
        if (threadId) {
            assocs.push(
                new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `thread:${threadId}`),
            );
        }
        return assocs;
    }

    private scopeKey(
        userId: string,
        roomId: string,
        threadId?: string,
    ): string {
        return `${userId}:${roomId}:${threadId ?? ''}`;
    }

    private resolveLimit(maxHistory: number | undefined, fallback: number): number {
        return Number.isFinite(maxHistory) && (maxHistory as number) > 0
            ? Math.floor(maxHistory as number)
            : fallback;
    }

    /**
     * Coerces a raw persistence record into a well-formed SessionData.
     * A corrupted record will not crash the caller; invalid fields fall back to safe defaults.
     */
    private normalizeSessionData(raw: unknown): SessionData {
        const record = (raw && typeof raw === 'object' ? raw : {}) as Partial<SessionData>;
        const messages = Array.isArray(record.messages) ? record.messages : [];
        const createdAt = typeof record.createdAt === 'number' ? record.createdAt : 0;
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0;

        // Drop malformed entries so downstream formatting never throws.
        const validMessages = messages.filter(
            (m): m is ChatMessage =>
                !!m &&
                typeof m.content === 'string' &&
                typeof m.timestamp === 'number' &&
                (m.role === 'user' || m.role === 'assistant'),
        );
        return { messages: validMessages, createdAt, updatedAt };
    }
}