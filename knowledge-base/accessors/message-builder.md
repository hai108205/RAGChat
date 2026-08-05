# IMessageBuilder

## Purpose

`IMessageBuilder` is a fluent builder interface for constructing Rocket.Chat messages before they are sent or updated. It enforces that a room and a sender are set, and provides chainable methods for text, attachments, blocks, avatars, aliases, threading, custom fields, and URL parsing.

---

## Overview

`IMessageBuilder` is created via `modify.getCreator().startMessage()`. Every setter returns `IMessageBuilder` itself, enabling the method-chaining pattern:

```
startMessage() -> setRoom() -> setSender() -> setText() -> finish()
```

The builder validates constraints at `finish()` time — if room or sender is missing, the operation fails. Once `finish()` is called, the message is persisted and the method returns the new message ID.

For updating existing messages, use `setUpdateData()` with an editor user, then pass the builder to `modify.getUpdater().getMessageUpdater().update()`.

---

## When To Use

- Sending a new message → `startMessage()` with `setRoom()`, `setSender()`, `setText()` then `finish()`
- Sending a threaded reply → chain `setThreadId()` before `finish()`
- Sending a message with attachments → use `addAttachment()` or `setAttachments()`
- Sending a message with UI Kit blocks → use `addBlocks()` or `setBlocks()`
- Sending a message with a custom avatar/alias → use `setAvatarUrl()` / `setUsernameAlias()`
- Updating an existing message → `setUpdateData()` then use the updater
- Adding custom metadata → `addCustomField()`

---

## Important Methods

### Core Building

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `setData` | `message: IMessage` | `IMessageBuilder` | Set all message data at once (id is ignored) |
| `setUpdateData` | `message: IMessage, editor: IUser` | `IMessageBuilder` | Set data for updating an existing message |
| `setRoom` | `room: IRoom` | `IMessageBuilder` | Set the target room (required) |
| `setSender` | `sender: IUser` | `IMessageBuilder` | Set the message sender (required) |
| `setText` | `text: string` | `IMessageBuilder` | Set the message body text |
| `getMessage` | - | `IMessage` | Get the built message object before finish |

### Threading

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `setThreadId` | `threadId: string` | `IMessageBuilder` | Attach this message to a thread |
| `getThreadId` | - | `string` | Retrieve the current thread ID |

### Appearance

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `setEmojiAvatar` | `emoji: string` | `IMessageBuilder` | Set an emoji as the avatar (overrides user avatar and avatar URL) |
| `setAvatarUrl` | `avatarUrl: string` | `IMessageBuilder` | Set a custom avatar image URL (overrides user avatar) |
| `setUsernameAlias` | `alias: string` | `IMessageBuilder` | Set a display name override for the sender |
| `setGroupable` | `groupable: boolean` | `IMessageBuilder` | Control whether this message groups with adjacent messages |
| `setParseUrls` | `parseUrls: boolean` | `IMessageBuilder` | Enable/disable URL preview generation |

### Attachments

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `addAttachment` | `attachment: IMessageAttachment` | `IMessageBuilder` | Append one attachment |
| `setAttachments` | `attachments: Array<IMessageAttachment>` | `IMessageBuilder` | Replace all attachments |
| `getAttachments` | - | `Array<IMessageAttachment>` | Get the current attachments |
| `replaceAttachment` | `position: number, attachment: IMessageAttachment` | `IMessageBuilder` | Replace attachment at index |
| `removeAttachment` | `position: number` | `IMessageBuilder` | Remove attachment at index |

### Blocks (UI Kit)

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `addBlocks` | `blocks: BlockBuilder \| Array<IBlock \| LayoutBlock>` | `IMessageBuilder` | Append UI Kit blocks |
| `setBlocks` | `blocks: BlockBuilder \| Array<IBlock \| LayoutBlock>` | `IMessageBuilder` | Replace all UI Kit blocks |
| `getBlocks` | - | `Array<IBlock \| LayoutBlock>` | Get current UI Kit blocks |

### Metadata

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `addCustomField` | `key: string, value: any` | `IMessageBuilder` | Set a custom key-value pair (key must not contain `.`, must be unique) |
| `setEditor` | `user: IUser` | `IMessageBuilder` | Set the user editing this message (required for updates) |

---

## Builder Pattern

The builder follows a strict lifecycle:

```
1. startMessage()      — creates an empty builder
2. .setRoom()          — (required) target room
3. .setSender()        — (required) who the message appears from
4. .setText()          — (optional) body text
5. .setThreadId()      — (optional) threading
6. .addAttachment()    — (optional) attachments
7. .addBlocks()        — (optional) UI Kit blocks
8. .addCustomField()   — (optional) metadata
9. finish(builder)     — persists and returns the message ID
```

Calling `getMessage()` before `finish()` returns the in-memory object without persisting — useful for inspection or passing to another builder. Calling `finish()` after a failed validation (missing room/sender) throws an error.

---

## Examples

### Sending a Simple Message

```typescript
import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function sendSimpleMessage(
    room: IRoom,
    text: string,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(text);

    const messageId = await modify.getCreator().finish(builder);
    return messageId;
}
```

### Threaded Reply

```typescript
async function sendThreadedReply(
    room: IRoom,
    parentMessageId: string,
    text: string,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(text)
        .setThreadId(parentMessageId);

    return await modify.getCreator().finish(builder);
}
```

### Message with Attachments and Custom Avatar

```typescript
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';

async function sendRichMessage(
    room: IRoom,
    text: string,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const attachment: IMessageAttachment = {
        title: { value: 'Important Report' },
        text: 'The Q3 results are now available.',
        color: '#00ff00',
    };

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(text)
        .setAvatarUrl('https://example.com/bot-avatar.png')
        .setUsernameAlias('Report Bot')
        .setParseUrls(true)
        .setGroupable(false)
        .addAttachment(attachment);

    return await modify.getCreator().finish(builder);
}
```

### Message with UI Kit Blocks

```typescript
import {
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/ui-kit';

async function sendBlockMessage(
    room: IRoom,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const blocks = new BlockBuilder();
    blocks.addSectionBlock({
        text: blocks.newMarkdownTextObject('**Poll:** What time works best?'),
    });
    blocks.addActionsBlock({
        elements: [
            blocks.newButtonElement({
                text: blocks.newPlainTextObject('10:00 AM'),
                value: '10am',
                actionId: 'poll-time-10am',
            }),
            blocks.newButtonElement({
                text: blocks.newPlainTextObject('2:00 PM'),
                value: '2pm',
                actionId: 'poll-time-2pm',
            }),
        ],
    });

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText('New poll created')
        .addBlocks(blocks);

    return await modify.getCreator().finish(builder);
}
```

### Updating an Existing Message

```typescript
async function updateMessage(
    messageId: string,
    newText: string,
    editor: IUser,
    read: IRead,
    modify: IModify,
): Promise<void> {
    const messageReader = read.getMessageReader();
    const existingMessage = await messageReader.getById(messageId);

    if (!existingMessage) {
        throw new Error(`Message ${messageId} not found`);
    }

    const builder = modify.getCreator().startMessage()
        .setUpdateData(existingMessage, editor)
        .setText(newText);

    await modify.getUpdater().getMessageUpdater().update(builder, editor);
}
```

---

## Best Practices

- **Always set room and sender first** — these are required; the builder will fail at `finish()` without them.
- **Use `read.getUserReader().getAppUser()` for the sender** — this ensures the message comes from your app's bot user.
- **Chain all methods before `finish()`** — The fluent API is designed for one-shot building.
- **Avoid reusing builders** — Create a new builder via `startMessage()` for each message.
- **Use `setGroupable(false)` for bot messages** — Prevents your app's messages from grouping with user messages, reducing confusion.
- **Prefer `addAttachment()` over `setAttachments()`** — Unless you need to replace all attachments, appending avoids accidental data loss.
- **Custom field keys must not contain periods** — The builder throws an error if the key includes `.`.

---

## Common Mistakes

- **Forgetting `setRoom()` or `setSender()`** → The builder validates at `finish()` and will throw.
- **Passing an `id` in `setData()`** → The `id` field is silently ignored; use `setUpdateData()` for updates.
- **Not calling `finish()`** → The message exists only in memory until `finish()` is called.
- **Confusing `setEmojiAvatar()` with `setAvatarUrl()`** → Setting one overwrites the other; decide which avatar style you want.
- **Adding a custom field with a duplicate key** → `addCustomField()` throws if the key already exists.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [IModifyCreator](./modify-creator.md)
- [IMessageRead Accessor](./message-reader.md)
- [Message Structure](../messages/message-structure.md)
