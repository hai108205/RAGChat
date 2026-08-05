# IUserRead Accessor

## Purpose

`IUserRead` provides read-only access to Rocket.Chat users. It supports querying by ID, username, SIP extension, and retrieving your App's own bot user. It also exposes helper methods for reading unread message counts and user room memberships.

---

## Overview

Access it via `read.getUserReader()`:

```typescript
const userReader = read.getUserReader();
```

All methods return Promises. Most query methods return `IUser | undefined` or `null` when the user does not exist — always handle the missing case.

---

## Methods

### getById(id: string): Promise\<IUser\>

Fetches a user by their Rocket.Chat user ID. Throws if not found (does **not** return `undefined`).

```typescript
const user = await read.getUserReader().getById('someUserId');
console.log(user.username);        // e.g. "john.doe"
console.log(user.name);            // e.g. "John Doe"
console.log(user.type);            // UserType.USER
console.log(user.roles);           // e.g. ["user", "admin"]
```

### getByUsername(username: string): Promise\<IUser\>

Fetches a user by their username. Throws if not found.

```typescript
const user = await read.getUserReader().getByUsername('john.doe');
```

### getAppUser(appId?: string): Promise\<IUser | undefined\>

Returns your App's own bot user. This is the user identity your App uses to send messages, join rooms, and interact with the system. The optional `appId` parameter is rarely needed — omit it to get the current App's user.

```typescript
const appUser = await read.getUserReader().getAppUser();
if (!appUser) {
    throw new Error('App user not found');
}
// Use appUser as the sender in messages
const msgBuilder = modify.getCreator().startMessage()
    .setSender(appUser);
```

The app user has:
- `type` = `UserType.APP`
- `roles` typically include `"app"` and `"bot"`
- `isEnabled` = true (once installed)

### getBySipExtension(extension: string): Promise\<IUser | undefined\>

Fetches a user by their SIP/telephony extension number. Returns `undefined` when no user matches.

```typescript
const user = await read.getUserReader().getBySipExtension('101');
if (!user) {
    console.log('No user with that SIP extension');
}
```

### getUserUnreadMessageCount(uid: string): Promise\<number | undefined\>

Returns the number of unread messages for a given user ID. Returns `undefined` if the user is not found.

```typescript
const unreadCount = await read.getUserReader().getUserUnreadMessageCount('someUserId');
if (unreadCount !== undefined) {
    console.log(`${unreadCount} unread messages`);
}
```

### getUserRoomIds(userId: string): Promise\<string[]\>

Returns an array of room IDs that the user is a member of. Returns an empty array (not `undefined`) if the user has no memberships.

```typescript
const roomIds = await read.getUserReader().getUserRoomIds('someUserId');
console.log(`${roomIds.length} rooms`);
for (const roomId of roomIds) {
    const room = await read.getRoomReader().getById(roomId);
}
```

---

## Typical Workflow

1. Receive `read: IRead` in a lifecycle hook or event handler
2. Call `read.getUserReader()` to get the `IUserRead` instance
3. Use the appropriate query method
4. Check for `null`/`undefined` before using the result
5. All methods return Promises — always `await`

---

## Example

```typescript
import {
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

async function onMessageSent(
    message: IMessage,
    read: IRead,
    modify: IModify
): Promise<void> {
    const userReader = read.getUserReader();
    const roomReader = read.getRoomReader();

    // 1. Get the app user (your bot)
    const appUser = await userReader.getAppUser();
    if (!appUser) {
        return;
    }

    // 2. Get the message sender
    const sender = await userReader.getById(message.sender.id);

    // 3. Get a user by username (with error handling)
    try {
        const target = await userReader.getByUsername('support-agent');
        // Send them a notification
        await modify.getNotifier().notifyUser(target, {
            text: `New message from ${sender.username}`,
            sender: appUser,
            room: message.room,
        } as any);
    } catch {
        console.log('support-agent not found');
    }

    // 4. Check unread counts
    const unread = await userReader.getUserUnreadMessageCount(sender.id);

    // 5. Get user's rooms
    const userRoomIds = await userReader.getUserRoomIds(sender.id);
}
```

---

## Best Practices

- **Always check for `undefined`** on methods that return `IUser | undefined` (`getAppUser`, `getBySipExtension`).
- **Wrap `getById` and `getByUsername`** in try/catch — they throw when the user does not exist.
- **Use `getAppUser()` as sender** — this is your App's identity for sending messages.
- **Cache `getAppUser()` result** — the app user does not change; call it once and reuse.
- **Combine with `getRoomReader()`** — use `getUserRoomIds()` then resolve each room via the room reader.

---

## Common Mistakes

- **Assuming `getAppUser()` always succeeds** → Returns `undefined` if the App is not fully installed.
- **Not catching throws from `getById`/`getByUsername`** → These throw, not return null.
- **Iterating `getUserRoomIds()` without batching** → Many apps iterate with individual `getById` calls; consider `Promise.all` for batching.
- **Using user ID when username is needed** → Distinguish between `getById` (technical ID) and `getByUsername` (human-readable).

---

## Related Topics

- [IUser Builder](./user-builder.md)
- [User Structure](../users/user-structure.md)
- [IRead Accessor](./i-read-accessor.md)
- [IModify Accessor](./i-modify-accessor.md)
- [Room Reader](./room-reader.md)
