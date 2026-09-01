import prisma from "./prismaClient.js";
import { qdrant } from "./ragClients.js";

export interface DeleteQdrantCollectionSafeResult {
    deleted: boolean;
    reason?: string;
}

export async function deleteQdrantCollectionSafe(
    collectionName?: string | null,
): Promise<DeleteQdrantCollectionSafeResult> {
    if (!collectionName || typeof collectionName !== "string" || !collectionName.trim()) {
        return { deleted: false, reason: "emptyCollectionName" };
    }

    const name = collectionName.trim();
    try {
        await qdrant.deleteCollection(name, { timeout: 60000 });
        return { deleted: true };
    } catch (error: any) {
        const msg = error?.message || String(error);
        if (/not found|404/i.test(msg)) {
            return { deleted: true, reason: "alreadyGone" };
        }
        console.error(`[qdrantCleanup] Failed to delete collection "${name}":`, msg);
        return { deleted: false, reason: msg };
    }
}

const DEFAULT_MIN_AGE_DAYS = Number.parseInt(process.env.QDRANT_CLEANUP_MIN_AGE_DAYS || "7", 10);
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseTimestampFromCollectionName(collectionName?: string | null): number | null {
    if (!collectionName || typeof collectionName !== "string") return null;
    const match = collectionName.match(/-(\d{13})$/);
    if (!match) return null;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return null;
    const date = new Date(parsed);
    if (Number.isNaN(date.getTime())) return null;
    return parsed;
}

function getCollectionAge(collectionName?: string | null): {
    isKnown: boolean;
    ageMs: number | null;
    createdAtMs: number | null;
} {
    const createdAtMs = parseTimestampFromCollectionName(collectionName);
    if (createdAtMs === null) {
        return { isKnown: false, ageMs: null, createdAtMs: null };
    }

    const ageMs = Date.now() - createdAtMs;
    if (ageMs < 0) {
        return { isKnown: false, ageMs: null, createdAtMs: null };
    }

    return { isKnown: true, ageMs, createdAtMs };
}

async function getReferencedCollectionNames(): Promise<Set<string>> {
    const [chatRefs, sourceRefs] = await Promise.all([
        prisma.chat.findMany({
            where: { collectionName: { not: null } },
            select: { collectionName: true },
        }),
        prisma.chatSource.findMany({
            where: { collectionName: { not: null } },
            select: { collectionName: true },
        }),
    ]);

    const referenced = new Set<string>();
    for (const item of [...chatRefs, ...sourceRefs]) {
        const collectionName = item.collectionName?.trim();
        if (collectionName) referenced.add(collectionName);
    }
    return referenced;
}

function normalizeCollectionsResponse(response: any): any[] {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.collections)) return response.collections;
    return [];
}

export interface CleanupQdrantCollectionsOptions {
    force?: boolean;
    minAgeDays?: number;
}

export interface CleanupQdrantCollectionsResult {
    timestamp: string;
    dryRun: boolean;
    force: boolean;
    minAgeDays: number;
    totalQdrantCollections: number;
    referencedCollections: number;
    orphanedCandidates: number;
    deleted: any[];
    skipped: any[];
}

export async function cleanupQdrantCollections({
    force = false,
    minAgeDays = DEFAULT_MIN_AGE_DAYS,
}: CleanupQdrantCollectionsOptions = {}): Promise<CleanupQdrantCollectionsResult> {
    const dryRun = !force;
    const referencedCollectionNames = await getReferencedCollectionNames();

    const response = await qdrant.getCollections();
    const collections = normalizeCollectionsResponse(response);

    const deleted: any[] = [];
    const skipped: any[] = [];
    const candidates: { name: string; ageDays: number }[] = [];

    for (const collection of collections) {
        const collectionName = collection?.name?.trim();
        if (!collectionName || typeof collectionName !== "string") {
            skipped.push({ name: collection?.name, reason: "invalidCollectionName" });
            continue;
        }

        if (referencedCollectionNames.has(collectionName)) {
            skipped.push({ name: collectionName, reason: "referencedInDatabase" });
            continue;
        }

        const age = getCollectionAge(collectionName);
        const minAgeMs = minAgeDays * MS_PER_DAY;

        if (!age.isKnown || age.ageMs === null) {
            skipped.push({
                name: collectionName,
                reason: "unknownAge",
                message: "Unable to parse timestamp from collection name; skipping for safety.",
            });
            continue;
        }

        if (age.ageMs < minAgeMs) {
            skipped.push({
                name: collectionName,
                reason: "tooYoung",
                ageDays: Number((age.ageMs / MS_PER_DAY).toFixed(2)),
                minAgeDays,
            });
            continue;
        }

        candidates.push({ name: collectionName, ageDays: Number((age.ageMs / MS_PER_DAY).toFixed(2)) });
    }

    for (const candidate of candidates) {
        if (dryRun) {
            skipped.push({ name: candidate.name, reason: "dryRun" });
            continue;
        }

        try {
            await qdrant.deleteCollection(candidate.name, { timeout: 60000 });
            deleted.push({ name: candidate.name, ageDays: candidate.ageDays });
        } catch (error: any) {
            skipped.push({
                name: candidate.name,
                reason: "deleteFailed",
                message: error?.message || String(error),
            });
        }
    }

    return {
        timestamp: new Date().toISOString(),
        dryRun,
        force,
        minAgeDays,
        totalQdrantCollections: collections.length,
        referencedCollections: referencedCollectionNames.size,
        orphanedCandidates: candidates.length,
        deleted,
        skipped,
    };
}
