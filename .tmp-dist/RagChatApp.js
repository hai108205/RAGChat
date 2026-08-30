"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagChatApp = void 0;
const App_1 = require("@rocket.chat/apps-engine/definition/App");
const api_1 = require("@rocket.chat/apps-engine/definition/api");
const Settings_1 = require("./src/settings/Settings");
const AskCommand_1 = require("./src/commands/AskCommand");
const SearchCommand_1 = require("./src/commands/SearchCommand");
const SummarizeCommand_1 = require("./src/commands/SummarizeCommand");
const ExplainCommand_1 = require("./src/commands/ExplainCommand");
const TranslateCommand_1 = require("./src/commands/TranslateCommand");
const BotMessageHandler_1 = require("./src/handlers/BotMessageHandler");
const MentionHandler_1 = require("./src/handlers/MentionHandler");
const FileUploadHandler_1 = require("./src/handlers/FileUploadHandler");
const CallbackEndpoint_1 = require("./src/api/CallbackEndpoint");
class RagChatApp extends App_1.App {
    constructor(info, logger, accessors) {
        super(info, logger, accessors);
        this.botHandler = new BotMessageHandler_1.BotMessageHandler();
        this.mentionHandler = new MentionHandler_1.MentionHandler();
        this.uploadHandler = new FileUploadHandler_1.FileUploadHandler();
    }
    async extendConfiguration(configuration, _environmentRead) {
        await (0, Settings_1.registerSettings)(configuration);
        await Promise.all([
            configuration.slashCommands.provideSlashCommand(new AskCommand_1.AskCommand()),
            configuration.slashCommands.provideSlashCommand(new SearchCommand_1.SearchCommand()),
            configuration.slashCommands.provideSlashCommand(new SummarizeCommand_1.SummarizeCommand()),
            configuration.slashCommands.provideSlashCommand(new ExplainCommand_1.ExplainCommand()),
            configuration.slashCommands.provideSlashCommand(new TranslateCommand_1.TranslateCommand()),
        ]);
        await configuration.api.provideApi({
            visibility: api_1.ApiVisibility.PUBLIC,
            security: api_1.ApiSecurity.UNSECURE,
            endpoints: [new CallbackEndpoint_1.CallbackEndpoint(this)],
        });
        this.getLogger().info('RAGChat App configured successfully');
    }
    async onEnable(environment, _configurationModify) {
        const settings = environment.getSettings();
        const backendUrl = await settings.getValueById('backend-url');
        if (!backendUrl || typeof backendUrl !== 'string' || !backendUrl.trim()) {
            this.getLogger().error('Backend URL is not configured — cannot enable app');
            return false;
        }
        this.getLogger().info('RAGChat App enabled');
        return true;
    }
    async onDisable(_configurationModify) {
        this.getLogger().info('RAGChat App disabled');
    }
    async executePostMessageSentToBot(message, read, http, persistence, modify) {
        await this.botHandler.executePostMessageSentToBot(message, read, http, persistence, modify);
    }
    async checkPostMessageSent(message, read, _http) {
        return this.mentionHandler.checkPostMessageSent(message, read);
    }
    async executePostMessageSent(message, read, http, persistence, modify) {
        await this.mentionHandler.executePostMessageSent(message, read, http, persistence, modify);
    }
    async executePreFileUpload(context, read, http, persis, modify) {
        await this.uploadHandler.executePreFileUpload(context, read, http, persis, modify);
    }
}
exports.RagChatApp = RagChatApp;
