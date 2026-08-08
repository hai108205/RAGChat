import {
    IAppAccessors,
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

import { registerSettings } from './src/settings/Settings';
import { AskCommand } from './src/commands/AskCommand';
import { SearchCommand } from './src/commands/SearchCommand';
import { SummarizeCommand } from './src/commands/SummarizeCommand';
import { ExplainCommand } from './src/commands/ExplainCommand';
import { TranslateCommand } from './src/commands/TranslateCommand';
import { BotMessageHandler } from './src/handlers/BotMessageHandler';
import {
    AskAiActionHandler,
    SummarizeActionHandler,
    ExplainActionHandler,
    TranslateActionHandler,
    GenerateReplyActionHandler,
} from './src/handlers/MessageActionHandler';
import { CallbackEndpoint } from './src/api/CallbackEndpoint';

export class RagChatApp extends App {
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

        await configuration.messageActions.provideMessageAction(new AskAiActionHandler());
        await configuration.messageActions.provideMessageAction(new SummarizeActionHandler());
        await configuration.messageActions.provideMessageAction(new ExplainActionHandler());
        await configuration.messageActions.provideMessageAction(new TranslateActionHandler());
        await configuration.messageActions.provideMessageAction(new GenerateReplyActionHandler());

        await configuration.messages.providePostMessageSentToBot(new BotMessageHandler());

        await configuration.api.provideApi(new CallbackEndpoint());

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
}
