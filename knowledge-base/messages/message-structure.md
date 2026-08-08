# Message Structure

## Purpose

`IMessage` is the core message data structure in the App-Engine SDK. Every message in Rocket.Chat — whether user-typed or app-generated — is represented as an `IMessage` object.

---

## Overview

A message contains text, optional rich attachments, optional UI Kit interactive blocks, files, emoji reactions, and metadata (pinned, starred, threadId). Messages belong to a room and have a sender.

The `MessageType` union type distinguishes regular user messages from system messages (room name changed, user joined, message pinned, livechat events, etc.).

Apps interact with messages through:
- **IRead.getMessageReader()** — to read existing messages
- **IModify.getCreator().startMessage()** — to build and send messages
- **IModify.getUpdater()** — to update messages
- **Message event handlers** — to hook into the message lifecycle

---

## When To Use

- Reading the text of a message → `message.text`
- Checking the sender → `message.sender`
- Getting the room → `message.room`
- Adding rich attachments → `message.attachments`
- Adding UI Kit interactive blocks → `message.blocks`
- Checking if a message is in a thread → `message.threadId`
- Checking reactions → `message.reactions`
- Determining message type → `message.type`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IMessage` | Core message structure | `text`, `room`, `sender`, `attachments`, `blocks`, `files`, `reactions` |
| `MessageType` | Union type (string literals) | `'uj'`, `'ul'`, `'r'`, `'message_pinned'`, `'livechat-close'`, etc. |
| `IMessageAttachment` | Rich attachment | `title`, `text`, `imageUrl`, `color`, `fields` |
| `IMessageFile` | File attachment | `name`, `url`, `type`, `size` |
| `IMessageReactions` | Reactions map | `{ [emoji]: { usernames: string[] } }` |

---

## IMessage Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | No | Auto-assigned on send |
| `threadId` | `string` | No | Parent thread message ID |
| `room` | `IRoom` | **Yes** | Room this message belongs to |
| `sender` | `IUser` | **Yes** | User who sent the message |
| `text` | `string` | No | Plain text content |
| `createdAt` | `Date` | No | Creation timestamp |
| `updatedAt` | `Date` | No | Last edit timestamp |
| `editor` | `IUser` | No | Last editor |
| `editedAt` | `Date` | No | When last edited |
| `emoji` | `string` | No | Custom emoji avatar |
| `avatarUrl` | `string` | No | Custom avatar URL |
| `alias` | `string` | No | Display alias (bot name override) |
| `file` | `IMessageFile` | No | **Deprecated** — use `files` |
| `files` | `Array<IMessageFile>` | No | Multiple file attachments |
| `attachments` | `Array<IMessageAttachment>` | No | Rich attachments (cards, images) |
| `reactions` | `IMessageReactions` | No | Emoji reactions |
| `groupable` | `boolean` | No | Can be visually grouped |
| `parseUrls` | `boolean` | No | Auto-linkify URLs |
| `customFields` | `{ [key: string]: any }` | No | App-specific metadata |
| `blocks` | `Array<IBlock \| LayoutBlock>` | No | UI Kit interactive blocks |
| `starred` | `Array<{ _id: string }>` | No | Users who starred |
| `pinned` | `boolean` | No | Is pinned |
| `pinnedAt` | `Date` | No | When pinned |
| `pinnedBy` | `IUserLookup` | No | Who pinned |
| `type` | `MessageType` | No | Message type |

---

## MessageType (Union Type)

| Value | Description |
|-------|-------------|
| `'uj'` | User joined a room |
| `'ul'` | User left a room |
| `'ru'` | User was removed |
| `'au'` | User was added |
| `'ui'` | User was invited |
| `'uir'` | User rejected invitation |
| `'ut'` | User joined a conversation |
| `'wm'` | Welcome message |
| `'rm'` | Message was removed |
| `'r'` | Room name was changed |
| `'room-archived'` | Room was archived |
| `'room-unarchived'` | Room was unarchived |
| `'room_changed_privacy'` | Room privacy changed |
| `'room_changed_description'` | Room description changed |
| `'room_changed_announcement'` | Room announcement changed |
| `'room_changed_avatar'` | Room avatar changed |
| `'room_changed_topic'` | Room topic changed |
| `'room_e2e_enabled'` | E2E encryption enabled in room |
| `'room_e2e_disabled'` | E2E encryption disabled in room |
| `'room-removed-read-only'` | Room no longer read-only |
| `'room-set-read-only'` | Room set to read-only |
| `'room-allowed-reacting'` | Room allowed reactions |
| `'room-disallowed-reacting'` | Room disallowed reactions |
| `'message_pinned'` | Message was pinned |
| `'message_pinned_e2e'` | E2E message was pinned |
| `'discussion-created'` | Discussion was created |
| `'user-muted'` | User was muted |
| `'user-unmuted'` | User was unmuted |
| `'mute_unmute'` | System messages muted/unmuted |
| `'subscription-role-added'` | Subscription role added |
| `'subscription-role-removed'` | Subscription role removed |
| `'new-moderator'` | New moderator added |
| `'moderator-removed'` | Moderator removed |
| `'new-owner'` | New owner added |
| `'owner-removed'` | Owner removed |
| `'new-leader'` | New leader added |
| `'leader-removed'` | Leader removed |
| `'removed-user-from-team'` | User removed from main team room |
| `'added-user-to-team'` | User added to a team |
| `'ult'` | User left a team |
| `'ujt'` | User joined a team |
| `'user-converted-to-team'` | Room converted to team |
| `'user-converted-to-channel'` | Room converted to channel |
| `'user-removed-room-from-team'` | Room removed from team |
| `'user-deleted-room-from-team'` | Room deleted from team |
| `'user-added-room-to-team'` | Room added to team |
| `'livechat-close'` | Livechat conversation closed |
| `'livechat-started'` | Livechat conversation started |
| `'livechat_navigation_history'` | Livechat navigation history |
| `'livechat_transfer_history'` | Conversation transferred |
| `'livechat_transcript_history'` | Transcript requested |
| `'livechat_video_call'` | Video call requested |
| `'livechat_transfer_history_fallback'` | Livechat transfer history fallback |
| `'omnichannel_priority_change_history'` | Omnichannel priority changed |
| `'omnichannel_sla_change_history'` | Omnichannel SLA changed |
| `'omnichannel_placed_chat_on_hold'` | Chat placed on hold |
| `'omnichannel_on_hold_chat_resumed'` | Chat resumed from hold |
| `'e2e'` | E2E encrypted message |
| `'command'` | System command message |
| `'videoconf'` | Video conference start |
| `'user_key_refreshed_successfully'` | User key refreshed successfully |
| `'abac-removed-user-from-room'` | ABAC user removed from room |

> **Note**: `MessageType` is a **union type of string literals**, not an enum. Normal user messages typically omit the `type` property entirely.

---

## Typical Workflow

### 1. Sending a Simple Message

```typescript
const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(appUser)
    .setText('Hello, world!');

await modify.getCreator().finish(builder);
```

### 2. Sending a Message with Attachments

```typescript
const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setText('Check out this data:')
    .addAttachment({
        color: '#ff0000',
        title: { value: 'Important Alert' },
        text: 'Something requires your attention',
        fields: [
            { title: 'Priority', value: 'High', short: true },
            { title: 'Status', value: 'Open', short: true },
        ],
    });

await modify.getCreator().finish(builder);
```

### 3. Reading Messages from a Room

```typescript
const messageReader = read.getMessageReader();
const messages = await messageReader.getByRoom(room.id, { limit: 10 });
```

---

## Example

```typescript
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function replyToUserMessage(
    originalMessage: any,
    responseText: string,
    read: IRead,
    modify: IModify
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    const room = originalMessage.room as IRoom;

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(responseText);

    // If the original is in a thread, reply in the same thread
    if (originalMessage.threadId) {
        builder.setThreadId(originalMessage.threadId);
    }

    // If the original has an alias, use it
    if (originalMessage.alias) {
        builder.setAlias(originalMessage.alias);
    }

    await modify.getCreator().finish(builder);
}
```

---

## Best Practices

- **Use `message.text` for plain text content**, `message.attachments` for rich content, and `message.blocks` for interactive UI.
- **Set `parseUrls: true`** to auto-linkify URLs in your message text.
- **Use `alias` and `avatarUrl`** to customize your bot's appearance per message.
- **Respect `threadId`** — when replying to a threaded message, set the threadId.
- **Use `customFields`** for app-specific metadata rather than parsing the message text.
- **Prefer `files` over the deprecated `file` property**.

---

## Common Mistakes

- **Not setting `sender`** when building a message → Use `read.getUserReader().getAppUser()`.
- **Forgetting to set `room`** on the message builder → Every message needs a room.
- **Using `message.file`** (singular, deprecated) → Use `message.files` (array).
- **Assuming `message.text` is always set** → Messages with only attachments may have no text.
- **Creating circular message loops** → Check `sender.type === UserType.BOT` to avoid responding to your own messages.

---

## Related Topics

- [Message Attachments](./message-attachments.md)
- [Message Files](./message-files.md)
- [Message Reactions](./message-reactions.md)
- [Message Actions](./message-actions.md)
- [Message Event Handlers](./message-handlers.md)
- [Message Reader](../accessors/message-reader.md)
- [Message Builder](../accessors/message-builder.md)
