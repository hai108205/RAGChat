# App Lifecycle

## Purpose

Every Rocket.Chat App extends the `App` abstract class. Understanding the lifecycle — from construction to uninstallation — is the foundation for building any App.

---

## Overview

The `App` class is the entry point for all Rocket.Chat Apps. It defines lifecycle hooks that the Rocket.Chat server calls at specific moments: initialization, enable/disable, install/uninstall, and update. Developers override these hooks to register features, handle events, and manage resources.

The lifecycle follows a linear flow with cycles for enable/disable:

```
CONSTRUCTED → INITIALIZED → ENABLED ⇄ DISABLED → UNINSTALLED
```

The `AppStatus` enum tracks the current state. Use `AppStatusUtils` to check if an app is enabled, disabled, or in an error state.

---

## When To Use

- Registering slash commands, settings, API endpoints, schedulers → `initialize()`
- Validating configuration before allowing enable → `onEnable()` return `false`
- Cleaning up resources when disabled → `onDisable()`
- Setting up initial data on first install → `onInstall()`
- Cleaning up all data on uninstall → `onUninstall()`
- Migrating data on version upgrade → `onUpdate()`
- Reacting to setting changes → `onSettingUpdated()` / `onPreSettingUpdate()`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `App` | Abstract base class | `initialize()`, `onEnable()`, `onDisable()`, `onInstall()`, `onUninstall()`, `onUpdate()` |
| `IAppInfo` | App metadata | `id`, `name`, `version`, `description`, `requiredApiVersion`, `author` |
| `ILogger` | Logging | `debug()`, `info()`, `warn()`, `error()` |
| `IConfigurationExtend` | Feature registration | `.settings`, `.slashCommands`, `.api`, `.scheduler`, `.ui`, `.videoConfProviders` |
| `IConfigurationModify` | Modify existing config | `.settings`, `.slashCommands`, `.api`, `.scheduler` |
| `IEnvironmentRead` | Environment access | `.getSettings()`, `.getServerSettings()`, `.getEnvironmentVariables()` |
| `IRead` | Read accessor | 15 sub-readers for messages, rooms, users, etc. |
| `IModify` | Write accessor | 10 sub-modifiers for creating, updating, deleting |
| `IHttp` | HTTP client | `get()`, `post()`, `put()`, `del()`, `patch()` |
| `IPersistence` | Data storage | `create()`, `update()`, `remove()`, with association support |
| `AppStatus` | State enum | `CONSTRUCTED`, `INITIALIZED`, `AUTO_ENABLED`, `MANUALLY_ENABLED`, etc. |
| `AppStatusUtils` | Status helpers | `isEnabled()`, `isDisabled()`, `isError()` |

---

## Methods

### `constructor(info: IAppInfo, logger: ILogger, accessors?: IAppAccessors)`

**Purpose**: Called when the server starts up and creates the App instance.

**Parameters**:
- `info` — App metadata from `app.json` manifest
- `logger` — Logger instance scoped to this App
- `accessors` — Optional accessor bundle (may not be available during construction)

**Return value**: void (constructor)

**Side effects**: Sets status to `CONSTRUCTED`, logs construction message.

**Important**: The constructor may be called **more than once** (e.g., on server restart). Do NOT put registration logic here. Use `initialize()` instead.

---

### `initialize(configurationExtend: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void>`

**Purpose**: Called **once** during app initialization. This is where you register all features.

**Parameters**:
- `configurationExtend` — Use this to register settings, slash commands, API endpoints, schedulers, UI elements, video conference providers, and outbound communication providers
- `environmentRead` — Read app settings, server settings, and environment variables

**Return value**: `Promise<void>`

**Side effects**: All registrations made via `configurationExtend` become active. If this method throws, all registrations are **rolled back**.

**Default implementation**: Calls `this.extendConfiguration(configurationExtend, environmentRead)`.

---

### `onEnable(environment: IEnvironmentRead, configurationModify: IConfigurationModify): Promise<boolean>`

**Purpose**: Called when the App is enabled. Can be called **multiple times** (after init, or when admin re-enables a disabled app).

**Parameters**:
- `environment` — Read environment settings
- `configurationModify` — Modify existing configuration (e.g., update setting values)

**Return value**: `Promise<boolean>` — Return `false` to **prevent** the App from being enabled. Return `true` to allow.

**Side effects**: If returns `true`, App status transitions to enabled.

**Default implementation**: Returns `true`.

---

### `onDisable(configurationModify: IConfigurationModify): Promise<void>`

**Purpose**: Called when the App is disabled. Can be called **multiple times**. Use this to clean up runtime resources.

**Parameters**:
- `configurationModify` — Accessor to modify configuration during disable

**Return value**: `Promise<void>`

**Default implementation**: Empty (no-op).

---

### `onInstall(context: IAppInstallationContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void>`

**Purpose**: Called **once** when the App is first installed. **NOT** called on updates. Use this to set up initial persistent data.

**Parameters**:
- `context` — Installation context (includes the installing user)
- `read` — Full read accessor
- `http` — HTTP client
- `persistence` — Data storage
- `modify` — Full modify accessor

**Return value**: `Promise<void>`

**Default implementation**: Empty.

---

### `onUninstall(context: IAppUninstallationContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void>`

**Purpose**: Called **once** when the App is uninstalled. **NOT** called on disable. Clean up ALL persistent data here — this is the last chance before the App is removed.

**Parameters**: Same as `onInstall()`, with uninstallation context.

**Return value**: `Promise<void>`

**Default implementation**: Empty.

---

### `onUpdate(context: IAppUpdateContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void>`

**Purpose**: Called **once** when the App is updated to a new version. **NOT** called on install. Use this for data migrations.

**Parameters**: Same as `onInstall()`, with update context (includes old and new version).

**Return value**: `Promise<void>`

**Default implementation**: Empty.

---

### `onSettingUpdated(setting: ISetting, configurationModify: IConfigurationModify, read: IRead, http: IHttp): Promise<void>`

**Purpose**: Called **after** an app setting has been changed by an external system (admin UI). React to configuration changes.

**Parameters**:
- `setting` — The newly updated setting
- Others as above

**Return value**: `Promise<void>`

**Default implementation**: Empty.

---

### `onPreSettingUpdate(context: ISettingUpdateContext, configurationModify: IConfigurationModify, read: IRead, http: IHttp): Promise<ISetting>`

**Purpose**: Called **before** an app setting is going to be changed. Validate the new value. Return the setting (possibly modified) to proceed, or throw to block the change.

**Parameters**:
- `context` — Contains `oldSetting` and `newSetting`

**Return value**: `Promise<ISetting>` — The setting to apply.

**Default implementation**: Returns `context.newSetting` unchanged.

---

## Typical Workflow

1. **App is installed** → `constructor()` → `initialize()` (register features) → `onInstall()` (set up data)
2. **App is enabled** → `onEnable()` → if returns `true`, status becomes `MANUALLY_ENABLED`
3. **App runs** — Event handlers, slash commands, API endpoints process requests
4. **Admin changes a setting** → `onPreSettingUpdate()` → `onSettingUpdated()`
5. **App is disabled** → `onDisable()` → status becomes `MANUALLY_DISABLED`
6. **App is re-enabled** → `onEnable()` → status becomes `MANUALLY_ENABLED` again
7. **App is updated** → `onDisable()` (old version) → `onUpdate()` (new version) → `onEnable()` (new version)
8. **App is uninstalled** → `onDisable()` → `onUninstall()` → App removed

---

## Example

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import {
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISetting } from '@rocket.chat/apps-engine/definition/settings';
import { ISettingUpdateContext } from '@rocket.chat/apps-engine/definition/settings/ISettingUpdateContext';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

export class MyApp extends App {
    constructor(info: IAppInfo, logger: ILogger) {
        super(info, logger);
    }

    public async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        // Register an app setting
        await configuration.settings.provideSetting({
            id: 'my-setting',
            type: SettingType.STRING,
            required: false,
            public: false,
            i18nLabel: 'My Setting',
            packageValue: 'default-value',
        });
    }

    public async onEnable(
        environment: IEnvironmentRead,
        configurationModify: IConfigurationModify
    ): Promise<boolean> {
        this.getLogger().info('App is being enabled');
        return true; // Allow enable
    }

    public async onDisable(
        configurationModify: IConfigurationModify
    ): Promise<void> {
        this.getLogger().info('App is being disabled');
    }

    public async onInstall(
        context: any,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        this.getLogger().info('App installed for the first time');
        // Set up initial persistent data
        await persistence.createWithAssociation(
            { installedAt: new Date() },
            new (await import('@rocket.chat/apps-engine/definition/metadata')).RocketChatAssociationRecord(
                (await import('@rocket.chat/apps-engine/definition/metadata')).RocketChatAssociationModel.MISC,
                'setup'
            )
        );
    }

    public async onUninstall(
        context: any,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        this.getLogger().info('App is being uninstalled — cleaning up');
        // Remove all persisted data
    }
}
```

---

## Best Practices

- **Register features in `initialize()`**, not in the constructor. The constructor may be called multiple times.
- **Call `super(info, logger)`** in your constructor to ensure proper initialization.
- **Return `false` from `onEnable()`** if required settings are not configured — this prevents the App from running in a broken state.
- **Clean up ALL data in `onUninstall()`** — this is the final opportunity before the App is removed.
- **Use `onUpdate()` for data migrations** when changing the data schema between versions.
- **Log lifecycle events** using `this.getLogger()` for easier debugging.
- **Override `extendConfiguration()`** rather than `initialize()` unless you need to customize the initialization flow.

---

## Common Mistakes

- **Putting registration logic in the constructor** → The constructor may run multiple times. Always use `initialize()`.
- **Not cleaning up data in `onUninstall()`** → Persistent data from uninstalled Apps lingers forever.
- **Not returning `false` from `onEnable()` when config is invalid** → The App will be enabled with bad configuration.
- **Confusing `onDisable()` with `onUninstall()`** → `onDisable()` is called BOTH on disable and on uninstall. `onUninstall()` is called only on removal. Don't delete critical data in `onDisable()`.
- **Comparing AppStatus enum values as strings** → Use `AppStatusUtils.isEnabled(status)` instead.

---

## Related Topics

- [App Information & Metadata](./app-info-metadata.md)
- [App Configuration](./app-configuration.md)
- [App Accessors](./app-accessors.md)
- [App Logging](./app-logging.md)
- [App Permissions](./app-permissions.md)
- [IRead Accessor](../accessors/i-read-accessor.md)
- [IModify Accessor](../accessors/i-modify-accessor.md)
