import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';

export interface CitationSource {
    title: string;
    snippet: string;
    page?: number;
    relevance?: number;
}

export class Formatter {
    public static usageCommand(command: string, example: string): string {
        return `**Usage:** \`/${command} ${example}\``;
    }

    public static formatSources(sources: CitationSource[]): IMessageAttachment {
        if (sources.length === 0) {
            return {
                color: '#9ea2a8',
                text: '_No sources found._',
                collapsed: true,
            };
        }

        const fields = sources.slice(0, 5).map((source, index) => ({
            title: `Source ${index + 1}${source.relevance ? ` (${Math.round(source.relevance * 100)}%)` : ''}`,
            value: [
                `**${source.title}**${source.page ? ` — Page ${source.page}` : ''}`,
                `> ${source.snippet.slice(0, 300)}`,
            ].join('\n'),
            short: false,
        }));

        return {
            color: '#1d74f5',
            title: { value: 'Sources & Citations' },
            text: `_Found ${sources.length} relevant source(s)_`,
            fields,
            collapsed: false,
        };
    }

    public static formatHelpMessage(): string {
        return [
            '**RAGChat** — AI-powered Document Q&A',
            '',
            '**Slash Commands:**',
            '`/ask "question"` — Ask a question using document knowledge',
            '`/search "query"` — Search documents in the knowledge base',
            '`/summarize "text"` — Summarize the provided text',
            '`/explain "concept"` — Explain a concept in simple terms',
            '`/translate "text"` — Translate text to another language',
            '',
            '**DM Commands:**',
            '`@ai help` — Show this help',
            '`@ai clear` — Clear your conversation history',
        ].join('\n');
    }
}
