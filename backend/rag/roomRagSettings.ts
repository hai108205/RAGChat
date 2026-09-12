export const ROOM_RAG_SEARCH_MODES = ["semantic", "keyword", "hybrid"] as const;
export const ROOM_RAG_TOP_K_VALUES = [3, 5, 8, 10, 15] as const;
export const ROOM_RAG_THRESHOLDS = [0.3, 0.5, 0.6, 0.8] as const;
export const ROOM_RAG_PROMPT_MAX_CHARACTERS = 1500;
export const ROOM_RAG_PROMPT_TOKEN_BUDGET = 512;

export type RoomRagSearchMode = (typeof ROOM_RAG_SEARCH_MODES)[number];
export type RoomRagTopK = (typeof ROOM_RAG_TOP_K_VALUES)[number];
export type RoomRagThreshold = (typeof ROOM_RAG_THRESHOLDS)[number];

/**
 * This is safe to return from the authenticated integration endpoint. It tells
 * clients which choices are actually deployable; it is not a client-side
 * authorization decision.
 */
export interface RoomRagCapabilities {
    readonly lexicalRetrievalEnabled: boolean;
    readonly availableSearchModes: readonly RoomRagSearchMode[];
    readonly promptMaxCharacters: typeof ROOM_RAG_PROMPT_MAX_CHARACTERS;
    readonly promptTokenBudget: typeof ROOM_RAG_PROMPT_TOKEN_BUDGET;
}

export interface RoomRagSettings {
    readonly searchMode: RoomRagSearchMode;
    readonly topK: RoomRagTopK;
    readonly threshold: RoomRagThreshold;
    readonly prompt: string;
    /** Reserved from generation context when room instructions are included. */
    readonly promptTokenBudget: typeof ROOM_RAG_PROMPT_TOKEN_BUDGET;
}

export function createRoomRagCapabilities({
    lexicalRetrievalEnabled,
}: Pick<RoomRagCapabilities, "lexicalRetrievalEnabled">): RoomRagCapabilities {
    const availableSearchModes = lexicalRetrievalEnabled
        ? [...ROOM_RAG_SEARCH_MODES]
        : ["semantic"] as const;

    return Object.freeze({
        lexicalRetrievalEnabled,
        availableSearchModes: Object.freeze(availableSearchModes),
        promptMaxCharacters: ROOM_RAG_PROMPT_MAX_CHARACTERS,
        promptTokenBudget: ROOM_RAG_PROMPT_TOKEN_BUDGET,
    });
}

const isAllowed = <T>(value: unknown, choices: readonly T[]): value is T => choices.includes(value as T);

const truncatePromptToTokenBudget = (prompt: string): string =>
    (prompt.match(/\S+/gu) || []).slice(0, ROOM_RAG_PROMPT_TOKEN_BUDGET).join(" ");

export function parseRoomRagSettings(input: unknown, capabilities: RoomRagCapabilities): RoomRagSettings {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Room RAG settings must be an object");
    }

    const settings = input as Record<string, unknown>;
    const expectedKeys = ["searchMode", "topK", "threshold", "prompt"];
    const actualKeys = Object.keys(settings);
    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key) => !expectedKeys.includes(key))) {
        throw new Error("Room RAG settings contain unsupported fields");
    }

    if (!isAllowed(settings.searchMode, ROOM_RAG_SEARCH_MODES)) {
        throw new Error("Room RAG searchMode is invalid");
    }
    if (!isAllowed(settings.topK, ROOM_RAG_TOP_K_VALUES)) {
        throw new Error("Room RAG topK is invalid");
    }
    if (!isAllowed(settings.threshold, ROOM_RAG_THRESHOLDS)) {
        throw new Error("Room RAG threshold is invalid");
    }
    if (typeof settings.prompt !== "string") {
        throw new Error("Room RAG prompt must be a string");
    }
    if (settings.prompt.length > ROOM_RAG_PROMPT_MAX_CHARACTERS) {
        throw new Error(`Room RAG prompt must not exceed ${ROOM_RAG_PROMPT_MAX_CHARACTERS.toLocaleString("en-US")} characters`);
    }

    const availableModes = capabilities.lexicalRetrievalEnabled
        ? ROOM_RAG_SEARCH_MODES
        : (["semantic"] as const);
    if (!isAllowed(settings.searchMode, availableModes)) {
        throw new Error(`Room RAG search mode ${settings.searchMode} is not available`);
    }

    return Object.freeze({
        searchMode: settings.searchMode,
        topK: settings.topK,
        threshold: settings.threshold,
        prompt: truncatePromptToTokenBudget(settings.prompt),
        promptTokenBudget: ROOM_RAG_PROMPT_TOKEN_BUDGET,
    });
}
