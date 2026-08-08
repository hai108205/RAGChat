import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IMessageActionContext,
    IMessageActionHandler,
} from '@rocket.chat/apps-engine/definition/messages';
import { BackendClient } from '../lib/BackendClient';
import { SessionStore } from '../persistence/sessionStore';
import { Formatter } from '../utils/Formatter';
import { Validator } from '../utils/Validator';
import { sendMessage } from '../utils/MessageHelper';
import { ERRORS } from '../constants/Errors';

export class AskAiActionHandler implements IMessageActionHandler {
    public readonly id = 'ragchat-ask-ai';
    public readonly i18nLabel = 'Ask AI';

    public async execute(
        context: IMessageActionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const text = context.message?.text;
        if (!text || !Validator.isNonEmptyString(text)) {
            await sendMessage(read, modify, context.room, 'No text found in the message to ask about.');
            return;
        }

        const sanitized = Validator.sanitizeInput(text);

        try {
            const client = new BackendClient(http, read);
            const sessionStore = new SessionStore(read, persistence);
            const settings = read.getEnvironmentReader().getSettings();
            const maxHistory = (await settings.getValueById('max-history')) as number;

            const history = await sessionStore.getHistory(context.message.sender.id, maxHistory);
            const response = await client.ask(sanitized, context.message.sender.id, context.room.id, history);

            await sessionStore.addMessage(context.message.sender.id, {
                role: 'user',
                content: sanitized,
                timestamp: Date.now(),
            }, maxHistory);

            await sessionStore.addMessage(context.message.sender.id, {
                role: 'assistant',
                content: response.answer,
                timestamp: Date.now(),
            }, maxHistory);

            const enableCitations = await settings.getValueById('enable-citations');
            const attachment = enableCitations
                ? Formatter.formatSources(response.sources)
                : undefined;

            await sendMessage(read, modify, context.room, response.answer, attachment);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, context.room, errMsg);
        }
    }
}

export class SummarizeActionHandler implements IMessageActionHandler {
    public readonly id = 'ragchat-summarize';
    public readonly i18nLabel = 'Summarize';

    public async execute(
        context: IMessageActionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const text = context.message?.text;
        if (!text || !Validator.isNonEmptyString(text)) {
            await sendMessage(read, modify, context.room, 'No text found in the message to summarize.');
            return;
        }

        const sanitized = Validator.sanitizeInput(text);

        try {
            const client = new BackendClient(http, read);
            const summary = await client.summarize(sanitized);
            await sendMessage(read, modify, context.room, `**Summary:**\n${summary}`);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, context.room, errMsg);
        }
    }
}

export class ExplainActionHandler implements IMessageActionHandler {
    public readonly id = 'ragchat-explain';
    public readonly i18nLabel = 'Explain';

    public async execute(
        context: IMessageActionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const text = context.message?.text;
        if (!text || !Validator.isNonEmptyString(text)) {
            await sendMessage(read, modify, context.room, 'No text found in the message to explain.');
            return;
        }

        const sanitized = Validator.sanitizeInput(text);

        try {
            const client = new BackendClient(http, read);
            const explanation = await client.explain(sanitized);
            await sendMessage(read, modify, context.room, `**Explanation:**\n${explanation}`);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, context.room, errMsg);
        }
    }
}

export class TranslateActionHandler implements IMessageActionHandler {
    public readonly id = 'ragchat-translate';
    public readonly i18nLabel = 'Translate';

    public async execute(
        context: IMessageActionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const text = context.message?.text;
        if (!text || !Validator.isNonEmptyString(text)) {
            await sendMessage(read, modify, context.room, 'No text found in the message to translate.');
            return;
        }

        const sanitized = Validator.sanitizeInput(text);

        try {
            const client = new BackendClient(http, read);
            const translation = await client.translate(sanitized, 'vi');
            await sendMessage(read, modify, context.room, `**Translation (Vietnamese):**\n${translation}`);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, context.room, errMsg);
        }
    }
}

export class GenerateReplyActionHandler implements IMessageActionHandler {
    public readonly id = 'ragchat-generate-reply';
    public readonly i18nLabel = 'Generate Reply';

    public async execute(
        context: IMessageActionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const text = context.message?.text;
        if (!text || !Validator.isNonEmptyString(text)) {
            await sendMessage(read, modify, context.room, 'No text found in the message to generate a reply for.');
            return;
        }

        const sanitized = Validator.sanitizeInput(text);

        try {
            const client = new BackendClient(http, read);
            const response = await client.post('/api/generate-reply', {
                text: sanitized,
                sender_name: context.message.sender.username || context.message.sender.name,
            });
            const reply = response.data?.reply || 'No reply generated.';
            await sendMessage(read, modify, context.room, `**Suggested Reply:**\n${reply}`);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : ERRORS.BACKEND_UNAVAILABLE;
            await sendMessage(read, modify, context.room, errMsg);
        }
    }
}