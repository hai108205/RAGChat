/**
 * User-facing error messages and templates.
 */
export const ERRORS = {
    BACKEND_UNAVAILABLE:
        '⚠️ AI service is currently unavailable. Please try again later.',
    NO_QUERY:
        'Please provide a question. Usage: `/ask "your question"`',
    NO_SEARCH_QUERY:
        'Please provide a search term. Usage: `/search "query"`',
    NO_SUMMARIZE_TEXT:
        'Please provide text to summarize. Usage: `/summarize "text"`',
    NO_EXPLAIN_TEXT:
        'Please provide a concept to explain. Usage: `/explain "concept"`',
    NO_TRANSLATE_TEXT:
        'Please provide text to translate. Usage: `/translate "text"`',
    SETTING_NOT_CONFIGURED: (setting: string) =>
        `Required setting "${setting}" is not configured. Please contact an admin.`,
    HISTORY_CLEARED:
        '🧹 Conversation history cleared.',
    EMPTY_HISTORY:
        'No conversation history to clear.',
    BACKEND_ERROR: (status: number) =>
        `Backend returned error (${status}). Please try again later.`,
} as const;

