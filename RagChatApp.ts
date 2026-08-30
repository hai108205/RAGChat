import {
    IAppAccessors,
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IPostMessageSentToBot } from '@rocket.chat/apps-engine/definition/messages/IPostMessageSentToBot';
import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages/IPostMessageSent';
import { IPreFileUpload, IFileUploadContext } from '@rocket.chat/apps-engine/definition/uploads';
import { ApiVisibility, ApiSecurity } from '@rocket.chat/apps-engine/definition/api';

import { registerSettings } from './src/settings/Settings';
import { AskCommand } from './src/commands/AskCommand';
import { SearchCommand } from './src/commands/SearchCommand';
import { SummarizeCommand } from './src/commands/SummarizeCommand';
import { ExplainCommand } from './src/commands/ExplainCommand';
import { TranslateCommand } from './src/commands/TranslateCommand';
import { BotMessageHandler } from './src/handlers/BotMessageHandler';
import { MentionHandler } from './src/handlers/MentionHandler';
import { FileUploadHandler } from './src/handlers/FileUploadHandler';
import { CallbackEndpoint } from './src/api/CallbackEndpoint';

export class RagChatApp extends App implements IPostMessageSentToBot, IPostMessageSent, IPreFileUpload {
    private botHandler: BotMessageHandler | null = null;
    private mentionHandler: MentionHandler | null = null;
    private uploadHandler: FileUploadHandler | null = null;

    private getBotHandler(): BotMessageHandler {
        if (!this.botHandler) {
            this.botHandler = new BotMessageHandler();
        }
        return this.botHandler;
    }

    private getMentionHandler(): MentionHandler {
        if (!this.mentionHandler) {
            this.mentionHandler = new MentionHandler();
        }
        return this.mentionHandler;
    }

    private getUploadHandler(): FileUploadHandler {
        if (!this.uploadHandler) {
            this.uploadHandler = new FileUploadHandler();
        }
        return this.uploadHandler;
    }

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        _environmentRead: IEnvironmentRead,
    ): Promise<void> {
        await registerSettings(configuration);

        await Promise.all([
            configuration.slashCommands.provideSlashCommand(new AskCommand()),
            configuration.slashCommands.provideSlashCommand(new SearchCommand()),
            configuration.slashCommands.provideSlashCommand(new SummarizeCommand()),
            configuration.slashCommands.provideSlashCommand(new ExplainCommand()),
            configuration.slashCommands.provideSlashCommand(new TranslateCommand()),
        ]);

        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [new CallbackEndpoint(this)],
        });

        this.getLogger().info('RAGChat App configured successfully');
    }

    public async onEnable(
        environment: IEnvironmentRead,
        _configurationModify: IConfigurationModify,
    ): Promise<boolean> {
        const settings = environment.getSettings();
        const backendUrl = await settings.getValueById('backend-url');

        if (!backendUrl || typeof backendUrl !== 'string' || !backendUrl.trim()) {
            this.getLogger().error('Backend URL is not configured — cannot enable app');
            return false;
        }

        this.getLogger().info('RAGChat App enabled');
        return true;
    }

    public async onDisable(
        _configurationModify: IConfigurationModify,
    ): Promise<void> {
        this.getLogger().info('RAGChat App disabled');
    }

    // --- IPostMessageSentToBot: DM messages to the bot user ---

    public async executePostMessageSentToBot(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        await this.getBotHandler().executePostMessageSentToBot(message, read, http, persistence, modify);
    }

    // --- IPostMessageSent: channel @mentions ---

    public async checkPostMessageSent(
        message: IMessage,
        read: IRead,
        _http: IHttp,
    ): Promise<boolean> {
        return this.getMentionHandler().checkPostMessageSent(message, read);
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        await this.getMentionHandler().executePostMessageSent(message, read, http, persistence, modify);
    }

    // --- IPreFileUpload: forward documents to RAG backend ---

    public async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        await this.getUploadHandler().executePreFileUpload(context, read, http, persis, modify);
    }
}
