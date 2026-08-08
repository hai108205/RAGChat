export const COMMANDS = {
    ASK: 'ask',
    SEARCH: 'search',
    SUMMARIZE: 'summarize',
    EXPLAIN: 'explain',
    TRANSLATE: 'translate',
} as const;

export const BOT_SUB_COMMANDS = {
    CLEAR: 'clear',
    HELP: 'help',
    START: 'start',
    STATS: 'stats',
} as const;

export const BOT_PREFIX = '@ai';
