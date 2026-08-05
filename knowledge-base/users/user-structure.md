# User Structure

## Purpose

`IUser` is the fundamental user representation used across the entire App-Engine SDK. Every message sender, room creator, slash command invoker, and API caller is represented as an IUser.

---

## Overview

The `IUser` interface represents a Rocket.Chat user — whether human, bot, app, or unknown (livechat guest). It carries identity fields (id, username, name, emails), status fields (online/away/busy/offline/invisible), role information, timestamps, and extension points (customFields, settings).

App users (bots) are created automatically when your App is installed. Their username follows the pattern `{app-name-slug}.bot`. You can access your App's own bot user via `read.getUserReader().getAppUser()`.

---

## When To Use

- Reading the sender of a message → `message.sender`
- Reading the creator of a room → `room.creator`
- Getting the invoking user in a slash command → `context.getSender()`
- Getting the authenticated user in an API endpoint → `request.user`
- Checking if a user is a bot → `user.type === UserType.BOT`
- Checking if a user is an app → `user.type === UserType.APP`
- Checking if a user is an unknown/livechat guest → `user.type === UserType.UNKNOWN`
- Checking permissions → `user.roles.includes('admin')`
- Accessing custom profile fields → `user.customFields?.department`
- Getting a user by ID or username → `read.getUserReader().getById()` / `getByUsername()`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IUser` | Full user object | `id`, `username`, `name`, `emails`, `type`, `roles`, `status`, `statusConnection` |
| `UserType` | Enum | `APP`, `USER`, `BOT`, `UNKNOWN` |
| `UserStatusConnection` | Enum | `ONLINE`, `AWAY`, `BUSY`, `OFFLINE`, `INVISIBLE`, `UNDEFINED` |
| `IUserEmail` | Email record | `address: string` |
| `IUserSettings` | User preferences | `preferences: Record<string, unknown>` |
| `IUserLookup` | Lightweight reference | `_id: string`, `username: string` |

---

## IUser Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique user ID |
| `username` | `string` | Yes | Display username (unique) |
| `emails` | `Array<IUserEmail>` | Yes | Registered email addresses |
| `type` | `UserType` | Yes | `APP`, `USER`, `BOT`, or `UNKNOWN` |
| `isEnabled` | `boolean` | Yes | Whether the account is active |
| `name` | `string` | Yes | Full display name |
| `roles` | `Array<string>` | Yes | Role IDs (e.g. `"admin"`, `"user"`, `"livechat-agent"`) |
| `status` | `string` | Yes | Presence status |
| `statusConnection` | `UserStatusConnection` | Yes | Connection state |
| `utcOffset` | `number` | Yes | UTC offset in hours |
| `createdAt` | `Date` | Yes | Account creation date |
| `updatedAt` | `Date` | Yes | Last update date |
| `lastLoginAt` | `Date` | Yes | Last login timestamp |
| `bio` | `string` | No | User biography |
| `statusText` | `string` | No | Custom status message |
| `statusDefault` | `string` | No | Default status |
| `statusSource` | `'internal' \| 'external' \| 'manual'` | No | Status source |
| `statusExpiresAt` | `Date` | No | Status expiry |
| `statusId` | `string` | No | Status record ID |
| `settings` | `IUserSettings` | No | User preferences |
| `appId` | `string` | No | For bots/apps: the App that created this user |
| `sipExtension` | `string` | No | SIP phone extension |
| `customFields` | `{ [key: string]: any }` | No | Custom profile fields |
| `isFederated` | `boolean` | No | Is a federated user |
| `federation` | `FederationLookup` | No | Federation metadata |

---

## UserType Enum

| Value | Alias | Description |
|-------|-------|-------------|
| `APP` | `'app'` | A Rocket.Chat App user (bot user created at install time) |
| `USER` | `'user'` | A regular human user |
| `BOT` | `'bot'` | A special bot user |
| `UNKNOWN` | `'unknown'` | Typically a livechat guest |

---

## UserStatusConnection Enum

| Value | Alias | Description |
|-------|-------|-------------|
| `ONLINE` | `'online'` | User is connected and active |
| `AWAY` | `'away'` | User is connected but idle |
| `BUSY` | `'busy'` | User has set DND mode |
| `OFFLINE` | `'offline'` | User is disconnected |
| `INVISIBLE` | `'invisible'` | User is connected but appears offline |
| `UNDEFINED` | `'undefined'` | Special state for livechat users and rocket.cat |

---

## Typical Workflow

### 1. Getting the App's Bot User

```typescript
const appUser = await read.getUserReader().getAppUser();
console.log(appUser.username); // "my-app.bot"
```

### 2. Reading a User by ID

```typescript
const user = await read.getUserReader().getById('someUserId');
if (user) {
    console.log(user.name);
}
```

### 3. Checking Permissions

```typescript
if (message.sender.roles.includes('admin')) {
    // Perform admin-only action
}
```

### 4. Identifying Bots and Apps

```typescript
import { UserType } from '@rocket.chat/apps-engine/definition/users';

if (user.type === UserType.BOT) {
    // This is a bot account
}

if (user.type === UserType.APP) {
    // This is the App's own bot user
}
```

### 5. Checking Presence via statusConnection

```typescript
import { UserStatusConnection } from '@rocket.chat/apps-engine/definition/users';

if (user.statusConnection === UserStatusConnection.ONLINE) {
    // User is currently online
}

if (user.statusConnection === UserStatusConnection.UNDEFINED) {
    // Likely a livechat visitor or system user (rocket.cat)
}
```

---

## Example

```typescript
import { IHttp, IModify, IRead, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser, UserType } from '@rocket.chat/apps-engine/definition/users';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

async function handleCommand(
    context: SlashCommandContext,
    read: IRead,
    modify: IModify
): Promise<void> {
    const sender: IUser = context.getSender();
    const room = context.getRoom();

    // Skip processing if sender is a bot or app (prevent loops)
    if (sender.type === UserType.BOT || sender.type === UserType.APP) {
        return;
    }

    // Check if sender is an admin
    if (!sender.roles.includes('admin')) {
        const appUser = await read.getUserReader().getAppUser();
        await modify.getNotifier().notifyUser(sender, {
            text: 'You must be an admin to use this command.',
            room: room,
            sender: appUser,
        } as any);
        return;
    }

    // Access a custom field
    const department = sender.customFields?.department;

    const messageBuilder = modify.getCreator().startMessage()
        .setRoom(room)
        .setText(`Hello ${sender.name}! Your department is: ${department || 'not set'}`);

    await modify.getCreator().finish(messageBuilder);
}
```

---

## Best Practices

- **Use `read.getUserReader().getAppUser()`** instead of the deprecated `this.getAppUserUsername()`.
- **Check `user.type` for multiple bot-like types** — both `UserType.BOT` and `UserType.APP` represent non-human users. Use both to prevent infinite loops.
- **Use `user.statusConnection` for presence checks** — more reliable than `user.status` alone. Covers `ONLINE`, `AWAY`, `BUSY`, `OFFLINE`, `INVISIBLE`, and `UNDEFINED`.
- **Use `user.roles`** for permission checks; don't hardcode user IDs.
- **Handle `null` from `getById()`** — the user might not exist.
- **Use `customFields`** for app-specific user metadata rather than external databases.

---

## Common Mistakes

- **Comparing `UserType` as strings** → Use `UserType.APP`, `UserType.USER`, `UserType.BOT`, `UserType.UNKNOWN` constants.
- **Assuming `getById()` always returns a user** → Always check for `null`.
- **Only checking `UserType.BOT` in event handlers** → Also check `UserType.APP` to avoid processing the App's own user.
- **Ignoring `statusConnection.UNDEFINED`** → This is normal for livechat visitors and system users like `rocket.cat`.
- **Modifying user data** → IUser is read-only from the Read accessor. Use `modify.getUpdater()` for updates.

---

## Related Topics

- [User Emails & Settings](./user-emails-settings.md)
- [User Event Handlers](./user-handlers.md)
- [User Reader](../accessors/user-reader.md)
- [User Builder](../accessors/user-builder.md)
- [Slash Command Context](../commands/slash-command-context.md)
