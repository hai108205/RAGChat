# IEnvironmentRead Accessor

## Purpose

`IEnvironmentRead` provides read-only access to the App's runtime configuration: the App's own settings, a limited subset of Rocket.Chat server settings, and a limited subset of environment variables. It is the single entry point for all environment configuration reads in an App.

---

## Overview

`IEnvironmentRead` is returned by `read.getEnvironmentReader()` and exposes three sub-readers:

- **`getSettings()` → `ISettingRead`** — Read the App's own declared settings (from `app.json` / `App.settings`)
- **`getServerSettings()` → `IServerSettingRead`** — Read a curated subset of Rocket.Chat server settings (security-limited)
- **`getEnvironmentVariables()` → `IEnvironmentalVariableRead`** — Read environment variables (security-limited subset)

For security reasons, Apps cannot access all server settings or environment variables — only those explicitly exposed by Rocket.Chat.

---

## When To Use

- Reading an App setting value to control behavior → `getSettings().getValueById()`
- Checking if a server feature is enabled (e.g., file upload) → `getServerSettings().getValueById()`
- Accessing environment-specific configuration → `getEnvironmentVariables().getValueByName()`
- Validating configuration before performing operations
- Feature-gating based on server configuration

---

## Important Interfaces

### IEnvironmentRead

| Method | Returns | Purpose |
|--------|---------|---------|
| `getSettings()` | `ISettingRead` | Read the App's own settings |
| `getServerSettings()` | `IServerSettingRead` | Read exposed server settings |
| `getEnvironmentVariables()` | `IEnvironmentalVariableRead` | Read exposed environment variables |

### ISettingRead — App Settings Reader

| Method | Signature | Description |
|--------|-----------|-------------|
| `getById` | `(id: string): Promise<ISetting>` | Get the full setting object by ID. Returns `undefined` if not found (does not throw). |
| `getValueById` | `(id: string): Promise<any>` | Get the setting's value by ID. Throws if the setting does not exist. |

### IServerSettingRead — Server Settings Reader

| Method | Signature | Description |
|--------|-----------|-------------|
| `getOneById` | `(id: string): Promise<ISetting>` | Get a server setting by ID. Throws if not found or not exposed. |
| `getValueById` | `(id: string): Promise<any>` | Get a server setting's value by ID. Throws if not found or not exposed. |
| `getAll` | `(): Promise<IterableIterator<ISetting>>` | Get all exposed server settings as an iterator. |
| `isReadableById` | `(id: string): Promise<boolean>` | Check if a server setting is accessible. Returns `false` instead of throwing. |

### IEnvironmentalVariableRead — Environment Variable Reader

| Method | Signature | Description |
|--------|-----------|-------------|
| `getValueByName` | `(envVarName: string): Promise<string>` | Get the value of an environment variable. |
| `isReadable` | `(envVarName: string): Promise<boolean>` | Check if the App can access a given variable name. |
| `isSet` | `(envVarName: string): Promise<boolean>` | Check if a value is set for the given variable name. |

---

## Typical Workflow

1. Receive `read: IRead` in a lifecycle hook or event handler
2. Call `read.getEnvironmentReader()` to get the `IEnvironmentRead` instance
3. Get the appropriate sub-reader: `getSettings()`, `getServerSettings()`, or `getEnvironmentVariables()`
4. Use the sub-reader's methods to read values
5. Validate that the setting exists and has a usable value before acting on it

---

## Examples

### Reading an App Setting Value

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function processWithAppSetting(read: IRead): Promise<void> {
    const envReader = read.getEnvironmentReader();
    const settings = envReader.getSettings();

    try {
        // getValueById throws if the setting doesn't exist
        const greetingPrefix = await settings.getValueById('greeting-prefix');
        console.log(`Prefix: ${greetingPrefix}`);
    } catch (error) {
        console.error('Setting "greeting-prefix" is not defined');
        // Fall back to default
        const greetingPrefix = 'Hello';
    }

    // Alternative: safe check with getById (returns undefined if missing)
    const greetingSetting = await settings.getById('greeting-prefix');
    if (greetingSetting) {
        const value = greetingSetting.value;
        console.log(`Setting value: ${value}`);
    } else {
        console.log('Setting not found, using default');
    }
}
```

### Checking a Server Setting

```typescript
async function checkServerFeatures(read: IRead): Promise<void> {
    const serverSettings = read.getEnvironmentReader().getServerSettings();

    // Safe check: verify readability before attempting to read
    const settingId = 'FileUpload_Enabled';
    const isReadable = await serverSettings.isReadableById(settingId);

    if (!isReadable) {
        console.warn(`Setting "${settingId}" is not exposed to Apps`);
        return;
    }

    try {
        const fileUploadEnabled = await serverSettings.getValueById(settingId);
        if (fileUploadEnabled) {
            console.log('File upload is enabled on this server');
        } else {
            console.log('File upload is disabled');
        }
    } catch (error) {
        console.error(`Failed to read setting "${settingId}"`);
    }
}
```

### Reading an Environment Variable

```typescript
async function readApiEndpoint(read: IRead): Promise<string> {
    const envVars = read.getEnvironmentReader().getEnvironmentVariables();

    const varName = 'EXTERNAL_API_URL';

    // Check if the app can read this variable
    const isReadable = await envVars.isReadable(varName);
    if (!isReadable) {
        throw new Error(`Environment variable "${varName}" is not accessible`);
    }

    // Check if it has a value
    const isSet = await envVars.isSet(varName);
    if (!isSet) {
        throw new Error(`Environment variable "${varName}" is not set`);
    }

    const apiUrl = await envVars.getValueByName(varName);
    return apiUrl;
}
```

### Full Example: Validating Config Before Operation

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function getWebhookConfig(read: IRead): Promise<{ url: string; secret: string }> {
    const envReader = read.getEnvironmentReader();
    const settings = envReader.getSettings();

    // Read from app settings
    const webhookUrl = await settings.getValueById('webhook-url');
    const webhookSecret = await settings.getValueById('webhook-secret');

    if (!webhookUrl) {
        throw new Error('App setting "webhook-url" is required but not configured');
    }

    if (!webhookSecret) {
        throw new Error('App setting "webhook-secret" is required but not configured');
    }

    return { url: webhookUrl as string, secret: webhookSecret as string };
}
```

---

## Best Practices

- **Validate settings before using them** — App settings are user-configured. Never assume a value exists or is valid.
- **Use `isReadableById()` before `getValueById()`** — For server settings, check readability first to avoid unexpected errors.
- **Use `isSet()` before `getValueByName()`** — For environment variables, confirm they have values before reading.
- **Handle missing values gracefully** — Provide sensible defaults when a setting is not configured.
- **Use `getById()` (not `getValueById()`) when you need the full setting object** — Includes metadata like `type`, `packageValue`, and whether it was modified.
- **Cache setting values if read frequently** — Environment reads are fast but repeated reads in a loop are wasteful.

---

## Common Mistakes

- **Assuming all server settings are accessible** → Only a curated subset of server settings is exposed to Apps. Use `isReadableById()` to check.
- **Assuming environment variables are always available** → Only specific variables are exposed. Check with `isReadable()` and `isSet()`.
- **Using `getValueById()` without try-catch** → This method throws if the setting doesn't exist. Use `getById()` for a non-throwing alternative.
- **Using `getSettings()` instead of `getServerSettings()`** → `getSettings()` reads the App's own settings, not the server's. The two are completely separate.
- **Reading environment variables without checking** → Calling `getValueByName()` on an unexposed variable will fail. Always check `isReadable()` first.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [App Settings Definition](../settings/setting-definition.md)
- [IModify Accessor](./i-modify-accessor.md)
- [App Lifecycle](../app/app-lifecycle.md)
