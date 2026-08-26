"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslateCommand = void 0;
const BackendClient_1 = require("../lib/BackendClient");
const Formatter_1 = require("../utils/Formatter");
const MessageHelper_1 = require("../utils/MessageHelper");
const Errors_1 = require("../constants/Errors");
const Commands_1 = require("../constants/Commands");
const SUPPORTED_LANGS = {
    vi: 'Vietnamese',
    en: 'English',
    fr: 'French',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    de: 'German',
    es: 'Spanish',
};
class TranslateCommand {
    constructor() {
        this.command = Commands_1.COMMANDS.TRANSLATE;
        this.i18nParamsExample = '[lang] "text"';
        this.i18nDescription = 'Translate text to another language';
        this.providesPreview = false;
    }
    async executor(context, read, modify, http, _persis) {
        const args = context.getArguments();
        const room = context.getRoom();
        const threadId = context.getThreadId();
        if (args.length === 0) {
            await this.sendUsage(read, modify, room, threadId);
            return;
        }
        let targetLang = 'vi';
        let text;
        const firstArg = args[0].toLowerCase();
        if (args.length > 1 && SUPPORTED_LANGS[firstArg]) {
            targetLang = firstArg;
            text = args.slice(1).join(' ');
        }
        else {
            text = args.join(' ');
        }
        if (!text) {
            await this.sendUsage(read, modify, room, threadId);
            return;
        }
        try {
            const client = new BackendClient_1.BackendClient(http, read);
            const translation = await client.translate(text, targetLang);
            const langName = SUPPORTED_LANGS[targetLang] || targetLang;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, `**${langName}:**\n\n${translation}`, undefined, threadId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : Errors_1.ERRORS.BACKEND_UNAVAILABLE;
            await (0, MessageHelper_1.sendMessage)(read, modify, room, message, undefined, threadId);
        }
    }
    async sendUsage(read, modify, room, threadId) {
        const langList = Object.entries(SUPPORTED_LANGS)
            .map(([code, name]) => `\`${code}\` = ${name}`)
            .join(', ');
        const usage = [
            Formatter_1.Formatter.usageCommand(Commands_1.COMMANDS.TRANSLATE, '[lang] "text"'),
            '',
            `**Supported languages:** ${langList}`,
            '',
            '_Default target language: Vietnamese (vi)_',
        ].join('\n');
        await (0, MessageHelper_1.sendMessage)(read, modify, room, usage, undefined, threadId);
    }
}
exports.TranslateCommand = TranslateCommand;
