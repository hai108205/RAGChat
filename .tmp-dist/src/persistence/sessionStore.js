"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const metadata_1 = require("@rocket.chat/apps-engine/definition/metadata");
class SessionStore {
    constructor(read, persistence) {
        this.read = read;
        this.persistence = persistence;
    }
    async getHistory(userId, maxHistory) {
        const assoc = new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.USER, userId);
        const records = await this.read
            .getPersistenceReader()
            .readByAssociation(assoc);
        if (records.length === 0) {
            return [];
        }
        const data = records[0];
        return (data.messages || []).slice(-maxHistory);
    }
    async addMessage(userId, message, maxHistory) {
        const history = await this.getHistory(userId, maxHistory);
        history.push(message);
        const trimmed = history.slice(-maxHistory);
        const assoc = new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.USER, userId);
        const now = Date.now();
        const existing = await this.read
            .getPersistenceReader()
            .readByAssociation(assoc);
        const data = {
            messages: trimmed,
            createdAt: existing.length > 0
                ? existing[0].createdAt
                : now,
            updatedAt: now,
        };
        await this.persistence.updateByAssociation(assoc, data, true);
    }
    async clearHistory(userId) {
        const assoc = new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.USER, userId);
        await this.persistence.removeByAssociation(assoc);
    }
    async hasHistory(userId) {
        const history = await this.getHistory(userId, 1);
        return history.length > 0;
    }
}
exports.SessionStore = SessionStore;
