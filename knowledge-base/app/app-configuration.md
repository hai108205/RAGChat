# App Configuration

## Purpose

`IConfigurationExtend` and `IConfigurationModify` are the two accessors that control how an App registers and modifies its features. `IConfigurationExtend` is used during initialization to declare what the App provides. `IConfigurationModify` is used during enable/disable to adjust existing configuration.

---

## Overview

Configuration happens in two phases:

1. **Registration phase** (`initialize()` / `extendConfiguration()`) -- Use `IConfigurationExtend` to register features. This is called once after construction. If an error is thrown, all registrations are rolled back.

2. **Modification phase** (`onEnable()` / `onDisable()`) -- Use `IConfigurationModify` to adjust existing settings, slash commands, or schedulers. Called each time the App is enabled or disabled.

```
constructor() -> initialize(IConfigurationExtend) -> onEnable(IConfigurationModify)  <->  onDisable(IConfigurationModify)
```

---

## When To Use

- Registering app settings, slash commands, API endpoints, schedulers, UI elements, video conference providers, external components, or outbound communication providers -> `IConfigurationExtend`
- Validating and modifying configuration before the App becomes active -> `IConfigurationModify` in `onEnable()`
- Cleaning up runtime configuration when disabled -> `IConfigurationModify` in `onDisable()`

---

## Important Interfaces

### IConfigurationExtend

| Extender Property | Type | Purpose |
|-------------------|------|---------|
| `.http` | `IHttpExtend` | Configure default HTTP headers, query params, pre-request/pre-response handlers for all outgoing HTTP calls |
| `.settings` | `ISettingsExtend` | Register app settings (displayed on the App's admin page) |
| `.slashCommands` | `ISlashCommandsExtend` | Register slash commands available in the chat |
| `.api` | `IApiExtend` | Register REST API endpoints |
| `.externalComponents` | `IExternalComponentsExtend` | Register iframe components for embedding in Rocket.Chat UI |
| `.scheduler` | `ISchedulerExtend` | Register job processors (cron-like scheduled tasks) |
| `.ui` | `IUIExtend` | Register action buttons and other UI elements |
| `.videoConfProviders` | `IVideoConfProvidersExtend` | Register third-party video conference providers |
| `.outboundCommunication` | `IOutboundCommunicationProviderExtend` | Register outbound communication providers (e.g., WhatsApp, SMS) |

### IConfigurationModify

| Modifier Property | Type | Purpose |
|-------------------|------|---------|
| `.serverSettings` | `IServerSettingsModify` | Modify server-level settings (limited subset) |
| `.slashCommands` | `ISlashCommandsModify` | Modify existing slash commands in the system |
| `.scheduler` | `ISchedulerModify` | Modify scheduled jobs (create, cancel, reschedule) |

---

## Methods

### ISettingsExtend.provideSetting(setting: ISetting): Promise\<void\>

Register a single setting. Settings appear on the App's admin configuration page. If the setting ID already exists, registration fails.

### ISlashCommandsExtend.provideSlashCommand(command: ISlashCommand): Promise\<void\>

Register a slash command. The command's executor function is invoked whenever a user types `/[command]` in chat. Duplicate command names cause an error.

### IApiExtend.provideApi(api: IApi): Promise\<void\>

Register an API endpoint. External services can call `https://your-rocketchat-instance/api/apps/public/{appId}/{endpoint}`. Duplicate paths cause an error.

### IHttpExtend

- `provideDefaultHeader(key, value)` -- Add a header to every outgoing HTTP request
- `provideDefaultHeaders({ key: value })` -- Add multiple headers at once
- `provideDefaultParam(key, value)` -- Add a query parameter to every outgoing HTTP request
- `provideDefaultParams({ key: value })` -- Add multiple query parameters at once
- `providePreRequestHandler(handler)` -- Register a function called before each request (can modify the request)
- `providePreResponseHandler(handler)` -- Register a function called after each response (can modify the response)

---

## Typical Workflow

1. App is constructed -- `initialize()` receives `IConfigurationExtend`
2. `extendConfiguration()` registers settings, slash commands, API endpoints, schedulers
3. App is enabled -- `onEnable()` receives `IConfigurationModify`
4. `onEnable()` can modify slash commands or server settings before App goes live
5. App is disabled -- `onDisable()` receives `IConfigurationModify`
6. `onDisable()` can clean up or disable features

---

## Example

```typescript
import { IApp } from '@rocket.chat/apps-engine/definition/IApp';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';
import { IHttp, IRead, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/accessors';

export class MyConfiguredApp implements IApp {
    constructor(
        private readonly info: IAppInfo,
        private readonly logger: ILogger,
    ) {}

    public async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        // 1. Register an app setting (shown on the admin configuration page)
        await configuration.settings.provideSetting({
            id: 'api-key',
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: 'API Key',
            i18nDescription: 'API key for external service',
            packageValue: '',
        });

        await configuration.settings.provideSetting({
            id: 'enable-notifications',
            type: SettingType.BOOLEAN,
            required: false,
            public: true,
            i18nLabel: 'Enable Notifications',
            packageValue: true,
        });

        // 2. Register a slash command
        await configuration.slashCommands.provideSlashCommand({
            command: 'myapp-hello',
            i18nDescription: 'Says hello',
            i18nParamsExample: '',
            providesPreview: false,
            executor: async (context, read, modify, http, persistence) => {
                // Command logic here
            },
        });

        // 3. Register an API endpoint
        await configuration.api.provideApi({
            endpoints: [
                {
                    path: 'webhook',
                    get: async (request, endpoint, read, modify, http, persistence) => {
                        // Handle GET request
                    },
                    post: async (request, endpoint, read, modify, http, persistence) => {
                        // Handle POST request
                    },
                },
            ],
        });

        // 4. Configure default HTTP headers for all outgoing requests
        configuration.http.provideDefaultHeader('X-MyApp-Version', this.info.version);
        configuration.http.provideDefaultParam('source', 'rocket-chat-app');

        // 5. Register a pre-request handler to add auth
        configuration.http.providePreRequestHandler({
            executePreHttpRequest: async (url, request) => {
                const apiKey = await environmentRead.getSettings().getValueById('api-key');
                if (request.headers) {
                    request.headers['Authorization'] = `Bearer ${apiKey}`;
                }
                return request;
            },
        });
    }

    public async onEnable(
        environment: IEnvironmentRead,
        configurationModify: IConfigurationModify,
    ): Promise<boolean> {
        // Validate required settings exist
        const apiKey = await environment.getSettings().getValueById('api-key');
        if (!apiKey) {
            this.logger.error('API Key is not configured. App will not be enabled.');
            return false; // Prevent enable -- api-key is required
        }

        this.logger.success('All required settings are configured.');
        return true;
    }

    public async onDisable(
        configurationModify: IConfigurationModify,
    ): Promise<void> {
        // Clean up runtime resources
        this.logger.info('App disabled. Cleaning up.');
    }

    // Other lifecycle methods...
    public async initialize(
        configurationExtend: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        await this.extendConfiguration(configurationExtend, environmentRead);
    }

    public async onUninstall(
        context: any,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {}

    public async onInstall(
        context: any,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {}

    public async onUpdate(
        context: any,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {}

    public getLogger(): ILogger {
        return this.logger;
    }

    public getAccessors(): any {
        return undefined;
    }

    public getID(): string {
        return this.info.id;
    }

    public getName(): string {
        return this.info.name;
    }

    public getNameSlug(): string {
        return this.info.nameSlug;
    }

    public getVersion(): string {
        return this.info.version;
    }

    public getDescription(): string {
        return this.info.description;
    }

    public getRequiredApiVersion(): string {
        return this.info.requiredApiVersion;
    }

    public async onSettingUpdated(
        setting: any,
        configurationModify: IConfigurationModify,
        read: IRead,
        http: IHttp,
    ): Promise<void> {
        this.logger.info(`Setting updated: ${setting.id}`);
    }
}
```

---

## Best Practices

- **Register all features in `extendConfiguration()`**, not in `initialize()` -- override `extendConfiguration()` for cleaner code. The `initialize()` method calls it by default.
- **Return `false` from `onEnable()`** when required settings are missing -- prevents the App from running with bad configuration.
- **Use `environmentRead.getSettings().getValueById()`** to read app setting values during `extendConfiguration()` or `onEnable()`.
- **Provide default parameters once** -- Call `provideDefaultHeader()` / `provideDefaultParam()` once during configuration, not before every request.
- **Group related settings logically** -- settings with related functionality should be named with a common prefix (e.g., `webhook-url`, `webhook-secret`).
- **Validate setting values** in `onPreSettingUpdate()` before they are committed.

---

## Common Mistakes

- **Registering features in `onEnable()`** -- Feature registration must happen in `initialize()` / `extendConfiguration()`. `onEnable()` only receives `IConfigurationModify`, which cannot register new features.
- **Not returning `false` from `onEnable()` when config is invalid** -- The App will be enabled with missing or bad configuration.
- **Throwing in `extendConfiguration()`** -- All registrations are rolled back. Use try/catch and log errors instead.
- **Assuming settings have values during registration** -- Settings are registered with `packageValue` (default), but admin-configured values are only available after enable.
- **Registering duplicate command/endpoint names** -- Registration throws on duplicates. Check for existing commands if your App may be re-registered.

---

## Related Topics

- [App Lifecycle](./app-lifecycle.md)
- [App Accessors](./app-accessors.md)
- [App Logging](./app-logging.md)
- [App Permissions](./app-permissions.md)
- [IRead Accessor](../accessors/i-read-accessor.md)
- [IModify Accessor](../accessors/i-modify-accessor.md)
