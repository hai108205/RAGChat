import {
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';
import { CitationSource } from '../utils/Formatter';

/**
 * Payload stored in App Persistence keyed by Rocket.Chat message id.
 *
 * UI Kit button `value` fields are size-sensitive. Large fields (raw answer markdown,
 * full citation chunks, the original query) are persisted server-side, and buttons
 * carry only a lightweight `{ messageId }` reference.
 */
export interface IMessageActionPayload {
    messageId: string;
    chatMessageId?: string;
    query?: string;
    rawMarkdown?: string;
    sources?: CitationSource[];
    sourcesCount?: number;
    createdAt: number;
}

const PAYLOAD_SCOPE = 'message_action_payload';
const MSG_ASSOC_PREFIX = 'msg:';

/**
 * Persists the payload under (MISC scope, message id) association.
 * Overwrites any previous record for the same message id.
 */
export async function saveMessageActionPayload(
    persistence: IPersistence,
    payload: IMessageActionPayload,
): Promise<void> {
    if (!payload.messageId) {
        return;
    }
    const assocs = [
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, PAYLOAD_SCOPE),
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `${MSG_ASSOC_PREFIX}${payload.messageId}`),
    ];
    await persistence.updateByAssociations(assocs, payload, true);
}

/**
 * Loads a previously-saved payload, or undefined when missing/expired.
 */
export async function loadMessageActionPayload(
    read: IRead,
    messageId: string,
): Promise<IMessageActionPayload | undefined> {
    if (!messageId) {
        return undefined;
    }
    const assocs = [
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, PAYLOAD_SCOPE),
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `${MSG_ASSOC_PREFIX}${messageId}`),
    ];
    const records = await read.getPersistenceReader().readByAssociations(assocs);
    if (!records || records.length === 0) {
        return undefined;
    }
    const raw = records[0] as unknown as Partial<IMessageActionPayload>;
    if (!raw || typeof raw !== 'object' || typeof raw.messageId !== 'string') {
        return undefined;
    }
    return raw as IMessageActionPayload;
}

/**
 * Best-effort cleanup for a message payload (e.g. after copy/inspect consumed it).
 * Currently not invoked automatically — records are overwritten on regenerate and
 * the store is bounded by message volume, which is acceptable for this app size.
 */
export async function removeMessageActionPayload(
    persistence: IPersistence,
    messageId: string,
): Promise<void> {
    if (!messageId) {
        return;
    }
    const assocs = [
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, PAYLOAD_SCOPE),
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `${MSG_ASSOC_PREFIX}${messageId}`),
    ];
    await persistence.removeByAssociations(assocs);
}
