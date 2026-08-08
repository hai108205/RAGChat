# Setting Types Reference

`SettingType` enum values with their TypeScript types and UI rendering description.

---

## SettingType Enum

```typescript
export enum SettingType {
    BOOLEAN = 'boolean',
    CODE = 'code',
    COLOR = 'color',
    FONT = 'font',
    NUMBER = 'int',
    SELECT = 'select',
    STRING = 'string',
    MULTI_SELECT = 'multiSelect',
    PASSWORD = 'password',
    ROOM_PICK = 'roomPick',
}
```

---

## Type Reference Table

| SettingType | Enum Value | TS Type of `value` | UI Widget | Notes |
|---|---|---|---|---|
| `BOOLEAN` | `'boolean'` | `boolean` | Toggle switch | True/false setting |
| `CODE` | `'code'` | `string` | Code editor | Syntax-highlighted code input |
| `COLOR` | `'color'` | `string` | Color picker | Hex color value |
| `FONT` | `'font'` | `string` | Font selector | Font family selection |
| `NUMBER` | `'int'` | `number` | Number input | Integer value |
| `SELECT` | `'select'` | `string` | Dropdown | Single selection from options |
| `STRING` | `'string'` | `string` | Text input | Free-form text |
| `MULTI_SELECT` | `'multiSelect'` | `string[]` | Multi-select dropdown | Multiple selections from options |
| `PASSWORD` | `'password'` | `string` | Password input (masked) | Renders as password field in UI. **Note: value is NOT encrypted** -- it is treated as a password only on the screen. |
| `ROOM_PICK` | `'roomPick'` | `string` | Room picker | Room ID selector |

---

## Defining Settings

Settings are declared in `initialize()` via `IConfigurationExtend.settings.provideSetting()`:

```typescript
import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

protected async initialize(configuration: IConfigurationExtend): Promise<void> {
    // Boolean switch
    await configuration.settings.provideSetting({
        id: 'enable_feature',
        type: SettingType.BOOLEAN,
        defaultValue: false,
        required: true,
        public: true,
        i18nLabel: 'Enable Feature',
        i18nDescription: 'Turns on the experimental feature',
    });

    // String input
    await configuration.settings.provideSetting({
        id: 'api_key',
        type: SettingType.PASSWORD,  // Masked in UI
        defaultValue: '',
        required: true,
        public: false,  // Not visible to end users
        i18nLabel: 'API Key',
    });

    // Select dropdown
    await configuration.settings.provideSetting({
        id: 'log_level',
        type: SettingType.SELECT,
        defaultValue: 'info',
        required: true,
        public: true,
        i18nLabel: 'Log Level',
        values: [
            { key: 'debug', i18nLabel: 'Debug' },
            { key: 'info', i18nLabel: 'Info' },
            { key: 'warn', i18nLabel: 'Warning' },
            { key: 'error', i18nLabel: 'Error' },
        ],
    });

    // Number input
    await configuration.settings.provideSetting({
        id: 'max_retries',
        type: SettingType.NUMBER,
        defaultValue: 3,
        required: true,
        public: false,
        i18nLabel: 'Max Retries',
    });

    // Room picker
    await configuration.settings.provideSetting({
        id: 'target_room',
        type: SettingType.ROOM_PICK,
        defaultValue: '',
        required: true,
        public: false,
        i18nLabel: 'Target Room',
    });
}
```

---

## Reading Setting Values

```typescript
// Read your app's setting
const envReader = read.getEnvironmentReader();
const apiKey = await envReader.getSettings().getValueById('api_key');

// Read a server setting (only subset exposed)
const siteUrl = await envReader.getServerSettings().getValueById('Site_Url');
```

---

## ISetting Interface

```typescript
export interface ISetting {
    id: string;
    type: SettingType;
    required: boolean;
    public: boolean;
    hidden?: boolean;
    i18nLabel: string;
    i18nDescription?: string;
    i18nPlaceholder?: string;
    defaultValue?: any;
    values?: Array<{ key: string; i18nLabel: string }>;
    multiline?: boolean;         // For STRING type, render as textarea
    packageValue?: any;          // The current value
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the setting |
| `type` | `SettingType` | The setting type (determines UI) |
| `required` | `boolean` | Whether the setting must have a value |
| `public` | `boolean` | Whether visible to non-admin users |
| `hidden` | `boolean` | Hidden from settings UI |
| `i18nLabel` | `string` | Internationalization label key |
| `i18nDescription` | `string?` | Description text key |
| `i18nPlaceholder` | `string?` | Placeholder text key |
| `defaultValue` | `any` | Default value |
| `values` | `Array<{key, i18nLabel}>?` | Options for SELECT/MULTI_SELECT |
| `multiline` | `boolean?` | For STRING, render as textarea |
| `packageValue` | `any` | Current value of the setting |
