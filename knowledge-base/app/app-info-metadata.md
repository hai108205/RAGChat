# App Information & Metadata

## Purpose

`IAppInfo` and `IAppAuthorInfo` define the identity and metadata of a Rocket.Chat App. These are loaded from the `app.json` manifest at install time and passed to the App constructor as `info`.

---

## Overview

Every Rocket.Chat App has an `app.json` manifest that declares its identity: ID, name, version, description, author, required API version, icon, and permissions. This manifest is parsed by Rocket.Chat into an `IAppInfo` object and injected into the App's constructor.

The `IApp` interface defines the read-only access methods that the App class implements — `getName()`, `getID()`, `getVersion()`, etc.

---

## When To Use

- Accessing the app's own metadata in code → `this.getName()`, `this.getInfo()`
- Getting the app's logger → `this.getLogger()`
- Getting the app's accessors → `this.getAccessors()`
- Checking the app's current status → `this.getStatus()`
- Defining the manifest → write `app.json`

---

## IAppInfo Interface

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Marketplace UUID |
| `name` | `string` | Human-readable app name |
| `nameSlug` | `string` | URL-safe slug (auto-generated from name) |
| `version` | `string` | Semantic version |
| `description` | `string` | Marketplace listing description |
| `requiredApiVersion` | `string` | Minimum Apps-Engine API version (e.g. `">=1.0.0"`) |
| `author` | `IAppAuthorInfo` | Author details |
| `classFile` | `string` | Main TypeScript file (e.g. `"MyApp.ts"`) |
| `iconFile` | `string` | App icon filename |
| `documentationUrl` | `string` (optional) | Documentation URL |
| `support` | `string` (optional) | Support URL or email |

---

## IAppAuthorInfo Interface

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Author or company name |
| `homepage` | `string` | Author website URL |
| `support` | `string` | Support contact (email or URL) |

---

## IApp Interface

The `App` abstract class implements `IApp`. All methods are read-only accessors:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getName()` | `string` | App display name |
| `getNameSlug()` | `string` | URL-safe slug |
| `getID()` | `string` | App UUID |
| `getVersion()` | `string` | Semver version |
| `getDescription()` | `string` | App description |
| `getRequiredApiVersion()` | `string` | Required API version |
| `getAuthorInfo()` | `IAppAuthorInfo` | Author metadata |
| `getInfo()` | `IAppInfo` | Full info object |
| `getLogger()` | `ILogger` | Logger instance |
| `getAccessors()` | `IAppAccessors` | Accessor bundle (throws if not initialized) |
| `getStatus()` | `Promise<AppStatus>` | Current lifecycle status |
| `getAppUserUsername()` | `string` | **Deprecated** — Use `read.getUserReader().getAppUser()` |

---

## AppStatus Enum

| Status | Value | Meaning |
|--------|-------|---------|
| `UNKNOWN` | `'unknown'` | Status not yet determined |
| `CONSTRUCTED` | `'constructed'` | Constructor has run |
| `INITIALIZED` | `'initialized'` | `initialize()` completed |
| `AUTO_ENABLED` | `'auto_enabled'` | Enabled automatically after init |
| `MANUALLY_ENABLED` | `'manually_enabled'` | Enabled by admin |
| `COMPILER_ERROR_DISABLED` | `'compiler_error_disabled'` | Disabled due to compilation error |
| `INVALID_LICENSE_DISABLED` | `'invalid_license_disabled'` | Disabled due to license issue |
| `INVALID_INSTALLATION_DISABLED` | `'invalid_installation_disabled'` | Disabled due to installation issue |
| `ERROR_DISABLED` | `'error_disabled'` | Disabled due to runtime error |
| `MANUALLY_DISABLED` | `'manually_disabled'` | Disabled by admin |
| `INVALID_SETTINGS_DISABLED` | `'invalid_settings_disabled'` | Disabled due to settings error |
| `DISABLED` | `'disabled'` | Generically disabled |

### AppStatusUtils

Singleton helper: `AppStatusUtils`

| Method | Returns `true` for |
|--------|-------------------|
| `isEnabled(status)` | `AUTO_ENABLED`, `MANUALLY_ENABLED` |
| `isDisabled(status)` | All `*DISABLED*` or `DISABLED` variants |
| `isError(status)` | `ERROR_DISABLED`, `COMPILER_ERROR_DISABLED` |

```typescript
import { AppStatusUtils } from '@rocket.chat/apps-engine/definition/AppStatus';

if (AppStatusUtils.isEnabled(await this.getStatus())) {
    // App is running
}
```

---

## Typical Workflow

### 1. Accessing App Metadata

```typescript
const name = this.getName();           // "My App"
const id = this.getID();               // "uuid-from-marketplace"
const version = this.getVersion();     // "1.0.0"
const author = this.getAuthorInfo();   // { name: "...", homepage: "...", support: "..." }
```

### 2. Using the Logger

```typescript
const logger = this.getLogger();
logger.info('App is starting up');
logger.debug({ msg: 'Processing request', userId: someUser.id });
logger.error('Something went wrong', error);
```

### 3. Getting Accessors

```typescript
try {
    const accessors = this.getAccessors();
    const envReader = accessors.environmentReader;
} catch (error) {
    // Accessors not available yet (e.g., during early construction)
}
```

---

## Example: app.json Manifest

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "GitHub Notifier",
    "nameSlug": "github-notifier",
    "version": "1.0.0",
    "description": "Sends GitHub repository notifications to Rocket.Chat channels",
    "requiredApiVersion": ">=1.0.0",
    "author": {
        "name": "Dev Team Inc.",
        "homepage": "https://devteam.example.com",
        "support": "support@devteam.example.com"
    },
    "classFile": "GitHubNotifierApp.ts",
    "iconFile": "icon.png",
    "documentationUrl": "https://docs.devteam.example.com/github-notifier",
    "permissions": [
        { "name": "user.read" },
        { "name": "message.write" }
    ]
}
```

---

## Best Practices

- **Use semantic versioning** — Follow semver for your App version.
- **Write a meaningful `description`** — It appears in the marketplace listing.
- **Set `requiredApiVersion` accurately** — Use the minimum API version your App actually needs.
- **Provide `documentationUrl`** — Help administrators understand your App.
- **Use `AppStatusUtils` for status checks** — Never compare `AppStatus` values as raw strings.
- **Use `this.getLogger()` everywhere** — Structured logging helps debugging in production.

---

## Common Mistakes

- **Comparing status as strings** → `status === 'auto_enabled'` is fragile. Use `AppStatusUtils.isEnabled(status)`.
- **Using `getAppUserUsername()`** → Deprecated. Use `read.getUserReader().getAppUser()` instead.
- **Calling `getAccessors()` too early** → May throw `'Accessors not initialized'` during construction.
- **Forgetting to update `version`** → The marketplace and update mechanism depend on it.

---

## Related Topics

- [App Lifecycle](./app-lifecycle.md)
- [App Permissions](./app-permissions.md)
- [App Configuration](./app-configuration.md)
- [App Logging](./app-logging.md)
