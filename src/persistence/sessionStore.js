"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const metadata_1 = require("@rocket.chat/apps-engine/definition/metadata");
const HISTORY_SCOPE = 'chat_history';
class SessionStore {
    constructor(read, persistence) {
        this.read = read;
        this.persistence = persistence;
    }
    async getHistory(userId, roomId, threadId, maxHistory) {
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
    addMessages(userId, roomId, threadId, newMessages, maxHistory) {
        const scope = this.scopeKey(userId, roomId, threadId);
        return this.enqueue(scope, () => this.append(userId, roomId, threadId, newMessages, maxHistory));
    }
    clearHistory(userId, roomId, threadId) {
        const scope = this.scopeKey(userId, roomId, threadId);
        return this.enqueue(scope, async () => {
            const assocs = this.getAssociations(userId, roomId, threadId);
            await this.persistence.removeByAssociations(assocs);
        });
    }
    async hasHistory(userId, roomId, threadId) {
        const history = await this.getHistory(userId, roomId, threadId, 1);
        return history.length > 0;
    }
    async append(userId, roomId, threadId, newMessages, maxHistory) {
        var _a;
        const assocs = this.getAssociations(userId, roomId, threadId);
        const existing = await this.read
            .getPersistenceReader()
            .readByAssociations(assocs);
        const prior = this.normalizeSessionData((_a = existing[0]) !== null && _a !== void 0 ? _a : null);
        const now = Date.now();
        const limit = this.resolveLimit(maxHistory, prior.messages.length + newMessages.length);
        const data = {
            messages: [...prior.messages, ...newMessages].slice(-limit),
            createdAt: prior.createdAt || now,
            updatedAt: now,
        };
        await this.persistence.updateByAssociations(assocs, data, true);
    }
    enqueue(scope, task) {
        var _a;
        const prev = (_a = SessionStore.chains.get(scope)) !== null && _a !== void 0 ? _a : Promise.resolve();
        const run = prev.then(task, task);
        SessionStore.chains.set(scope, run.catch(() => undefined));
        return run;
    }
    getAssociations(userId, roomId, threadId) {
        const assocs = [
            new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.USER, userId),
            new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.ROOM, roomId),
            new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.MISC, HISTORY_SCOPE),
        ];
        if (threadId) {
            assocs.push(new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.MISC, `thread:${threadId}`));
        }
        return assocs;
    }
    scopeKey(userId, roomId, threadId) {
        return `${userId}:${roomId}:${threadId !== null && threadId !== void 0 ? threadId : ''}`;
    }
    resolveLimit(maxHistory, fallback) {
        return Number.isFinite(maxHistory) && maxHistory > 0
            ? Math.floor(maxHistory)
            : fallback;
    }
    normalizeSessionData(raw) {
        const record = (raw && typeof raw === 'object' ? raw : {});
        const messages = Array.isArray(record.messages) ? record.messages : [];
        const createdAt = typeof record.createdAt === 'number' ? record.createdAt : 0;
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0;
        const validMessages = messages.filter((m) => !!m &&
            typeof m.content === 'string' &&
            typeof m.timestamp === 'number' &&
            (m.role === 'user' || m.role === 'assistant'));
        return { messages: validMessages, createdAt, updatedAt };
    }
}
exports.SessionStore = SessionStore;
SessionStore.chains = new Map();
