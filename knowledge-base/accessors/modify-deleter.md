# Modify Deleter

## Purpose

`IModifyDeleter` removes objects from Rocket.Chat — messages, rooms, users, and room memberships. It is the simplest of the four modifier interfaces: each method performs a single destructive operation.

---

## Overview

`IModifyDeleter` is accessed via `modify.getDeleter()`. All methods return `Promise<void>` or `Promise<boolean>`. The interface is flat — no builders, no sub-deleters. Each delete operation is a direct method call.

---

## When To Use

- Deleting a message → `deleteMessage(message, user)`
- Deleting a room → `deleteRoom(roomId)`
- Deleting bot/app users → `deleteUsers(appId, userType)`
- Removing users from a room → `removeUsersFromRoom(roomId, usernames)`

---

## Important Methods

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `deleteMessage(message, user)` | `Promise<void>` | Delete a specific message |
| `deleteRoom(roomId)` | `Promise<void>` | Delete a room by ID |
| `deleteUsers(appId, userType)` | `Promise<boolean>` | Delete all users created by an app |
| `removeUsersFromRoom(roomId, usernames)` | `Promise<void>` | Remove users from a room by username |

---

## Typical Workflows

### Deleting a Message

```typescript
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

async function deleteMessage(
    message: IMessage,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();

    try {
        await modify.getDeleter().deleteMessage(message, appUser);
        console.log(`Message ${message.id} deleted`);
    } catch (error) {
        console.error(`Failed to delete message: ${error.message}`);
    }
}
```

### Deleting a Non-Existent Message (Error Handling)

```typescript
async function safeDeleteMessage(
    messageId: string,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();
    const messageReader = read.getMessageReader();

    const message = await messageReader.getById(messageId);

    if (!message) {
        console.warn(`Message ${messageId} not found — nothing to delete`);
        return;
    }

    try {
        await modify.getDeleter().deleteMessage(message, appUser);
    } catch (error) {
        console.error(`Delete failed: ${error.message}`);
    }
}
```

Always validate existence before deletion when the message may already be gone.

### Deleting a Room

```typescript
async function deleteRoom(roomId: string, modify: IModify) {
    try {
        await modify.getDeleter().deleteRoom(roomId);
        console.log(`Room ${roomId} deleted`);
    } catch (error) {
        console.error(`Failed to delete room: ${error.message}`);
    }
}
```

### Deleting App-Created Users

```typescript
import { UserType } from '@rocket.chat/apps-engine/definition/users';

async function cleanupAppUsers(modify: IModify) {
    const deleted = await modify.getDeleter().deleteUsers(
        'my-app-id',
        UserType.BOT,
    );

    console.log(`Bot users deleted: ${deleted}`);
}
```

`deleteUsers()` returns `true` if users were found and deleted, `false` otherwise. Only works with `UserType.APP` or `UserType.BOT`.

### Removing Users from a Room

```typescript
async function kickUsers(roomId: string, modify: IModify) {
    await modify.getDeleter().removeUsersFromRoom(roomId, [
        'spammer',
        'troll',
    ]);

    console.log('Users removed from room');
}
```

---

## Best Practices

- **Validate before deleting** — Use `IRead` to check existence of messages/rooms before calling delete.
- **Wrap in try/catch** — Deletion of non-existent items throws. Graceful error handling prevents app crashes.
- **Use `deleteUsers()` for cleanup** — When your app uninstalls, clean up bot users it created.
- **`removeUsersFromRoom()` takes usernames, not IDs** — Use the username string array.
- **Delete operations are irreversible** — Confirm intent before calling.

---

## Common Mistakes

- **Deleting a non-existent message** → Throws an error. Always check with `messageReader.getById()` first.
- **Passing user IDs to `removeUsersFromRoom()`** → Expects usernames (strings like `'john.doe'`).
- **Using `deleteUsers()` with invalid `userType`** → Only `UserType.APP` and `UserType.BOT` are accepted.
- **Assuming `deleteRoom()` works on any room** → Permission checks apply; the app may lack delete rights.
- **Forgetting to provide the `user` parameter to `deleteMessage()`** → Required for audit.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [Modify Creator](./modify-creator.md)
- [Modify Updater](./modify-updater.md)
- [Modify Extender](./modify-extender.md)
