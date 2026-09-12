import {
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';
import { CallbackEventType } from '../types/CallbackEvents';

export type CallbackReceiptStatus = 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED';

export interface CallbackReceipt {
    key: string;
    jobId?: string;
    requestId?: string;
    placeholderId?: string | null;
    status: CallbackReceiptStatus;
    event?: CallbackEventType;
    checkpoint?: string;
    createdAt: number;
    updatedAt: number;
    processedAt?: number;
    error?: string;
    details?: Record<string, unknown>;
}

export interface ClaimResult {
    receipt: CallbackReceipt;
    isDuplicate: boolean;
    isConflicting: boolean;
}

const RECEIPT_SCOPE = 'callback_receipt';
const RECEIPT_PREFIX = 'rcpt:';

/**
 * Manages webhook callback receipt idempotency, states, and execution checkpoints in Apps-Engine persistence.
 *
 * Design & Architecture:
 * - Deterministic Keying: Indexed by `jobId` (fallback `requestId`).
 * - State Machine: `PENDING` -> `CLAIMED` -> `COMPLETED` | `FAILED`.
 * - First-Terminal-Wins: Once a job reaches terminal state (`COMPLETED` or `FAILED`), identical terminal events
 *   are treated as idempotent duplicates (return 200), while opposing/conflicting events are rejected (return 409).
 * - Per-effect Checkpoints: Persisted checkpoints (`PLACEHOLDER_UPDATED`, `SESSION_SAVED`) allow retry without
 *   duplicated side-effects or orphan messages.
 */
export class CallbackReceiptStore {
    constructor(
        private read: IRead,
        private persistence: IPersistence,
    ) {}

    /**
     * Builds compound association records for scoping receipt lookups.
     */
    private getAssociations(key: string): RocketChatAssociationRecord[] {
        return [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, RECEIPT_SCOPE),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `${RECEIPT_PREFIX}${key}`),
        ];
    }

    /**
     * Reads a callback receipt by key (jobId or requestId).
     */
    public async getReceipt(key: string): Promise<CallbackReceipt | null> {
        if (!key || !key.trim()) {
            return null;
        }
        const assocs = this.getAssociations(key.trim());
        const records = await this.read.getPersistenceReader().readByAssociations(assocs);
        if (!records || records.length === 0) {
            return null;
        }

        const raw = records[0] as unknown as Partial<CallbackReceipt>;
        if (!raw || typeof raw !== 'object' || typeof raw.key !== 'string') {
            return null;
        }

        return raw as CallbackReceipt;
    }

    /**
     * Pre-registers a PENDING receipt before enqueueing an async job.
     */
    public async createPending(
        key: string,
        meta?: {
            jobId?: string;
            requestId?: string;
            placeholderId?: string | null;
            details?: Record<string, unknown>;
        },
    ): Promise<CallbackReceipt> {
        const cleanKey = key.trim();
        const now = Date.now();
        const receipt: CallbackReceipt = {
            key: cleanKey,
            jobId: meta?.jobId,
            requestId: meta?.requestId,
            placeholderId: meta?.placeholderId,
            status: 'PENDING',
            checkpoint: 'PENDING',
            createdAt: now,
            updatedAt: now,
            details: meta?.details,
        };

        await this.saveReceipt(receipt);
        return receipt;
    }

    /**
     * Claims a callback receipt for execution.
     * Evaluates whether incoming event is a duplicate terminal delivery or a conflicting terminal outcome.
     */
    public async claim(
        key: string,
        event: CallbackEventType,
        meta?: {
            jobId?: string;
            requestId?: string;
            placeholderId?: string | null;
        },
    ): Promise<ClaimResult> {
        const cleanKey = key.trim();
        const existing = await this.getReceipt(cleanKey);
        const now = Date.now();

        if (existing) {
            // Check terminal state
            if (existing.status === 'COMPLETED' || existing.status === 'FAILED') {
                const isSuccessEvent = event === 'chat_completed' || event === 'indexing_complete';
                const isFailureEvent = event === 'chat_failed' || event === 'indexing_failed';

                const matchesTerminal =
                    (existing.status === 'COMPLETED' && isSuccessEvent) ||
                    (existing.status === 'FAILED' && isFailureEvent) ||
                    existing.event === event;

                if (matchesTerminal) {
                    // Duplicate terminal delivery
                    return { receipt: existing, isDuplicate: true, isConflicting: false };
                } else {
                    // Conflicting event after terminal state (e.g. completed followed by failed or vice versa)
                    return { receipt: existing, isDuplicate: false, isConflicting: true };
                }
            }

            if (existing.status === 'CLAIMED') {
                const isOpposite =
                    (existing.event === 'chat_completed' && event === 'chat_failed') ||
                    (existing.event === 'chat_failed' && event === 'chat_completed') ||
                    (existing.event === 'indexing_complete' && event === 'indexing_failed') ||
                    (existing.event === 'indexing_failed' && event === 'indexing_complete');

                if (isOpposite) {
                    return { receipt: existing, isDuplicate: false, isConflicting: true };
                }

                // In-progress retry of same event: allows continuing / resuming from last checkpoint
                return { receipt: existing, isDuplicate: false, isConflicting: false };
            }

            // Transition PENDING -> CLAIMED
            existing.status = 'CLAIMED';
            existing.event = event;
            existing.checkpoint = 'CLAIMED';
            existing.updatedAt = now;
            if (meta?.jobId) existing.jobId = meta.jobId;
            if (meta?.requestId) existing.requestId = meta.requestId;
            if (meta?.placeholderId) existing.placeholderId = meta.placeholderId;

            await this.saveReceipt(existing);
            return { receipt: existing, isDuplicate: false, isConflicting: false };
        }

        // New receipt initialized as CLAIMED
        const newReceipt: CallbackReceipt = {
            key: cleanKey,
            jobId: meta?.jobId,
            requestId: meta?.requestId,
            placeholderId: meta?.placeholderId,
            status: 'CLAIMED',
            event,
            checkpoint: 'CLAIMED',
            createdAt: now,
            updatedAt: now,
        };

        await this.saveReceipt(newReceipt);
        return { receipt: newReceipt, isDuplicate: false, isConflicting: false };
    }

    /**
     * Advances the per-effect checkpoint (e.g. PLACEHOLDER_UPDATED, SESSION_SAVED).
     */
    public async updateCheckpoint(
        key: string,
        checkpoint: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        const receipt = await this.getReceipt(key);
        if (!receipt) return;

        receipt.checkpoint = checkpoint;
        receipt.updatedAt = Date.now();
        if (details) {
            receipt.details = { ...(receipt.details || {}), ...details };
        }

        await this.saveReceipt(receipt);
    }

    /**
     * Marks the receipt as COMPLETED (terminal success).
     */
    public async markCompleted(
        key: string,
        event: CallbackEventType,
        details?: Record<string, unknown>,
    ): Promise<void> {
        const cleanKey = key.trim();
        const receipt = await this.getReceipt(cleanKey);
        const now = Date.now();

        const updated: CallbackReceipt = receipt ? {
            ...receipt,
            status: 'COMPLETED',
            event,
            checkpoint: 'COMPLETED',
            updatedAt: now,
            processedAt: now,
            details: { ...(receipt.details || {}), ...(details || {}) },
        } : {
            key: cleanKey,
            status: 'COMPLETED',
            event,
            checkpoint: 'COMPLETED',
            createdAt: now,
            updatedAt: now,
            processedAt: now,
            details,
        };

        await this.saveReceipt(updated);
    }

    /**
     * Marks the receipt as FAILED (terminal failure).
     */
    public async markFailed(
        key: string,
        event: CallbackEventType,
        error: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        const cleanKey = key.trim();
        const receipt = await this.getReceipt(cleanKey);
        const now = Date.now();

        const updated: CallbackReceipt = receipt ? {
            ...receipt,
            status: 'FAILED',
            event,
            checkpoint: 'FAILED',
            error,
            updatedAt: now,
            processedAt: now,
            details: { ...(receipt.details || {}), ...(details || {}) },
        } : {
            key: cleanKey,
            status: 'FAILED',
            event,
            checkpoint: 'FAILED',
            error,
            createdAt: now,
            updatedAt: now,
            processedAt: now,
            details,
        };

        await this.saveReceipt(updated);
    }

    /**
     * Internal upsert helper.
     */
    private async saveReceipt(receipt: CallbackReceipt): Promise<void> {
        const assocs = this.getAssociations(receipt.key);
        await this.persistence.updateByAssociations(assocs, receipt, true);
    }
}
