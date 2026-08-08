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
            '`@ai start` — Start a session and see what I can do',
            '`@ai stats` — Show knowledge base statistics',
            '`@ai help` — Show this help',
            '`@ai clear` — Clear your conversation history',
            '',
            '**Channels:** mention me (`@RAGChat your question`) to ask in a channel.',
            '**Uploads:** drop a supported document (pdf, docx, txt, md, pptx, csv, xlsx, html) to index it.',
        ].join('\n');
    }

    public static formatWelcomeMessage(): string {
        return [
            '👋 **Welcome to RAGChat!**',
            '',
            'I answer questions using your team\'s documents. To get started:',
            '',
            '1. **Upload a document** — drop a pdf/docx/txt/md file into this chat and I will index it.',
            '2. **Ask me anything** — just type your question here.',
            '3. **Use `@ai stats`** to see what is in the knowledge base.',
            '',
            'Type `@ai help` for the full command list.',
        ].join('\n');
    }

    public static formatStats(documents: Array<{
        filename: string;
        chunks_count: number;
        created_at?: string;
    }>): string {
        if (documents.length === 0) {
            return '📊 **Knowledge Base:** empty. Upload a document to get started.';
        }

        const totalChunks = documents.reduce((sum, d) => sum + (d.chunks_count || 0), 0);
        const lines = documents.slice(0, 10).map(
            (d) => `• \`${d.filename}\` — ${d.chunks_count} chunk(s)`,
        );

        return [
            `📊 **Knowledge Base:** ${documents.length} document(s), ${totalChunks} chunk(s) total`,
            '',
            ...lines,
            documents.length > 10 ? `_…and ${documents.length - 10} more_` : '',
        ].filter(Boolean).join('\n');
    }
}
