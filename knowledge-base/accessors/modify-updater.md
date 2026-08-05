# Modify Updater

## Purpose

`IModifyUpdater` updates existing Rocket.Chat objects. Unlike the Creator which builds from scratch, the Updater modifies objects already in the database — messages, users, rooms, and livechat entities.

---

## Overview

`IModifyUpdater` is accessed via `modify.getUpdater()`. It provides two patterns:

- **Domain-specific updaters** — `getMessageUpdater()`, `getUserUpdater()`, `getLivechatUpdater()` — return focused updater objects with targeted methods.
- **Builder-based updates** — `message(messageId, updater)` and `room(roomId, updater)` — return a builder pre-populated with the existing object. Modify and then `finish(builder)`.

All update operations throw if the target record does not exist.

---

## When To Use

- Editing message text or attachments → `getMessageUpdater()` or `message()`
- Changing user roles or custom fields → `getUserUpdater()`
- Modifying room properties (name, topic, type) → `room()`
- Updating livechat visitor/department data → `getLivechatUpdater()`

---

## Important Methods

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `getMessageUpdater()` | `IMessageUpdater` | Update messages by ID |
| `getUserUpdater()` | `IUserUpdater` | Update users by ID |
| `getLivechatUpdater()` | `ILivechatUpdater` | Update livechat visitors/departments |
| `message(messageId, updater)` | `Promise<IMessageBuilder>` | Get a pre-populated message builder for editing |
| `room(roomId, updater)` | `Promise<IRoomBuilder>` | Get a pre-populated room builder for editing |
| `finish(builder)` | `Promise<void>` | Persist the builder changes |

---

## Typical Workflows

### Updating a Message via Builder

```typescript
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function editMessage(messageId: string, newText: string, read: IRead, modify: IModify) {
    const appUser = await read.getUserReader().getAppUser();

    // Get a builder pre-populated with the existing message
    const builder = await modify.getUpdater().message(messageId, appUser);

    // Modify and persist
    builder.setText(newText);
    builder.setEditor(appUser);

    await modify.getUpdater().finish(builder);
}
```

Throws an error if `messageId` does not exist.

### Updating a Message via MessageUpdater

```typescript
async function updateMessageCustomFields(
    messageId: string,
    customFields: Record<string, any>,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();
    const messageUpdater = modify.getUpdater().getMessageUpdater();

    await messageUpdater.updateById(messageId, { customFields });

    // Or use the overload that accepts the message object
    // await messageUpdater.updateMessage(message, { customFields });
}
```

### Updating User Roles

```typescript
async function addRoleToUser(
    userId: string,
    roleName: string,
    read: IRead,
    modify: IModify,
) {
    const userUpdater = modify.getUpdater().getUserUpdater();

    await userUpdater.updateById(userId, {
        roles: [roleName],
    });
}
```

### Updating a Room

```typescript
async function renameRoom(roomId: string, newName: string, read: IRead, modify: IModify) {
    const appUser = await read.getUserReader().getAppUser();

    const builder = await modify.getUpdater().room(roomId, appUser);
    builder.setName(newName);

    await modify.getUpdater().finish(builder);
}
```

### Updating Livechat

```typescript
async function updateVisitor(
    token: string,
    data: { name?: string; email?: string },
    modify: IModify,
) {
    const livechatUpdater = modify.getUpdater().getLivechatUpdater();

    await livechatUpdater.updateVisitorByToken(token, data);
}
```

---

## Best Practices

- **Use builder-based updates for complex changes** — `message()` and `room()` return builders that preserve existing state.
- **Use domain updaters for targeted fields** — `getMessageUpdater().updateById()` for quick property changes.
- **Always provide the updater user** — The second parameter to `message()` and `room()` tracks who made the change.
- **Wrap in try/catch** — Updates throw on non-existent records.
- **Prefer `updateById()` over `updateMessage()`** — When you only have the ID, avoid an extra read.

---

## Common Mistakes

- **Forgetting `await` on `message()` / `room()`** — These return `Promise<IBuilder>`, not the builder directly.
- **Calling `finish()` without modifying anything** — A no-op but wastes resources.
- **Providing a non-existent ID** → Throws an error. Validate existence with `IRead` first if needed.
- **Confusing updater with creator** → The Updater modifies existing objects; the Creator builds new ones.
- **Omitting the updater user** → Required to track modification authorship.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [Modify Creator](./modify-creator.md)
- [Modify Deleter](./modify-deleter.md)
- [Modify Extender](./modify-extender.md)
