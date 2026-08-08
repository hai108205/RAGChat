# IModify Accessor

## Purpose

`IModify` is the write gateway to Rocket.Chat. It provides 10 specialized sub-modifiers for creating, updating, deleting, extending, and notifying.

---

## Overview

Where `IRead` reads data, `IModify` writes it. The 10 sub-modifiers cover:
- **Creation** — messages, rooms, users, livechat, uploads, video conferences
- **Update** — messages, users, rooms
- **Deletion** — messages, users
- **Extension** — modify messages/rooms before they're persisted
- **Notification** — send desktop/mobile notifications
- **UI** — open modals, contextual bars
- **Scheduling** — create one-time and recurring jobs
- **OAuth** — manage OAuth apps
- **Moderation** — report/delete messages

---

## When To Use

- Sending a message → `modify.getCreator().startMessage()...finish()`
- Creating a room → `modify.getCreator().startRoom()...finish()`
- Updating a user → `modify.getUpdater().getUserUpdater().updateById()`
- Deleting a message → `modify.getDeleter().getMessageDeleter().deleteById()`
- Extending a message before send → `modify.getExtender().getMessageExtender().extend()`
- Sending a notification → `modify.getNotifier().notifyUser()`
- Opening a modal → `modify.getUiController().openModalView()`
- Scheduling a job → `modify.getScheduler().scheduleOnce()`

---

## Important Interfaces

| Sub-Modifier | Accessor Method | Return Type | Purpose |
|-------------|----------------|-------------|---------|
| Creator | `getCreator()` | `IModifyCreator` | Build and create messages, rooms, users, livechat |
| Deleter | `getDeleter()` | `IModifyDeleter` | Delete messages and users |
| Extender | `getExtender()` | `IModifyExtender` | Extend/transform messages and rooms |
| Updater | `getUpdater()` | `IModifyUpdater` | Update messages, users, rooms |
| Notifier | `getNotifier()` | `INotifier` | Desktop/mobile notifications |
| UI Controller | `getUiController()` | `IUIController` | Open/update/close modals and contextual bars |
| Scheduler | `getScheduler()` | `ISchedulerModify` | Create and cancel scheduled jobs |
| OAuth Apps Modifier | `getOAuthAppsModifier()` | `IOAuthAppsModify` | Create/update OAuth app configs |
| Moderation Modifier | `getModerationModifier()` | `IModerationModify` | Moderate messages (report, delete) |

---

## Typical Workflow

### Sending a Message

```typescript
const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(appUser)
    .setText('Hello!');

await modify.getCreator().finish(builder);
```

### Notifying a User

```typescript
await modify.getNotifier().notifyUser(user, {
    text: 'You have a new notification',
    room: room,
    sender: appUser,
} as any);
```

### Opening a Modal

```typescript
const modalContext = /* from UIKit interaction context */;
const responder = modalContext.getInteractionResponder();
await responder.openModalViewResponse({
    title: newPlainTextObject('My Modal'),
    blocks: [...],
});
```

---

## Example

```typescript
import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function sendAlertToRoom(
    room: IRoom,
    alertText: string,
    read: IRead,
    modify: IModify
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();

    // Create and send a message
    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(alertText)
        .setParseUrls(true);

    const messageId = await modify.getCreator().finish(builder);

    // Notify all room members
    await modify.getNotifier().notifyRoom(room, {
        text: alertText,
        sender: appUser,
    } as any);
}
```

---

## Best Practices

- **Always set the sender** when creating messages — use `read.getUserReader().getAppUser()`.
- **Chain builder methods** — The fluent builder API is designed for method chaining.
- **Handle missing create permission** — Creating rooms/users may fail due to permissions.
- **Use `getUiController()` for UI interactions** — Not to be confused with sending messages.
- **Clean up scheduled jobs** — Use `getScheduler().cancelJob()` when jobs are no longer needed.

---

## Common Mistakes

- **Directly constructing domain objects** → Use the builder pattern via `getCreator()`.
- **Forgetting to `await finish()`** → The builder doesn't send until `finish()` is called.
- **Confusing notifier with message sender** → `getNotifier()` sends push notifications, not chat messages.
- **Using `IModify` when `IRead` would suffice** → Improper use may trigger unnecessary permissions.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [Modify Creator](./modify-creator.md)
- [Modify Updater](./modify-updater.md)
- [Modify Deleter](./modify-deleter.md)
- [Modify Extender](./modify-extender.md)
- [Message Builder](./message-builder.md)
