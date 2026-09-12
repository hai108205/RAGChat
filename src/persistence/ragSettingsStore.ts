import {
    IRead,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';
import {
    ROOM_RAG_SEARCH_MODES,
    ROOM_RAG_TOP_K_VALUES,
    ROOM_RAG_THRESHOLDS,
    ROOM_RAG_PROMPT_MAX_CHARACTERS,
    type RoomRagSearchMode,
    type RoomRagTopK,
    type RoomRagThreshold,
} from '../../backend/rag/roomRagSettings';

export {
    ROOM_RAG_SEARCH_MODES,
    ROOM_RAG_TOP_K_VALUES,
    ROOM_RAG_THRESHOLDS,
    ROOM_RAG_PROMPT_MAX_CHARACTERS,
    type RoomRagSearchMode,
    type RoomRagTopK,
    type RoomRagThreshold,
};

export interface RoomRagSettings {
    model?: string;
    searchMode?: RoomRagSearchMode;
    topK?: RoomRagTopK;
    similarityThreshold?: RoomRagThreshold;
    systemPrompt?: string;
}

interface StoredRoomRagRecord extends RoomRagSettings {
    roomId: string;
    updatedAt: number;
    updatedBy?: string;
}

const RAG_SETTINGS_SCOPE = 'rag_room_settings';

/**
 * Manages room-scoped RAG configuration in Rocket.Chat Apps-Engine persistence.
 *
 * Scoped by compound associations: ROOM + MISC('rag_room_settings').
 * Validates against allowed options to prevent tampering or corrupted persistence.
 */
export class RagSettingsStore {
    constructor(
        private read: IRead,
        private persistence: IPersistence,
    ) {}

    private getAssociations(roomId: string): RocketChatAssociationRecord[] {
        return [
            new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, RAG_SETTINGS_SCOPE),
        ];
    }

    public async getRoomSettings(roomId: string): Promise<RoomRagSettings | null> {
        if (!roomId) return null;

        const assocs = this.getAssociations(roomId);
        const records = await this.read
            .getPersistenceReader()
            .readByAssociations(assocs);

        if (!records || records.length === 0) {
            return null;
        }

        // Find record matching the exact roomId to guard against any mock or broad query leakage
        const record = (records as any[]).find((r) => r && r.roomId === roomId);
        if (!record) {
            return null;
        }

        return this.validateAndSanitize(record);
    }

    public async setRoomSettings(
        roomId: string,
        settings: RoomRagSettings,
        updatedBy?: string,
    ): Promise<void> {
        if (!roomId) {
            throw new Error('roomId is required to set room RAG settings');
        }

        const sanitized = this.validateAndSanitize(settings);
        if (!sanitized) {
            throw new Error('Invalid room RAG settings');
        }

        const data: StoredRoomRagRecord = {
            ...sanitized,
            roomId,
            updatedAt: Date.now(),
            ...(updatedBy ? { updatedBy } : {}),
        };

        const assocs = this.getAssociations(roomId);
        await this.persistence.updateByAssociations(assocs, data, true);
    }

    public async clearRoomSettings(roomId: string): Promise<void> {
        if (!roomId) return;
        const assocs = this.getAssociations(roomId);
        await this.persistence.removeByAssociations(assocs);
    }

    private validateAndSanitize(record: any): RoomRagSettings | null {
        if (!record || typeof record !== 'object') {
            return null;
        }

        // searchMode validation
        let searchMode: RoomRagSearchMode | undefined;
        if (record.searchMode !== undefined) {
            if (!ROOM_RAG_SEARCH_MODES.includes(record.searchMode)) {
                return null;
            }
            searchMode = record.searchMode;
        }

        // topK validation
        let topK: RoomRagTopK | undefined;
        if (record.topK !== undefined) {
            const numTopK = Number(record.topK);
            if (!ROOM_RAG_TOP_K_VALUES.includes(numTopK as any)) {
                return null;
            }
            topK = numTopK as RoomRagTopK;
        }

        // similarityThreshold validation
        let similarityThreshold: RoomRagThreshold | undefined;
        if (record.similarityThreshold !== undefined) {
            const numThresh = Number(record.similarityThreshold);
            if (Number.isNaN(numThresh) || !ROOM_RAG_THRESHOLDS.includes(numThresh as any)) {
                return null;
            }
            similarityThreshold = numThresh as RoomRagThreshold;
        }

        // systemPrompt validation
        let systemPrompt: string | undefined;
        if (record.systemPrompt !== undefined) {
            if (typeof record.systemPrompt !== 'string' || record.systemPrompt.length > ROOM_RAG_PROMPT_MAX_CHARACTERS) {
                return null;
            }
            systemPrompt = record.systemPrompt;
        }

        // model validation
        let model: string | undefined;
        if (record.model !== undefined) {
            if (typeof record.model !== 'string') {
                return null;
            }
            model = record.model.trim();
        }

        return {
            ...(model ? { model } : {}),
            ...(searchMode ? { searchMode } : {}),
            ...(topK !== undefined ? { topK } : {}),
            ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
            ...(systemPrompt !== undefined ? { systemPrompt } : {}),
        };
    }
}
