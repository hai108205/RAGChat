import {
    IAppAccessors,
    IAppUninstallationContext,
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

/**
 * Main application class for RAGChat.
 *
 * Implements core App-Engine lifecycle hooks and registers:
 * - App Settings (backend URL, API key, LLM parameters)
 * - Slash Commands (/ask, /search, /summarize, /explain, /translate)
 * - REST API Endpoints (Webhook callback for asynchronous AI worker notifications)
 * - Event Handlers:
 *   - IPostMessageSentToBot: handles 1-on-1 direct messages to the bot
 *   - IPostMessageSent: handles @mentions in public and private channels
 *   - IPreFileUpload: intercepts document uploads to index them into vector DB
 */
export class RagChatApp extends App implements IPostMessageSentToBot, IPostMessageSent, IPreFileUpload {
    // Lazy-instantiated handlers to optimize memory and lifecycle initialization
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

    /**
     * Feature registration phase. Called once during app initialization.
     * Registers settings, slash commands, and webhook API endpoints.
     */
    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        _environmentRead: IEnvironmentRead,
    ): Promise<void> {
        // 1. Register configurable administration settings
        await registerSettings(configuration);

        // 2. Register slash commands concurrently
        await Promise.all([
            configuration.slashCommands.provideSlashCommand(new AskCommand()),
            configuration.slashCommands.provideSlashCommand(new SearchCommand()),
            configuration.slashCommands.provideSlashCommand(new SummarizeCommand()),
            configuration.slashCommands.provideSlashCommand(new ExplainCommand()),
            configuration.slashCommands.provideSlashCommand(new TranslateCommand()),
        ]);

        // 3. Register callback endpoint for backend async job completions
        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [new CallbackEndpoint(this)],
        });

        this.getLogger().info('RAGChat App configured successfully');
    }

    /**
     * App enable hook: validates that essential configuration is set.
     * Prevents the app from running in an invalid or broken state.
     */
    public async onEnable(
        environment: IEnvironmentRead,
        _configurationModify: IConfigurationModify,
    ): Promise<boolean> {
        const settings = environment.getSettings();
        const backendUrl = await settings.getValueById('backend-url');

        if (!backendUrl || typeof backendUrl !== 'string' || !backendUrl.trim()) {
            this.getLogger().error('Backend URL is not configured — cannot enable RAGChat app');
            return false;
        }

        this.getLogger().info('RAGChat App enabled successfully');
        return true;
    }

    /**
     * App disable hook: logs deactivation.
     */
    public async onDisable(
        _configurationModify: IConfigurationModify,
    ): Promise<void> {
        this.getLogger().info('RAGChat App disabled');
    }

    /**
     * App uninstall hook: cleans up resources or logs removal.
     */
    public async onUninstall(
        _context: IAppUninstallationContext,
        _read: IRead,
        _http: IHttp,
        _persistence: IPersistence,
        _modify: IModify,
    ): Promise<void> {
        this.getLogger().info('RAGChat App uninstalled');
    }

    // --- IPostMessageSentToBot: Direct Messages to the bot user ---

    public async executePostMessageSentToBot(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        await this.getBotHandler().executePostMessageSentToBot(message, read, http, persistence, modify);
    }

    // --- IPostMessageSent: Channel @mentions and prefix commands ---

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

    // --- IPreFileUpload: Document interception and indexing forwarding ---

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
