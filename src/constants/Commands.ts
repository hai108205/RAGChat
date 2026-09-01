/**
 * Registered slash command identifiers.
 */
export const COMMANDS = {
    ASK: 'ask',
    SEARCH: 'search',
    SUMMARIZE: 'summarize',
    EXPLAIN: 'explain',
    TRANSLATE: 'translate',
    RAG: 'rag',
} as const;

/**
 * Supported sub-commands when chatting directly with the bot (@ai <command>).
 */
export const BOT_SUB_COMMANDS = {
    CLEAR: 'clear',
    HELP: 'help',
    START: 'start',
    STATS: 'stats',
} as const;

/**
 * Command prefix for bot directives in channels and DMs.
 */
export const BOT_PREFIX = '@ai';

