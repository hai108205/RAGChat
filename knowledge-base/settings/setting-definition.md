# Setting Definition

## Purpose

App settings allow Rocket.Chat administrators to configure your App's behavior without modifying code. Settings are defined during initialization and can be read at runtime.

---

## Overview

Settings are the primary configuration mechanism for Rocket.Chat Apps. Each setting has a type (boolean, string, number, select, color, etc.), a default value (`packageValue`), and visibility controls (`public` for regular users, or admin-only).

Settings are registered in `extendConfiguration()` via `configuration.settings.provideSetting()`. At runtime, read them via `read.getEnvironmentReader().getSettings().getById()`.

When an admin changes a setting, `onSettingUpdated()` is called. Before the change is applied, `onPreSettingUpdate()` gives you a chance to validate or reject it.

---

## When To Use

- Providing admin-configurable API keys → `SettingType.STRING` or `SettingType.PASSWORD`
- Toggling feature on/off → `SettingType.BOOLEAN`
- Setting numeric thresholds → `SettingType.NUMBER`
- Selecting from predefined options → `SettingType.SELECT` or `SettingType.MULTI_SELECT`
- Picking a room → `SettingType.ROOM_PICK`
- Choosing a color → `SettingType.COLOR`
- Embedding scripts/config → `SettingType.CODE`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `ISetting` | Setting definition | `id`, `type`, `packageValue`, `value`, `required`, `public`, `i18nLabel` |
| `SettingType` | Enum | `BOOLEAN`, `STRING`, `NUMBER`, `SELECT`, `MULTI_SELECT`, `PASSWORD`, `COLOR`, `CODE`, `ROOM_PICK` |
| `ISettingSelectValue` | Select option | `key`, `i18nLabel` |
| `ISettingRead` | Reading settings | `getById()`, `getValueById()` |
| `ISettingsExtend` | Registering settings | `provideSetting()` |
| `IConfigurationModify` | Modifying settings | `.settings` accessor |

---

## SettingType Enum

| Type | Enum Value | TS Type | UI Control | Description |
|------|-----------|---------|------------|-------------|
| `BOOLEAN` | `'boolean'` | `boolean` | Toggle switch | Yes/no configuration |
| `STRING` | `'string'` | `string` | Text input | Free-text configuration |
| `NUMBER` | `'int'` | `number` | Number input | Numeric thresholds/limits |
| `SELECT` | `'select'` | `string` | Dropdown (single) | Single option from list |
| `MULTI_SELECT` | `'multiSelect'` | `Array<string>` | Dropdown (multi) | Multiple options from list |
| `PASSWORD` | `'password'` | `string` | Password input | Display-masked, NOT encrypted |
| `COLOR` | `'color'` | `string` | Color picker | Hex color value |
| `CODE` | `'code'` | `string` | Code editor | Multi-line code/script |
| `ROOM_PICK` | `'roomPick'` | `Array<{ _id: string }>` | Room picker | Select rooms |
| `FONT` | `'font'` | `string` | Font picker | Font selection |

---

## ISetting Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique setting identifier |
| `type` | `SettingType` | Yes | Setting type |
| `packageValue` | `any` | Yes | Default value from app package |
| `value` | `any` | No | Current value (runtime). For `ROOM_PICK`: `[{_id: 'rid1'}, {_id: 'rid2'}]` |
| `required` | `boolean` | Yes | Must be configured |
| `public` | `boolean` | Yes | `false` = admin-only, `true` = visible to all |
| `hidden` | `boolean` | No | Hidden from settings UI (cannot be hidden and required) |
| `values` | `Array<ISettingSelectValue>` | No | Options for SELECT/MULTI_SELECT |
| `multiline` | `boolean` | No | Multi-line text for STRING type |
| `section` | `string` | No | Settings grouping section name |
| `i18nLabel` | `string` | Yes | i18n key for label |
| `i18nDescription` | `string` | No | i18n key for description |
| `i18nAlert` | `string` | No | i18n key for alert/warning message |
| `i18nPlaceholder` | `string` | No | i18n key for input placeholder |
| `createdAt` | `Date` | No | Creation timestamp |
| `updatedAt` | `Date` | No | Last update timestamp |

---

## Typical Workflow

### 1. Register Settings During Initialization

```typescript
protected async extendConfiguration(
    configuration: IConfigurationExtend,
    environmentRead: IEnvironmentRead
): Promise<void> {
    await configuration.settings.provideSetting({
        id: 'api-key',
        type: SettingType.PASSWORD,
        required: true,
        public: false, // Admin only
        i18nLabel: 'API Key',
        i18nDescription: 'Enter your external service API key',
        packageValue: '',
    });

    await configuration.settings.provideSetting({
        id: 'notify-on-mention',
        type: SettingType.BOOLEAN,
        required: false,
        public: true,
        i18nLabel: 'Notify on @mention',
        packageValue: true,
    });

    await configuration.settings.provideSetting({
        id: 'log-level',
        type: SettingType.SELECT,
        required: false,
        public: true,
        i18nLabel: 'Log Level',
        packageValue: 'info',
        values: [
            { key: 'debug', i18nLabel: 'Debug' },
            { key: 'info', i18nLabel: 'Info' },
            { key: 'warn', i18nLabel: 'Warning' },
            { key: 'error', i18nLabel: 'Error' },
        ],
    });
}
```

### 2. Reading Settings at Runtime

```typescript
const settingsReader = read.getEnvironmentReader().getSettings();
const apiKey = await settingsReader.getValueById('api-key');
const notifyOnMention = await settingsReader.getValueById('notify-on-mention');
```

### 3. Reacting to Setting Changes

```typescript
public async onSettingUpdated(
    setting: ISetting,
    configurationModify: IConfigurationModify,
    read: IRead,
    http: IHttp
): Promise<void> {
    this.getLogger().info(`Setting "${setting.id}" changed to:`, setting.value);

    if (setting.id === 'api-key') {
        // Re-initialize external service connection
    }
}
```

---

## Example

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend, IEnvironmentRead, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';
import { ISetting } from '@rocket.chat/apps-engine/definition/settings';

export class MyConfiguredApp extends App {
    protected async extendConfiguration(
        configuration: IConfigurationExtend
    ): Promise<void> {
        await Promise.all([
            configuration.settings.provideSetting({
                id: 'webhook-url',
                type: SettingType.STRING,
                required: true,
                public: false,
                i18nLabel: 'Webhook URL',
                i18nPlaceholder: 'https://hooks.example.com/...',
                packageValue: '',
            }),
            configuration.settings.provideSetting({
                id: 'max-retries',
                type: SettingType.NUMBER,
                required: false,
                public: true,
                i18nLabel: 'Max Retries',
                packageValue: 3,
            }),
        ]);
    }

    public async onEnable(
        environment: IEnvironmentRead,
        configurationModify: any
    ): Promise<boolean> {
        const settings = environment.getSettings();
        const webhookUrl = await settings.getValueById('webhook-url');

        if (!webhookUrl) {
            this.getLogger().warn('Cannot enable: webhook-url is not configured');
            return false; // Prevent enable until configured
        }

        return true;
    }
}
```

---

## Best Practices

- **Use `PASSWORD` type for secrets** — though note it's display-masked, not encrypted at rest.
- **Set `required: true`** for settings without which the App cannot function.
- **Set `public: false`** for settings that should only be visible to administrators.
- **Validate required settings in `onEnable()`** and return `false` if not configured.
- **Use `values` array** for SELECT/MULTI_SELECT to provide a controlled list of options.
- **Group related settings** using the `section` property.
- **Use `packageValue`** to provide sensible defaults.
- **Use `i18nLabel` keys** consistently — internationalization is expected.

---

## Common Mistakes

- **Storing secrets in STRING settings** → Use PASSWORD type, but know it's not truly encrypted.
- **Not checking `required` settings in `onEnable()`** → App starts with empty configuration.
- **Using SELECT without `values`** → The dropdown is empty.
- **Reading settings in the constructor** → Settings aren't available yet. Read them in lifecycle hooks.
- **Forgetting to await `getValueById()`** — It returns a Promise.
- **Assuming `setting.value` is the same type as `packageValue`** — The admin might have cleared a required field.

---

## Related Topics

- [Setting Updates](./setting-updates.md)
- [Environment Read Accessor](../accessors/i-environment-read.md)
- [App Configuration](../app/app-configuration.md)
- [App Lifecycle](../app/app-lifecycle.md)
