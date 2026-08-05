# Livechat Message

## Purpose

`ILivechatMessage` extends `IMessage` to represent a message within a livechat conversation. It adds a `visitor` reference and a `token` for identifying the visitor session.

---

## Overview

A livechat message is structurally identical to a regular `IMessage` -- it has text, a room, a sender, attachments, blocks, and reactions. The two livechat-specific additions are:

- **`visitor`**: The `IVisitor` object representing the customer. This is the same visitor as `room.visitor` on the parent `ILivechatRoom`. It is included on the message itself for convenience when processing messages outside the room context.
- **`token`**: The visitor's session token. This duplicates `visitor.token` and is included for rapid routing and identification without needing to traverse the full visitor object.

Livechat messages can be sent by either the visitor or the agent. When the visitor sends a message, `sender` will be an `IUser` with `UserType.UNKNOWN`. When the agent sends a message, `sender` will be a regular `IUser` (human or bot).

---

## When To Use

- Reading the visitor from a livechat message → `message.visitor`
- Identifying the visitor session → `message.token` or `message.visitor?.token`
- Checking if a message is from the visitor (vs. agent) → `message.sender.type === UserType.UNKNOWN`
- Processing livechat message events → `IPreMessageSentPrevent`, `IPostMessageSent` handlers

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `ILivechatMessage` | Livechat message (extends `IMessage`) | `visitor`, `token` |
| `IMessage` | Base message structure | `text`, `room`, `sender`, `attachments`, `blocks`, `files`, `reactions` |

---

## ILivechatMessage Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `visitor` | `IVisitor` | No | The visitor (customer) who is part of this conversation |
| `token` | `string` | No | The visitor's session token |

**Inherited from `IMessage`**: `id`, `threadId`, `room`, `sender`, `text`, `createdAt`, `updatedAt`, `editor`, `editedAt`, `emoji`, `avatarUrl`, `alias`, `files`, `attachments`, `reactions`, `groupable`, `parseUrls`, `customFields`, `blocks`, `starred`, `pinned`, `pinnedAt`, `pinnedBy`, `type`

---

## Differences from Regular IMessage

| Aspect | `IMessage` | `ILivechatMessage` |
|--------|------------|-------------------|
| Visitor info | Not available | `visitor?: IVisitor` and `token?: string` |
| Room type | Any `RoomType` | Always in a `RoomType.LIVE_CHAT` room |
| Sender | Any `IUser` type | Either `UserType.UNKNOWN` (visitor) or agent (`UserType.USER`/`UserType.BOT`) |
| System message types | `'uj'`, `'ul'`, `'message_pinned'`, etc. | Additionally: `'livechat-close'`, `'livechat-started'`, `'livechat_navigation_history'`, `'livechat_transfer_history'`, `'livechat_transcript_history'`, `'livechat_video_call'`, `'omnichannel_placed_chat_on_hold'`, `'omnichannel_on_hold_chat_resumed'` |

---

## Typical Workflow

### 1. Identifying Visitor Messages in a Livechat Room

```typescript
import { isLivechatRoom } from '@rocket.chat/apps-engine/definition/livechat';
import { UserType } from '@rocket.chat/apps-engine/definition/users';

function isVisitorMessage(message: ILivechatMessage): boolean {
    return message.sender.type === UserType.UNKNOWN;
}

// In a message handler:
if (isLivechatRoom(message.room)) {
    if (isVisitorMessage(message)) {
        console.log(`Visitor ${message.visitor?.name} said: ${message.text}`);
    } else {
        console.log(`Agent ${message.sender.username} said: ${message.text}`);
    }
}
```

### 2. Using the Token for Session Tracking

```typescript
// The token links messages to the same visitor session
const visitorToken = message.token;

// Same as:
const sameToken = message.visitor?.token === visitorToken;
```

### 3. Handling Livechat System Messages

```typescript
if (message.type === 'livechat-close') {
    // Conversation was closed
} else if (message.type === 'livechat_transfer_history') {
    // Conversation was transferred to another department/agent
} else if (message.type === 'omnichannel_placed_chat_on_hold') {
    // Chat was placed on hold
}
```

---

## Example

```typescript
import { ILivechatMessage, isLivechatRoom } from '@rocket.chat/apps-engine/definition/livechat';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { UserType } from '@rocket.chat/apps-engine/definition/users';

async function autoReplyToVisitor(
    message: IMessage,
    read: IRead,
    modify: IModify,
): Promise<void> {
    // Only handle livechat messages
    const livechatMsg = message as ILivechatMessage;
    if (!message.room || !isLivechatRoom(message.room)) {
        return;
    }

    // Only respond to visitor messages (not agent messages)
    if (message.sender.type !== UserType.UNKNOWN) {
        return;
    }

    // Avoid double-processing (check if already handled)
    if (!livechatMsg.visitor) {
        return;
    }

    const visitorName = livechatMsg.visitor.name;
    const visitorEmail = livechatMsg.visitor.visitorEmails?.[0]?.address;
    const visitorToken = livechatMsg.token;

    const appUser = await read.getUserReader().getAppUser();
    const builder = modify.getCreator().startMessage()
        .setRoom(livechatMsg.room)
        .setSender(appUser)
        .setText(
            `Thank you for your message, ${visitorName}! ` +
            `An agent will be with you shortly.`
        );

    await modify.getCreator().finish(builder);
}
```

---

## Best Practices

- **Check `UserType.UNKNOWN` to identify visitor messages** -- this distinguishes customer messages from agent messages.
- **Use `message.visitor?.token` for session identification** -- the `token` property on the message is a convenience; prefer the visitor's token for consistency.
- **Handle `null`/`undefined` for `visitor`** -- the property is optional and may not always be populated.
- **Respect livechat system message types** -- `'livechat-close'`, `'livechat-started'`, etc. have special semantics and should be filtered or handled appropriately.

---

## Common Mistakes

- **Assuming all messages in a livechat room are `ILivechatMessage`** -- system messages like `'uj'` (user joined) or `'livechat-started'` may be regular `IMessage` objects. Always narrow with type guards.
- **Forgetting the visitor vs. agent distinction** -- visitor messages have `sender.type === UserType.UNKNOWN`. Agent messages have `UserType.USER` or `UserType.BOT`. Processing both identically can cause loops.
- **Treating `message.visitor` as always populated** -- it is optional. Use `message.token` as a fallback or check for existence.
- **Confusing `message.token` with auth tokens** -- this is the visitor's session token, not a JWT or API token.

---

## Related Topics

- [Livechat Visitor](./livechat-visitor.md)
- [Livechat Room](./livechat-room.md)
- [Livechat Department](./livechat-department.md)
- [Message Structure](../messages/message-structure.md)
