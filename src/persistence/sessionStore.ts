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

/** MISC marker that scopes a history record apart from any other user data. */
const HISTORY_SCOPE = 'chat_history';

/**
 * Conversation history is keyed by (user + room + thread), not just user, so a
 * user's threads and channels can never bleed history into one another. The
 * plural association reads/writes use AND semantics: a record must carry every
 * association to match.
 *
 * ``SessionStore`` is constructed fresh per message/command, so cross-request
 * state cannot live on the instance. A per-scope promise chain serializes the
 * read-modify-write cycle, closing the race where two messages in the same
 * scope overwrite each other's history.
 *
 * NOTE: the chain is in-process. Multiple app instances behind a load
 * balancer would still race (Rocket.Chat apps run single-instance today);
 * a multi-instance deploy needs a transactional store on the backend.
 */
export class SessionStore {
    private static chains = new Map<string, Promise<unknown>>();

    constructor(
        private read: IRead,
        private persistence: IPersistence,
    ) {}

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

    public async hasHistory(
        userId: string,
        roomId: string,
        threadId?: string,
    ): Promise<boolean> {
        const history = await this.getHistory(userId, roomId, threadId, 1);
        return history.length > 0;
    }

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

        // upsert=true creates the record when absent, and replaces it (re-adding
        // the associations) when present — a single atomic write per turn.
        await this.persistence.updateByAssociations(assocs, data, true);
    }

    /**
     * Serialize writes per scope. Each task chains onto the scope's previous
     * task so concurrent fast messages cannot interleave read→append→write.
     */
    private enqueue<T>(scope: string, task: () => Promise<T>): Promise<T> {
        const prev = SessionStore.chains.get(scope) ?? Promise.resolve();
        const run = prev.then(task, task);
        // Keep the chain alive after a rejection so one failure doesn't wedge
        // the scope's queue forever.
        SessionStore.chains.set(scope, run.catch(() => undefined));
        return run;
    }

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
     * Coerce a raw persistence record into a well-formed ``SessionData``.
     *
     * A corrupted or foreign record must not crash the caller; missing/empty
     * fields fall back to safe defaults.
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