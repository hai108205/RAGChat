# Setting Updates

## Purpose

`ISettingUpdateContext` provides both the old and new values of a setting during update lifecycle hooks. The `onPreSettingUpdate` and `onSettingUpdated` hooks let Apps validate changes before they apply, and react after they are saved.

---

## Overview

When a Rocket.Chat administrator changes an App setting, two hooks fire in sequence:

1. **`onPreSettingUpdate(context, ...)`** — Called *before* the change is applied. Receives `ISettingUpdateContext` with `oldSetting` and `newSetting`. You can validate the new value and either return it as-is, modify it (transformation), or reject it by throwing an error.

2. **`onSettingUpdated(setting, ...)`** — Called *after* the change is saved. Receives the final `ISetting` object. Use it to react to the change — reinitialize connections, update caches, or notify users.

Both hooks are defined on the `App` base class and can be overridden.

---

## When To Use

- Validating a setting value before applying → `onPreSettingUpdate` — throw if invalid
- Transforming a setting value before saving → `onPreSettingUpdate` — return modified setting
- Reconnecting to an external service after API key change → `onSettingUpdated`
- Logging setting changes → `onSettingUpdated`
- Updating app behavior based on new config → `onSettingUpdated`
- Preventing invalid configuration → `onPreSettingUpdate`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `ISettingUpdateContext` | Pre-update context | `oldSetting: ISetting`, `newSetting: ISetting` |
| `ISetting` | Setting definition | `id`, `type`, `value`, `packageValue`, `required`, `public` |
| `App` (base class) | Lifecycle hooks | `onPreSettingUpdate()`, `onSettingUpdated()` |

---

## ISettingUpdateContext Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `oldSetting` | `ISetting` | Yes | The setting as it currently exists in the database |
| `newSetting` | `ISetting` | Yes | The proposed new setting (from admin input) |

---

## Hooks

### `onPreSettingUpdate(context, configurationModify, read, http): Promise<ISetting>`

**When**: Before a setting change is saved to the database.

**Parameters**:
- `context: ISettingUpdateContext` — holds `oldSetting` and `newSetting`
- `configurationModify: IConfigurationModify` — accessor to modify configuration
- `read: IRead` — read accessor
- `http: IHttp` — HTTP client

**Returns**: `Promise<ISetting>` — the setting that will be saved. Default implementation returns `context.newSetting` unchanged.

**Reject the change**: Throw an error. The admin will see an error message in the UI.

**Transform the value**: Modify the setting (e.g. trim whitespace, enforce format) and return the transformed version.

### `onSettingUpdated(setting, configurationModify, read, http): Promise<void>`

**When**: After a setting change has been saved to the database.

**Parameters**:
- `setting: ISetting` — the newly saved setting (post-update value)
- `configurationModify: IConfigurationModify` — accessor to modify configuration
- `read: IRead` — read accessor
- `http: IHttp` — HTTP client

**Returns**: `Promise<void>`

---

## Typical Workflow

### 1. Validating a New Setting Value Before Applying

```typescript
import { ISettingUpdateContext, ISetting } from '@rocket.chat/apps-engine/definition/settings';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

public async onPreSettingUpdate(
    context: ISettingUpdateContext,
    configurationModify: IConfigurationModify,
    read: IRead,
    http: IHttp,
): Promise<ISetting> {
    const { oldSetting, newSetting } = context;

    // Validate webhook URL format
    if (newSetting.id === 'webhook-url') {
        const url = newSetting.value as string;
        if (url && !url.startsWith('https://')) {
            throw new Error('Webhook URL must use HTTPS');
        }
    }

    // Validate max-retries is a positive number
    if (newSetting.id === 'max-retries') {
        const value = newSetting.value as number;
        if (value !== undefined && (value < 1 || value > 10)) {
            throw new Error('Max retries must be between 1 and 10');
        }
    }

    // Validate required field is not empty
    if (newSetting.required && !newSetting.value) {
        throw new Error(`Setting "${newSetting.id}" is required and cannot be empty`);
    }

    return context.newSetting; // Accept the change
}
```

### 2. Transforming a Setting Value

```typescript
public async onPreSettingUpdate(
    context: ISettingUpdateContext,
    configurationModify: IConfigurationModify,
    read: IRead,
    http: IHttp,
): Promise<ISetting> {
    const { newSetting } = context;

    // Auto-trim API key whitespace
    if (newSetting.id === 'api-key') {
        newSetting.value = (newSetting.value as string || '').trim();
    }

    // Force lowercase for log-level
    if (newSetting.id === 'log-level') {
        newSetting.value = (newSetting.value as string || 'info').toLowerCase();
    }

    return newSetting;
}
```

### 3. Reacting to a Setting Change

```typescript
public async onSettingUpdated(
    setting: ISetting,
    configurationModify: IConfigurationModify,
    read: IRead,
    http: IHttp,
): Promise<void> {
    this.getLogger().info(`Setting "${setting.id}" updated to:`, setting.value);

    switch (setting.id) {
        case 'api-key':
            // Re-initialize external API client with new key
            await this.initializeApiClient(setting.value as string);
            break;

        case 'notify-on-mention':
            // Feature toggled on/off
            this.notifyOnMention = setting.value as boolean;
            break;

        case 'log-level':
            // Reconfigure logger verbosity (if supported)
            this.getLogger().info(`Log level changed to: ${setting.value}`);
            break;

        case 'webhook-url':
            // Validate the new webhook is reachable
            try {
                const response = await http.get(setting.value as string);
                if (response.statusCode !== 200) {
                    this.getLogger().warn(`Webhook URL returned status ${response.statusCode}`);
                }
            } catch (err) {
                this.getLogger().error(`Failed to reach webhook URL: ${err}`);
            }
            break;
    }
}
```

### 4. Full Example: App with Validated Settings

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import {
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISetting, ISettingUpdateContext, SettingType } from '@rocket.chat/apps-engine/definition/settings';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

export class ValidatedApp extends App {
    private apiKey = '';

    constructor(info: IAppInfo, logger: any, accessors: any) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
    ): Promise<void> {
        await configuration.settings.provideSetting({
            id: 'api-key',
            type: SettingType.PASSWORD,
            required: true,
            public: false,
            i18nLabel: 'API Key',
            packageValue: '',
        });

        await configuration.settings.provideSetting({
            id: 'max-retries',
            type: SettingType.NUMBER,
            required: false,
            public: true,
            i18nLabel: 'Max Retries',
            packageValue: 3,
        });
    }

    public async onPreSettingUpdate(
        context: ISettingUpdateContext,
        configurationModify: IConfigurationModify,
        read: IRead,
        http: IHttp,
    ): Promise<ISetting> {
        if (context.newSetting.id === 'max-retries') {
            const val = context.newSetting.value as number;
            if (val < 1 || val > 10) {
                throw new Error('Max retries must be between 1 and 10');
            }
        }

        if (context.newSetting.id === 'api-key') {
            const key = (context.newSetting.value as string || '').trim();
            context.newSetting.value = key;
            if (context.newSetting.required && !key) {
                throw new Error('API Key cannot be empty');
            }
        }

        return context.newSetting;
    }

    public async onSettingUpdated(
        setting: ISetting,
        configurationModify: IConfigurationModify,
        read: IRead,
        http: IHttp,
    ): Promise<void> {
        if (setting.id === 'api-key') {
            this.apiKey = setting.value as string;
            this.getLogger().info('API key updated');
        }
    }
}
```

---

## Best Practices

- **Throw descriptive errors in `onPreSettingUpdate`** — The error message is shown to the admin in the UI. Be clear about what is wrong.
- **Return `context.newSetting`** (or a modified copy) — Failing to return skips the update entirely (like rejecting it).
- **Validate types match `SettingType`** — A NUMBER setting's `value` is `number`, but could be `undefined`. Check both.
- **Use `onSettingUpdated` for side effects** — HTTP calls, cache invalidation, logging. Don't block the save.
- **Don't call `onSettingUpdated` logic from `onPreSettingUpdate`** — The setting isn't saved yet.
- **Trim strings, normalize case** in `onPreSettingUpdate` — ensures consistent stored values.
- **Check `setting.id`** in both hooks — a single hook handles all settings. Use a switch or if-chain.

---

## Common Mistakes

- **Not returning `context.newSetting` from `onPreSettingUpdate`** — The update is silently dropped.
- **Throwing on non-critical validation** — The admin cannot save any change until the error is resolved. Only throw for truly invalid states.
- **Assuming `setting.value` is always defined** — Admins can clear optional fields. `value` becomes `undefined`.
- **Making slow HTTP calls in `onPreSettingUpdate`** — Blocks the save operation. Defer to `onSettingUpdated`.
- **Modifying `context.newSetting` without returning it** — The modification is lost.

---

## Related Topics

- [Setting Definition](./setting-definition.md)
- [App Lifecycle](../app/app-lifecycle.md)
- [App Configuration](../app/app-configuration.md)
- [Environment Read Accessor](../accessors/i-environment-read.md)
