# Modify Extender

## Purpose

`IModifyExtender` transforms objects **non-destructively** before they're persisted. Unlike the Updater which can change any field, the Extender only **adds** properties — `customFields`, `attachments`, and metadata. It cannot modify existing values.

---

## Overview

`IModifyExtender` is accessed via `modify.getExtender()`. It is designed for the **extend pattern**: intercept a message or room before it reaches the database, add custom data, and return it. This is commonly used in `IPreMessageSentPrevent` / `IPreMessageSentExtend` hooks.

The key distinction from `IModifyUpdater`:
- **Extender** — Append-only. Adds `customFields`, extra `attachments`. Cannot change `text`, `sender`, `room`, etc.
- **Updater** — Full write. Can change any property including `text`, `sender`, roles.

---

## When To Use

- Adding custom fields to every outgoing message → `extendMessage()`
- Appending attachments (e.g. a signature image) to messages → `extendMessage()`
- Adding custom fields to rooms on creation → `extendRoom()`
- Tagging messages with app metadata without altering user content → `extendMessage()`

---

## Important Methods

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `extendMessage(messageId, updater)` | `Promise<IMessageExtender>` | Get an extender for a message |
| `extendRoom(roomId, updater)` | `Promise<IRoomExtender>` | Get an extender for a room |
| `extendVideoConference(id)` | `Promise<IVideoConferenceExtender>` | Get an extender for a video conference |
| `finish(extender)` | `Promise<void>` | Persist the extended data |

---

## The Extend Pattern

The extend pattern flows like this:

1. A message/room is about to be persisted
2. The app's hook fires (e.g. `executePreMessageSentExtend`)
3. The app calls `extendMessage()` or `extendRoom()` to get an extender
4. The app adds `customFields`, `attachments`
5. The app calls `finish(extender)`
6. Rocket.Chat merges the extensions into the object before persisting

This is **in-flight modification** — the object hasn't hit the database yet.

```text
User sends message
  → PreMessageSentExtend hook fires
    → App extends message with customFields
    → finish(extender)
  → Message persists with extensions
```

---

## Typical Workflows

### Extending a Message with Custom Fields

```typescript
import {
    IPreMessageSentExtend,
    IHttp,
    IMessageExtender,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';

class MyAppExtender implements IPreMessageSentExtend {
    public async executePreMessageSentExtend(
        message: IMessage,
        extend: IMessageExtender,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        // Add a custom field
        extend.addCustomField('source', 'app-enriched');
        extend.addCustomField('processedAt', new Date().toISOString());

        return extend.getMessage();
    }
}
```

Note: When using the hook-style extender (`IPreMessageSentExtend`), the extender is provided directly. When using the accessor, use `modify.getExtender()`.

### Extending a Message via Accessor

```typescript
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function extendMessage(
    messageId: string,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();

    const extender = await modify.getExtender().extendMessage(messageId, appUser);

    extender.addCustomField('flagged', true);
    extender.addCustomField('reviewedBy', appUser.username);

    await modify.getExtender().finish(extender);
}
```

### Extending a Message with Attachments

```typescript
async function appendSignature(
    messageId: string,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();

    const extender = await modify.getExtender().extendMessage(messageId, appUser);

    extender.addAttachment({
        color: '#00ff00',
        text: '--\nSent via MyApp',
        timestamp: new Date(),
    });

    await modify.getExtender().finish(extender);
}
```

### Extending a Room

```typescript
async function extendRoom(
    roomId: string,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();

    const extender = await modify.getExtender().extendRoom(roomId, appUser);

    extender.addCustomField('department', 'engineering');
    extender.addCustomField('priority', 'high');

    await modify.getExtender().finish(extender);
}
```

---

## Extender vs Updater

| | Extender (`IModifyExtender`) | Updater (`IModifyUpdater`) |
|---|---|---|
| Timing | Before persist (in-flight) | After persist (existing object) |
| Mutability | Add-only | Full read/write |
| Use case | Enrich with metadata | Modify content |
| Hook context | `IPreMessageSentExtend` | `IPostMessageSent` or command handlers |
| Can change text? | No | Yes |
| Can change sender? | No | Yes |
| Can add customFields? | Yes | Yes |
| Can add attachments? | Yes | Yes |

---

## Best Practices

- **Use Extender for tagging/metadata** — It is the safest way to add data without altering user content.
- **Prefer Extender over Updater for enrichment** — Extender runs before persist; no race conditions.
- **Do not try to modify `text`, `sender`, `room`** — The extender will ignore these or throw.
- **`finish()` is required** — Extensions are not applied until `finish()` is called.
- **Use `IPreMessageSentExtend` for automatic enrichment** — The hook fires on every message without manual intervention.

---

## Common Mistakes

- **Trying to change `message.text` via extender** → Extender is add-only. Use `IModifyUpdater` for content edits.
- **Forgetting to call `finish()`** → Extensions are silently discarded.
- **Using extender for post-persist modifications** → The object is already in the database. Use Updater instead.
- **Assuming extender validates custom fields** → Custom fields are arbitrary key-value pairs; no schema enforcement.
- **Confusing `IUser` with user ID** → The `updater` parameter expects an `IUser` object, not a string.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [Modify Creator](./modify-creator.md)
- [Modify Updater](./modify-updater.md)
- [Modify Deleter](./modify-deleter.md)
