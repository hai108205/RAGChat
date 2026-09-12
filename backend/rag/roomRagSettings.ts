export const ROOM_RAG_SEARCH_MODES = ["semantic", "keyword", "hybrid"] as const;
export const ROOM_RAG_TOP_K_VALUES = [3, 5, 8, 10, 15] as const;
export const ROOM_RAG_THRESHOLDS = [0.3, 0.5, 0.6, 0.8] as const;
export const ROOM_RAG_PROMPT_MAX_CHARACTERS = 1500;
export const ROOM_RAG_PROMPT_TOKEN_BUDGET = 512;
const ROOM_RAG_MODEL_MAX_CHARACTERS = 200;

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
    readonly similarityThreshold: RoomRagThreshold;
    readonly model?: string;
    readonly systemPrompt?: string;
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

/**
 * Treat each UTF-8 byte as a token. This deliberately overestimates normal
 * tokenizer usage, but guarantees that no Unicode prompt can exceed the
 * reserved generation budget even when it has no whitespace.
 */
export const estimateRoomRagPromptTokens = (prompt: string): number => Buffer.byteLength(prompt, "utf8");

const truncatePromptToTokenBudget = (prompt: string): string =>
    [...prompt].reduce(
        ({ value, used }, character) => {
            const characterTokens = estimateRoomRagPromptTokens(character);
            return used + characterTokens > ROOM_RAG_PROMPT_TOKEN_BUDGET
                ? { value, used }
                : { value: value + character, used: used + characterTokens };
        },
        { value: "", used: 0 },
    ).value;

export function parseRoomRagSettings(input: unknown, capabilities: RoomRagCapabilities): RoomRagSettings {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Room RAG settings must be an object");
    }

    const settings = input as Record<string, unknown>;
    const requiredKeys = ["searchMode", "topK", "similarityThreshold"];
    const allowedKeys = [...requiredKeys, "model", "systemPrompt"];
    const actualKeys = Object.keys(settings);
    if (
        actualKeys.some((key) => !allowedKeys.includes(key))
        || requiredKeys.some((key) => !Object.hasOwn(settings, key))
    ) {
        throw new Error("Room RAG settings contain unsupported fields");
    }

    if (!isAllowed(settings.searchMode, ROOM_RAG_SEARCH_MODES)) {
        throw new Error("Room RAG searchMode is invalid");
    }
    if (!isAllowed(settings.topK, ROOM_RAG_TOP_K_VALUES)) {
        throw new Error("Room RAG topK is invalid");
    }
    if (!isAllowed(settings.similarityThreshold, ROOM_RAG_THRESHOLDS)) {
        throw new Error("Room RAG similarityThreshold is invalid");
    }
    if (Object.hasOwn(settings, "model") && (
        typeof settings.model !== "string"
        || !settings.model.trim()
        || settings.model.length > ROOM_RAG_MODEL_MAX_CHARACTERS
    )) {
        throw new Error("Room RAG model must be a non-empty bounded string");
    }
    if (Object.hasOwn(settings, "systemPrompt") && typeof settings.systemPrompt !== "string") {
        throw new Error("Room RAG systemPrompt must be a string");
    }
    if (typeof settings.systemPrompt === "string" && settings.systemPrompt.length > ROOM_RAG_PROMPT_MAX_CHARACTERS) {
        throw new Error(`Room RAG systemPrompt must not exceed ${ROOM_RAG_PROMPT_MAX_CHARACTERS.toLocaleString("en-US")} characters`);
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
        similarityThreshold: settings.similarityThreshold,
        ...(typeof settings.model === "string" ? { model: settings.model.trim() } : {}),
        ...(typeof settings.systemPrompt === "string" ? { systemPrompt: truncatePromptToTokenBudget(settings.systemPrompt) } : {}),
        promptTokenBudget: ROOM_RAG_PROMPT_TOKEN_BUDGET,
    });
}
