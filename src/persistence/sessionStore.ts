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

export class SessionStore {
    constructor(
        private read: IRead,
        private persistence: IPersistence,
    ) {}

    public async getHistory(
        userId: string,
        maxHistory: number,
    ): Promise<ChatMessage[]> {
        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            userId,
        );
        const records = await this.read
            .getPersistenceReader()
            .readByAssociation(assoc);

        if (records.length === 0) {
            return [];
        }

        const data = records[0] as SessionData;
        return (data.messages || []).slice(-maxHistory);
    }

    public async addMessage(
        userId: string,
        message: ChatMessage,
        maxHistory: number,
    ): Promise<void> {
        const history = await this.getHistory(userId, maxHistory);
        history.push(message);
        const trimmed = history.slice(-maxHistory);

        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            userId,
        );
        const now = Date.now();

        const existing = await this.read
            .getPersistenceReader()
            .readByAssociation(assoc);

        const data: SessionData = {
            messages: trimmed,
            createdAt: existing.length > 0
                ? (existing[0] as SessionData).createdAt
                : now,
            updatedAt: now,
        };

        await this.persistence.updateByAssociation(assoc, data, true);
    }

    public async clearHistory(userId: string): Promise<void> {
        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            userId,
        );
        await this.persistence.removeByAssociation(assoc);
    }

    public async hasHistory(userId: string): Promise<boolean> {
        const history = await this.getHistory(userId, 1);
        return history.length > 0;
    }
}
