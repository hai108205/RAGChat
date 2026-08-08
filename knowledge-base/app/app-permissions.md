# App Permissions

## Purpose

Rocket.Chat Apps run in a sandboxed environment. The `AppPermissions` system ensures apps can only access what they explicitly declare. Without the right permission, an API call fails at runtime.

---

## Overview

Permissions are declared in the app's `app.json` manifest file as an array of permission objects. Each permission grants access to a specific domain: reading users, sending messages, making HTTP requests, storing data, registering slash commands, etc.

The `AppPermissions` constant in `packages/apps-engine/src/definition/metadata/AppPermissions.ts` defines all available permissions. Use these constants — never hardcode permission name strings.

---

## When To Use

- Your app needs to read user data → add `AppPermissions.user.read` (`user.read`)
- Your app sends messages → add `AppPermissions.message.write` (`message.write`)
- Your app makes HTTP requests → add `AppPermissions.networking.default` (`networking`)
- Your app stores data → add `AppPermissions.persistence.default` (`persistence`)
- Your app registers slash commands → add `AppPermissions.command.default` (`slashcommand`)
- Your app opens modals → add `AppPermissions.ui.interaction` (`ui.interact`)
- Your app reads server settings → add `AppPermissions.setting.read` (`server-setting.read`)

---

## Important Interfaces

| Interface | Location | Role |
|-----------|----------|------|
| `IPermission` | `definition/permissions/IPermission.ts` | Base interface: `{ name: string; required?: boolean }` |
| `INetworkingPermission` | `definition/permissions/IPermission.ts` | Extends `IPermission` with `domains: Array<string>` |
| `IWorkspaceTokenPermission` | `definition/permissions/IPermission.ts` | Extends `IPermission` with `scopes: Array<string>` |
| `IReadSettingPermission` | `definition/permissions/IPermission.ts` | Extends `IPermission` with `hiddenSettings: Array<string>` |
| `AppPermissions` | `definition/metadata/AppPermissions.ts` | Static constants for all available permissions |

---

## Complete Permission List

### Users
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.user.read` | `user.read` | Read user profiles, emails, roles, status |
| `AppPermissions.user.write` | `user.write` | Create/update user accounts |

### Uploads
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.upload.read` | `upload.read` | Read uploaded files |
| `AppPermissions.upload.write` | `upload.write` | Upload files |

### Rooms
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.room.read` | `room.read` | Read room metadata, memberships |
| `AppPermissions.room.write` | `room.write` | Create rooms, modify room settings |
| `AppPermissions['room']['system-view-all']` | `room.system.view-all` | View all system rooms |

### Messages
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.message.read` | `message.read` | Read message history |
| `AppPermissions.message.write` | `message.write` | Send and update messages |

### Threads
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.threads.read` | `threads.read` | Read thread messages |

### Contacts
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.contact.read` | `contact.read` | Read contact information |
| `AppPermissions.contact.write` | `contact.write` | Create/update contacts |

### Livechat
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions['livechat-department'].read` | `livechat-department.read` | Read livechat departments |
| `AppPermissions['livechat-department'].write` | `livechat-department.write` | Create/update livechat departments |
| `AppPermissions['livechat-department'].multiple` | `livechat-department.multiple` | Access multiple livechat departments |
| `AppPermissions['livechat-room'].read` | `livechat-room.read` | Read livechat rooms |
| `AppPermissions['livechat-room'].write` | `livechat-room.write` | Create livechat rooms |
| `AppPermissions['livechat-message'].read` | `livechat-message.read` | Read livechat messages |
| `AppPermissions['livechat-message'].write` | `livechat-message.write` | Send livechat messages |
| `AppPermissions['livechat-message'].multiple` | `livechat-message.multiple` | Access multiple livechat messages |
| `AppPermissions['livechat-visitor'].read` | `livechat-visitor.read` | Read livechat visitors |
| `AppPermissions['livechat-visitor'].write` | `livechat-visitor.write` | Create/update livechat visitors |
| `AppPermissions['livechat-status'].read` | `livechat-status.read` | Read livechat status |
| `AppPermissions['livechat-custom-fields'].write` | `livechat-custom-fields.write` | Write livechat custom fields |

### Settings
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.setting.read` | `server-setting.read` | Read server settings (supports `hiddenSettings` array on `IReadSettingPermission`) |
| `AppPermissions.setting.write` | `server-setting.write` | Write server settings |

### Email
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.email.send` | `email.send` | Send emails |

### UI
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.ui.interaction` | `ui.interact` | Open modals, contextual bars, UI Kit interactions |
| `AppPermissions.ui.registerButtons` | `ui.registerButtons` | Register UI action buttons |

### Video Conference
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.videoConference.read` | `video-conference.read` | Read video conference data |
| `AppPermissions.videoConference.write` | `video-conference.write` | Create/update video conferences |
| `AppPermissions.videoConference.provider` | `video-conference-provider` | Register as a video conference provider |

### OAuth
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions['oauth-app'].read` | `oauth-app.read` | Read OAuth app configurations |
| `AppPermissions['oauth-app'].write` | `oauth-app.write` | Write OAuth app configurations |

### Environment & Cloud
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.env.read` | `env.read` | Read environment variables |
| `AppPermissions.cloud['workspace-token']` | `cloud.workspace-token` | Access workspace tokens (supports `scopes` array on `IWorkspaceTokenPermission`) |

### Core Features (Internal permissions)
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.networking.default` | `networking` | Make HTTP requests to external services (supports `domains` array on `INetworkingPermission`) |
| `AppPermissions.persistence.default` | `persistence` | Read/write app-specific persistent storage |
| `AppPermissions.command.default` | `slashcommand` | Register slash commands |
| `AppPermissions.apis.default` | `api` | Register API endpoints |
| `AppPermissions.scheduler.default` | `scheduler` | Register scheduled jobs |
| `AppPermissions['outboundComms'].provide` | `outbound-communication.provide` | Register outbound communication providers |

### Roles & Moderation
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.role.read` | `role.read` | Read role information |
| `AppPermissions.role.write` | `role.write` | Write role information |
| `AppPermissions.moderation.read` | `moderation.read` | Read moderation data |
| `AppPermissions.moderation.write` | `moderation.write` | Moderate messages (report, delete) |

### ABAC
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.abac.read` | `abac.read` | Read ABAC (Attribute-Based Access Control) data |

### Experimental
| Access Path | Permission String | Grants |
|-------------|------------------|--------|
| `AppPermissions.experimental.default` | `experimental.default` | Access experimental features |

---

## Default Permissions

Apps developed before the permission system was introduced receive all `defaultPermissions` automatically for backward compatibility. These cover the most common use cases:

- All `user`, `upload`, `room`, `message` read/write
- All livechat scopes (department, room, message, visitor, status, custom-fields) read/write
- `scheduler`, `networking`, `persistence`, `slashcommand`
- `ui.interact`, `env.read`, `server-setting.read/write`
- `video-conference-provider`, `video-conference.read/write`
- `api`

New apps should explicitly declare only the permissions they need.

---

## Typical Workflow

### 1. Determine Which Permissions Your App Needs

Go through each feature your app uses and map it to required permissions:

| Feature | Required Permission Constant |
|---------|---------------------------|
| Reading user profile | `AppPermissions.user.read` |
| Sending a message | `AppPermissions.message.write` |
| Calling an external API | `AppPermissions.networking.default` |
| Saving app data | `AppPermissions.persistence.default` |
| Registering a slash command | `AppPermissions.command.default` |
| Opening a modal | `AppPermissions.ui.interaction` |
| Registering API endpoints | `AppPermissions.apis.default` |
| Registering scheduled jobs | `AppPermissions.scheduler.default` |

### 2. Declare in app.json

```json
{
    "id": "my-app-id",
    "name": "My App",
    "permissions": [
        { "name": "user.read" },
        { "name": "message.write" },
        { "name": "networking" },
        { "name": "persistence" },
        { "name": "slashcommand" }
    ]
}
```

### 3. Permission Errors at Runtime

If your app calls an accessor method without the required permission, the call throws. The error message typically indicates which permission is missing.

---

## Specialized Permission Interfaces

Some permissions carry extra configuration beyond just a name:

### `networking` (INetworkingPermission)
```json
{
    "name": "networking",
    "domains": ["api.github.com", "*.example.com"]
}
```
Restricts HTTP requests to specific domains. An empty `domains` array allows all domains.

### `server-setting.read` (IReadSettingPermission)
```json
{
    "name": "server-setting.read",
    "hiddenSettings": ["LDAP_Bind_Password"]
}
```
Grants access to hidden/secure server settings. An empty `hiddenSettings` array grants access to no hidden settings.

### `cloud.workspace-token` (IWorkspaceTokenPermission)
```json
{
    "name": "cloud.workspace-token",
    "scopes": ["user:read", "workspace:admin"]
}
```
Restricts which OAuth scopes the workspace token can access.

---

## Example

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "GitHub Notifier",
    "nameSlug": "github-notifier",
    "version": "1.0.0",
    "description": "Sends GitHub notifications to Rocket.Chat",
    "requiredApiVersion": "^1.0.0",
    "author": {
        "name": "Your Company",
        "homepage": "https://example.com",
        "support": "support@example.com"
    },
    "classFile": "GitHubNotifierApp.ts",
    "iconFile": "icon.png",
    "permissions": [
        { "name": "user.read" },
        { "name": "room.read" },
        { "name": "message.write" },
        { "name": "networking" },
        { "name": "persistence" },
        { "name": "scheduler" }
    ]
}
```

---

## Best Practices

- **Request only the permissions you need** — principle of least privilege.
- **Use `AppPermissions` constants** in your code to reference permissions, not raw strings.
- **Document why each permission is needed** in your app's README.
- **Test with missing permissions** during development to ensure proper error messages.
- **Review permissions on each update** — remove any that are no longer needed.
- **Use domain restrictions** on `networking` to limit which external services your app can reach.
- **Declare `hiddenSettings` explicitly** if your app needs to read sensitive server settings.

---

## Common Mistakes

- **Forgetting `networking` when making HTTP requests** — all external HTTP calls require this.
- **Forgetting `persistence` when storing data** — storage calls fail or throw.
- **Using `ui.interact` without registration** — opening modals requires this permission.
- **Requesting too many permissions** — makes your app look suspicious to administrators.
- **Typos in permission names** — use the `AppPermissions` constants to avoid this.
- **Forgetting `api` when registering API endpoints** — your endpoints won't be exposed.
- **Omitting `scheduler` when using scheduled jobs** — job processors won't run.
- **Using raw string `'user.read'` instead of `AppPermissions.user.read`** in TypeScript code.

---

## Related Topics

- [App Information & Metadata](./app-info-metadata.md)
- [App Lifecycle](./app-lifecycle.md)
- [App Configuration](./app-configuration.md)
- [IRead Accessor](../accessors/i-read-accessor.md)
- [IModify Accessor](../accessors/i-modify-accessor.md)
- Source: `packages/apps-engine/src/definition/permissions/IPermission.ts`
- Source: `packages/apps-engine/src/definition/metadata/AppPermissions.ts`
