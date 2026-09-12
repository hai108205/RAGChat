import type { IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import type { RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import type { MockRead } from './MockRead';

export class MockPersistence implements IPersistence {
    constructor(private mockRead: MockRead) {}

    public async create(data: object): Promise<string> {
        const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.mockRead.persistenceStore.set(id, [data]);
        return id;
    }

    public async createWithAssociation(data: object, association: RocketChatAssociationRecord): Promise<string> {
        const key = `${association.getModel()}_${association.getID()}`;
        const existing = this.mockRead.persistenceStore.get(key) || [];
        existing.push(data);
        this.mockRead.persistenceStore.set(key, existing);
        return key;
    }

    public async createWithAssociations(data: object, associations: RocketChatAssociationRecord[]): Promise<string> {
        let firstKey = '';
        for (const assoc of associations) {
            const key = `${assoc.getModel()}_${assoc.getID()}`;
            if (!firstKey) firstKey = key;
            const existing = this.mockRead.persistenceStore.get(key) || [];
            existing.push(data);
            this.mockRead.persistenceStore.set(key, existing);
        }
        return firstKey;
    }

    public async update(id: string, data: object, _upsert?: boolean): Promise<string> {
        this.mockRead.persistenceStore.set(id, [data]);
        return id;
    }

    public async updateByAssociation(association: RocketChatAssociationRecord, data: object, _upsert?: boolean): Promise<string> {
        const key = `${association.getModel()}_${association.getID()}`;
        this.mockRead.persistenceStore.set(key, [data]);
        return key;
    }

    public async updateByAssociations(associations: RocketChatAssociationRecord[], data: object, _upsert?: boolean): Promise<string> {
        let firstKey = '';
        for (const assoc of associations) {
            const key = `${assoc.getModel()}_${assoc.getID()}`;
            if (!firstKey) firstKey = key;
            this.mockRead.persistenceStore.set(key, [data]);
        }
        return firstKey;
    }

    public async remove(id: string): Promise<object> {
        const existing = this.mockRead.persistenceStore.get(id);
        this.mockRead.persistenceStore.delete(id);
        return existing?.[0] || {};
    }

    public async removeByAssociation(association: RocketChatAssociationRecord): Promise<Array<object>> {
        const key = `${association.getModel()}_${association.getID()}`;
        const existing = this.mockRead.persistenceStore.get(key) || [];
        this.mockRead.persistenceStore.delete(key);
        return existing;
    }

    public async removeByAssociations(associations: RocketChatAssociationRecord[]): Promise<Array<object>> {
        const removed: Array<object> = [];
        for (const assoc of associations) {
            const key = `${assoc.getModel()}_${assoc.getID()}`;
            const existing = this.mockRead.persistenceStore.get(key) || [];
            this.mockRead.persistenceStore.delete(key);
            removed.push(...existing);
        }
        return removed;
    }
}
