# App Accessors

## Purpose

`IAppAccessors` is the bundle of core services injected into every Rocket.Chat App. It groups the six main accessors (environment, read, modify, HTTP, persistence, API endpoints) so the App can interact with the Rocket.Chat system and external services.

---

## Overview

When the Rocket.Chat server creates an App instance, it passes an `IAppAccessors` object to the constructor. This object contains pre-configured, ready-to-use accessors. The App can retrieve them via `this.getAccessors()` at any point after construction.

However, accessors may **not** be available during construction. The `accessors` parameter on the `App` constructor is marked optional (`accessors?: IAppAccessors`). Always use lifecycle hook parameters rather than `this.getAccessors()` when possible.

---

## When To Use

- Reading the App's environment and settings -> `accessors.environmentReader`
- Reading Rocket.Chat data (messages, rooms, users) -> `accessors.reader`
- Modifying Rocket.Chat data (creating messages, updating rooms) -> `accessors.modifier` (note: `IAppAccessors` does not include `modifier` directly; lifecycle hooks receive `IModify` separately)
- Making HTTP requests to external services -> `accessors.http`
- Storing and retrieving persistent app data -> `accessors.persistence`
- Accessing API endpoints defined by this App -> `accessors.providedApiEndpoints`

---

## Important Interfaces

### IAppAccessors

| Property | Type | Purpose |
|----------|------|---------|
| `.environmentReader` | `IEnvironmentRead` | Read app settings, server settings, and environment variables |
| `.environmentWriter` | `IEnvironmentWrite` | Update app settings and server settings at runtime |
| `.reader` | `IRead` | Full read accessor -- 15 sub-readers (messages, rooms, users, persistence, livechat, uploads, etc.) |
| `.http` | `IHttp` | HTTP client with `get()`, `post()`, `put()`, `del()`, `patch()` methods |
| `.providedApiEndpoints` | `Array<IApiEndpointMetadata>` | Metadata about API endpoints registered by this App |

### IEnvironmentRead (from `.environmentReader`)

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `getSettings()` | `ISettingRead` | Read this App's settings |
| `getServerSettings()` | `IServerSettingRead` | Read server-level settings (limited subset) |
| `getEnvironmentVariables()` | `IEnvironmentalVariableRead` | Read environment variables (limited subset) |

### IEnvironmentWrite (from `.environmentWriter`)

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `getSettings()` | `ISettingUpdater` | Update this App's settings at runtime |
| `getServerSettings()` | `IServerSettingUpdater` | Update server settings (limited subset) |

### IHttp (from `.http`)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `get()` | `(url, options?) => Promise<IHttpResponse>` | HTTP GET request |
| `post()` | `(url, options?) => Promise<IHttpResponse>` | HTTP POST request |
| `put()` | `(url, options?) => Promise<IHttpResponse>` | HTTP PUT request |
| `del()` | `(url, options?) => Promise<IHttpResponse>` | HTTP DELETE request |
| `patch()` | `(url, options?) => Promise<IHttpResponse>` | HTTP PATCH request |

### IPersistence (from lifecycle hooks, not `.persistence` directly on IAppAccessors)

**Note**: `IAppAccessors` does **not** include a `.persistence` property in the current interface. `IPersistence` is received as a separate parameter in lifecycle hooks (`onInstall()`, `onUninstall()`, `onUpdate()`, event handlers).

| Method | Signature | Purpose |
|--------|-----------|---------|
| `create()` | `(data: object) => Promise<string>` | Store data, returns record ID |
| `createWithAssociation()` | `(data, association) => Promise<string>` | Store data linked to a Rocket.Chat record |
| `createWithAssociations()` | `(data, associations) => Promise<string>` | Store data linked to multiple records |
| `update()` | `(id, data, upsert?) => Promise<string>` | Update existing record |
| `updateByAssociation()` | `(association, data, upsert?) => Promise<string>` | Update records by association |
| `remove()` | `(id: string) => Promise<object>` | Delete record by ID |
| `removeByAssociation()` | `(association) => Promise<Array<object>>` | Delete records by association |

---

## Methods

### App.getAccessors(): IAppAccessors

**Purpose**: Retrieve the accessor bundle injected into the App.

**Return value**: `IAppAccessors` -- the accessor bundle.

**Throws**: `Error('Accessors not initialized')` if called when accessors are not yet available (e.g., during early construction).

**Availability**: Accessors are set by the Rocket.Chat engine after construction but before `initialize()`. They are guaranteed to be available during lifecycle hooks.

---

## Typical Workflow

1. Rocket.Chat server constructs the App -- `constructor(info, logger, accessors?)` is called
2. Accessors may or may not be available during construction (do not rely on them)
3. `initialize()` is called -- receives `IConfigurationExtend` and `IEnvironmentRead` directly (preferred over `this.getAccessors()`)
4. `onEnable()` is called -- receives `IEnvironmentRead` and `IConfigurationModify` directly
5. Event handlers (slash commands, API endpoints) receive `IRead`, `IModify`, `IHttp`, `IPersistence` as **direct function parameters** -- these are the preferred way to access system capabilities
6. `onInstall()` / `onUninstall()` / `onUpdate()` receive all accessors as direct parameters

---

## Example

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {
    IAppAccessors,
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
} from '@rocket.chat/apps-engine/definition/accessors';

export class MyApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors?: IAppAccessors) {
        super(info, logger, accessors);

        // BAD: accessors may not be available here
        // const reader = this.getAccessors().reader; // May throw!

        // OK: log info that does not depend on accessors
        logger.info(`App ${info.name} constructed`);
    }

    public async initialize(
        configurationExtend: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        // PREFERRED: use the environmentRead parameter directly
        const settings = environmentRead.getSettings();
        const myValue = await settings.getValueById('my-setting');

        // Alternative (less preferred): get accessors via this.getAccessors()
        const accessors = this.getAccessors(); // OK here -- accessors are initialized
        const envReader = accessors.environmentReader;
        const httpClient = accessors.http;
        const apiEndpoints = accessors.providedApiEndpoints;

        this.getLogger().info(`Registered ${apiEndpoints.length} API endpoints`);
    }

    public async onEnable(
        environment: IEnvironmentRead,
        configurationModify: any,
    ): Promise<boolean> {
        // PREFERRED: use the environment parameter directly
        const apiKey = await environment.getSettings().getValueById('api-key');

        // Use accessors for HTTP calls
        const accessors = this.getAccessors();
        const response = await accessors.http.get('https://api.example.com/health');

        if (response.statusCode !== 200) {
            this.getLogger().warn('External service is not healthy');
            return false;
        }

        return true;
    }
}
```

---

## Best Practices

- **Prefer lifecycle hook parameters over `this.getAccessors()`** -- Hooks receive the exact accessors needed for that phase. This is safer (guaranteed available) and clearer (explicit dependencies).
- **Do not use accessors in the constructor** -- The `accessors` parameter is optional and may be `undefined`. `this.getAccessors()` will throw during construction.
- **Save a reference to commonly used accessor values** -- If you need `environmentReader` in multiple methods, consider reading it once and caching the result.
- **Use `accessors.http` for all external calls** -- Always use the App's HTTP client (not raw `fetch`). This ensures default headers, pre-request handlers, and SSRF protection are applied.
- **Use `accessors.environmentReader` for reading settings** -- Prefer this over direct `IEnvironmentRead` parameter when you need to access settings from within a helper class that does not receive environment parameters.

---

## Common Mistakes

- **Calling `this.getAccessors()` in the constructor** -> Throws "Accessors not initialized". Constructors receive `accessors?` which is optional and may not be set yet.
- **Using `this.getAccessors()` inside event handlers** -> Event handlers already receive `IRead`, `IHttp`, `IPersistence`, `IModify` as function parameters. Using `this.getAccessors()` is redundant and bypasses the explicit dependency injection.
- **Assuming `accessors.persistence` exists on `IAppAccessors`** -> The `IAppAccessors` interface does not include `.persistence` or `.modifier`. These are received as separate parameters in lifecycle hooks and event handlers.
- **Storing accessors as class properties during construction** -> The value may be `undefined` or incomplete. If you must cache an accessor, do so in `initialize()`.

---

## Related Topics

- [App Lifecycle](./app-lifecycle.md)
- [App Configuration](./app-configuration.md)
- [App Logging](./app-logging.md)
- [IRead Accessor](../accessors/i-read-accessor.md)
- [IModify Accessor](../accessors/i-modify-accessor.md)
