import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import { BackendClient } from '../lib/BackendClient';
import { Formatter } from '../utils/Formatter';
import { sendMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';
import { COMMANDS } from '../constants/Commands';

const SUPPORTED_LANGS: Record<string, string> = {
    vi: 'Vietnamese',
    en: 'English',
    fr: 'French',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    de: 'German',
    es: 'Spanish',
};

export class TranslateCommand implements ISlashCommand {
    public command = COMMANDS.TRANSLATE;
    public i18nParamsExample = '[lang] "text"';
    public i18nDescription = 'Translate text to another language';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        _persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const room = context.getRoom();

        if (args.length === 0) {
            await this.sendUsage(read, modify, room);
            return;
        }

        let targetLang = 'vi';
        let text: string;

        const firstArg = args[0].toLowerCase();

        if (SUPPORTED_LANGS[firstArg]) {
            targetLang = firstArg;
            text = args.slice(1).join(' ');
        } else {
            text = args.join(' ');
        }

        if (!text) {
            await this.sendUsage(read, modify, room);
            return;
        }

        try {
            const client = new BackendClient(http, read);
            const translation = await client.translate(text, targetLang);

            const langName = SUPPORTED_LANGS[targetLang] || targetLang;
            await sendMessage(read, modify, room, `**${langName}:**\n\n${translation}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, room, message);
        }
    }

    private async sendUsage(
        read: IRead,
        modify: IModify,
        room: unknown,
    ): Promise<void> {
        const langList = Object.entries(SUPPORTED_LANGS)
            .map(([code, name]) => `\`${code}\` = ${name}`)
            .join(', ');

        const usage = [
            Formatter.usageCommand(COMMANDS.TRANSLATE, '[lang] "text"'),
            '',
            `**Supported languages:** ${langList}`,
            '',
            '_Default target language: Vietnamese (vi)_',
        ].join('\n');

        await sendMessage(read, modify, room, usage);
    }
}
