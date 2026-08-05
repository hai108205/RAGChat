# IUserBuilder Accessor

## Purpose

`IUserBuilder` is a fluent builder for constructing new bot users in Rocket.Chat. It provides chained setter methods for username, display name, emails, and data payloads, and the final `getUser()` method to retrieve the assembled payload.

---

## Overview

The builder is created via `modify.getCreator().startBotUser()` and saved via `modify.getCreator().finish(builder)`. The complete lifecycle is:

```
startBotUser() -> chain setter methods -> finish(builder) -> returns userId
```

The builder exposes a `kind` property (`RocketChatAssociationModel.USER`) identifying the record as a user record for persistence association purposes.

---

## Interface

| Property / Method | Signature | Returns | Purpose |
|---|---|---|---|
| `kind` | (property) | `RocketChatAssociationModel.USER` | Identifies this as a user record |
| `setData()` | `(user: Partial<IUser>)` | `IUserBuilder` | Bulk-set user fields (id will be ignored) |
| `setUsername()` | `(username: string)` | `IUserBuilder` | Set the unique username |
| `getUsername()` | `()` | `string` | Get the currently set username |
| `setDisplayName()` | `(name: string)` | `IUserBuilder` | Set the display/human-readable name |
| `getDisplayName()` | `()` | `string` | Get the currently set display name |
| `setEmails()` | `(emails: Array<IUserEmail>)` | `IUserBuilder` | Set the array of email objects |
| `getEmails()` | `()` | `Array<IUserEmail>` | Get the currently set emails |
| `getUser()` | `()` | `Partial<IUser>` | Assemble and return the user payload |

---

## IUserEmail Structure

```typescript
interface IUserEmail {
    address: string;   // e.g. "bot@app.io"
    verified: boolean; // should be true for programmatic users
}
```

---

## Creation Flow

### Step 1: Start the Builder

```typescript
const builder = modify.getCreator().startBotUser();
```

### Step 2 (Optional): Pass Initial Data

You can pass a `Partial<IBotUser>` directly to `startBotUser()`:

```typescript
const builder = modify.getCreator().startBotUser({
    username: 'my-bot',
    name: 'My Bot',
    type: UserType.BOT,
    isEnabled: true,
});
```

Or use `setData()` afterward:

```typescript
builder.setData({
    username: 'my-bot',
    name: 'My Bot',
    type: UserType.BOT,
});
```

> **Note:** `IBotUser` extends `Omit<IUser, 'emails'>` — you cannot set emails via `setData({ ... })` because `emails` is omitted from the type. Use `setEmails()` separately.

### Step 3: Chain Setter Methods

```typescript
builder
    .setUsername('my-bot')
    .setDisplayName('My Bot')
    .setEmails([{ address: 'bot@app.io', verified: true }]);
```

### Step 4: Finish and Save

```typescript
const userId = await modify.getCreator().finish(builder);
console.log(`Created user with ID: ${userId}`);
```

---

## Typical Workflow

1. Receive `modify: IModify` in a lifecycle hook or event handler
2. Call `modify.getCreator().startBotUser()` (optionally with `Partial<IBotUser>`)
3. Chain `.setUsername()`, `.setDisplayName()`, `.setEmails()` as needed
4. Call `await modify.getCreator().finish(builder)` to persist
5. Optionally, call `builder.getUser()` to inspect the payload before finishing
6. Receive the new user's ID from `finish()`

---

## Full Example: Creating a Bot User

```typescript
import {
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { UserType } from '@rocket.chat/apps-engine/definition/users';

async function createSupportBot(
    read: IRead,
    modify: IModify
): Promise<string> {
    const userReader = read.getUserReader();

    // 1. Make sure the app user exists (your App must be installed)
    const appUser = await userReader.getAppUser();
    if (!appUser) {
        throw new Error('App user not found — install the App first');
    }

    // 2. Start building the bot user
    const builder = modify.getCreator().startBotUser({
        type: UserType.BOT,
        isEnabled: true,
        roles: ['user', 'livechat-agent'],
    });

    // 3. Chain required fields
    builder
        .setUsername('support-bot')
        .setDisplayName('Support Bot')
        .setEmails([{ address: 'support@myapp.com', verified: true }]);

    // 4. Persist to the database
    const newUserId = await modify.getCreator().finish(builder);

    console.log(`Support bot created: ${newUserId}`);
    return newUserId;
}
```

---

## Using setData() for Bulk Assignment

```typescript
builder.setData({
    username: 'audit-bot',
    name: 'Audit Bot',
    type: UserType.BOT,
    isEnabled: true,
    roles: ['user'],
    bio: 'Automated audit trail bot',
    statusText: 'Auditing...',
});
```

Fields that can be set via `setData()`:
- `name`, `username`, `type`, `isEnabled`, `roles`, `bio`
- `statusText`, `utcOffset`, `statusDefault`, `customFields`
- `appId` (rarely needed; usually auto-assigned)

Fields excluded from `setData()`:
- `emails` — use `setEmails()` separately (omitted by `IBotUser`)
- `id` — explicitly ignored by the engine

---

## Inspecting the Builder State

```typescript
const builder = modify.getCreator().startBotUser()
    .setUsername('temp-user')
    .setDisplayName('Temporary User');

console.log(builder.getUsername());    // "temp-user"
console.log(builder.getDisplayName()); // "Temporary User"

const payload = builder.getUser();
// { username: 'temp-user', name: 'Temporary User' }
```

---

## Best Practices

- **Use `startBotUser()` not `startUser()`** — There is no `startUser()`. All user creation goes through `startBotUser()`.
- **Username and email must be unique** — The engine rejects duplicate usernames or email addresses.
- **Set emails separately** — `IBotUser` omits `emails`, so use `setEmails()`.
- **Set `isEnabled: true`** — Bots are disabled by default unless explicitly enabled.
- **Handle permission errors** — The App needs the `user.create` permission.
- **Chain methods** — The fluent interface returns `IUserBuilder` for chaining; every setter is chainable.

---

## Common Mistakes

- **Forgetting `await finish()`** → The builder is in-memory only; nothing persists until `finish()`.
- **Passing `emails` inside `setData()`** → TypeScript will block this (omitted by `IBotUser`); use `setEmails()`.
- **Duplicating username/email** → Rocket.Chat enforces uniqueness; wrap `finish()` in try/catch.
- **Assuming `finish()` creates an app user** → `startBotUser()` creates a **separate** bot user, not your App's identity. The App user is created at installation time.
- **Setting `id` via `setData()`** → The engine ignores `id`. The server generates one.

---

## Related Topics

- [User Reader](./user-reader.md)
- [User Structure](../users/user-structure.md)
- [IModify Accessor](./i-modify-accessor.md)
- [IRead Accessor](./i-read-accessor.md)
- [App Permissions](../app/app-permissions.md)
