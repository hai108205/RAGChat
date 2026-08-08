# Message Event Handlers

Reference for all message-related event handler interfaces in the Rocket.Chat Apps Engine. Each interface corresponds to an `AppMethod` enum value and has a single handler method (plus an optional `check*` guard).

---

## Handler Lifecycle Pattern

Every handler follows a two-phase lifecycle:

1. **`check*`** (optional) — Gate method. Receives `(message, read, http)`. Returns `Promise<boolean>`. When it returns `false`, the framework skips the `execute*` method for this handler instance. Use this to filter by room type, user role, message content, etc.
2. **`execute*`** (required) — Action method. Receives the full context: `(message, read, http, persistence, ...extras)`. This is where your logic runs.

The execution order across multiple handlers of the same type is: Prevent -> Extend -> Modify -> Post.

---

## Group: Prevent Handlers

Prevent handlers run *before* an action. Return `true` to block the action, `false` to allow it.

### `IPreMessageSentPrevent`

- **Method**: `checkPreMessageSentPrevent?` / `executePreMessageSentPrevent`
- **Fires**: Before a message is sent, across all rooms and DM channels.
- **Can block**: Yes — return `true` to prevent the message from being sent.
- **Can modify**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreMessageSentPrevent } from "@rocket.chat/apps-engine/definition/messages";
import type { IMessage, IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class BlockProfanity implements IPreMessageSentPrevent {
    public async checkPreMessageSentPrevent(
        message: IMessage,
        read: IRead,
        http: IHttp,
    ): Promise<boolean> {
        // Only check public channels
        const room = await read.getRoomReader().getById(message.room.id);
        return room?.type === "c";
    }

    public async executePreMessageSentPrevent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<boolean> {
        const badWords = ["badword1", "badword2"];
        return badWords.some((word) => message.text?.includes(word));
    }
}
```

### `IPreMessageDeletePrevent`

- **Method**: `checkPreMessageDeletePrevent?` / `executePreMessageDeletePrevent`
- **Fires**: Before a message is deleted by any user.
- **Can block**: Yes — return `true` to prevent deletion.
- **Can modify**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreMessageDeletePrevent } from "@rocket.chat/apps-engine/definition/messages";
import type { IMessage, IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class ProtectPinnedMessages implements IPreMessageDeletePrevent {
    public async checkPreMessageDeletePrevent(
        message: IMessage,
        read: IRead,
        http: IHttp,
    ): Promise<boolean> {
        return message.pinned === true;
    }

    public async executePreMessageDeletePrevent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<boolean> {
        // Block deletion of pinned messages
        return true;
    }
}
```

### `IPreMessageUpdatedPrevent`

- **Method**: `checkPreMessageUpdatedPrevent?` / `executePreMessageUpdatedPrevent`
- **Fires**: Before a message is updated/edited.
- **Can block**: Yes — return `true` to prevent the update.
- **Can modify**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreMessageUpdatedPrevent } from "@rocket.chat/apps-engine/definition/messages";
import type { IMessage, IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class PreventEditAfterOneHour implements IPreMessageUpdatedPrevent {
    public async executePreMessageUpdatedPrevent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<boolean> {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const msgTime = message.createdAt ? new Date(message.createdAt).getTime() : 0;
        return msgTime < oneHourAgo;
    }
}
```

---

## Group: Extend Handlers

Extend handlers run *before* an action and can non-destructively attach extra data to the message (e.g. custom fields, attachments). They receive an `IMessageExtender` accessor.

### `IPreMessageSentExtend`

- **Method**: `checkPreMessageSentExtend?` / `executePreMessageSentExtend`
- **Fires**: Before a message is sent.
- **Can block**: No (unless you throw).
- **Can modify**: Yes — non-destructive enrichment via `IMessageExtender`.
- **Accessors**: `IMessageExtender`, `IRead`, `IHttp`, `IPersistence`
- **Returns**: `Promise<IMessage>`

```typescript
import { IPreMessageSentExtend } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IMessageExtender, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class AddCustomField implements IPreMessageSentExtend {
    public async executePreMessageSentExtend(
        message: IMessage,
        extend: IMessageExtender,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        return extend
            .addCustomField("source", "app-extension")
            .getMessage();
    }
}
```

### `IPreMessageUpdatedExtend`

- **Method**: `checkPreMessageUpdatedExtend?` / `executePreMessageUpdatedExtend`
- **Fires**: Before a message update is applied.
- **Can block**: No.
- **Can modify**: Yes — non-destructive enrichment via `IMessageExtender`.
- **Accessors**: `IMessageExtender`, `IRead`, `IHttp`, `IPersistence`
- **Returns**: `Promise<IMessage>`

```typescript
import { IPreMessageUpdatedExtend } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IMessageExtender, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class TagEditedMessages implements IPreMessageUpdatedExtend {
    public async executePreMessageUpdatedExtend(
        message: IMessage,
        extend: IMessageExtender,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        return extend
            .addCustomField("lastEditedBy", message.editedBy?._id || "unknown")
            .getMessage();
    }
}
```

---

## Group: Modify Handlers

Modify handlers run *before* an action and can destructively change the message content (text, attachments, etc.). They receive an `IMessageBuilder`.

### `IPreMessageSentModify`

- **Method**: `checkPreMessageSentModify?` / `executePreMessageSentModify`
- **Fires**: Before a message is sent.
- **Can block**: No (unless you throw).
- **Can modify**: Yes — destructive modification via `IMessageBuilder`.
- **Accessors**: `IMessageBuilder`, `IRead`, `IHttp`, `IPersistence`
- **Returns**: `Promise<IMessage>`

```typescript
import { IPreMessageSentModify } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IMessageBuilder, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class AutoCorrect implements IPreMessageSentModify {
    public async executePreMessageSentModify(
        message: IMessage,
        builder: IMessageBuilder,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        const corrected = (message.text || "")
            .replace(/\bteh\b/g, "the")
            .replace(/\brecieve\b/g, "receive");
        return builder.setText(corrected).getMessage();
    }
}
```

### `IPreMessageUpdatedModify`

- **Method**: `checkPreMessageUpdatedModify?` / `executePreMessageUpdatedModify`
- **Fires**: Before a message update is applied.
- **Can block**: No.
- **Can modify**: Yes — destructive modification via `IMessageBuilder`.
- **Accessors**: `IMessageBuilder`, `IRead`, `IHttp`, `IPersistence`
- **Returns**: `Promise<IMessage>`

```typescript
import { IPreMessageUpdatedModify } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IMessageBuilder, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class StripMarkdown implements IPreMessageUpdatedModify {
    public async executePreMessageUpdatedModify(
        message: IMessage,
        builder: IMessageBuilder,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        const stripped = (message.text || "").replace(/[*_~`]/g, "");
        return builder.setText(stripped).getMessage();
    }
}
```

---

## Group: Post-Message Sent Handlers

Post handlers run *after* an action has completed. They receive the final message and an `IModify` accessor to create new messages.

### `IPostMessageSent`

- **Method**: `checkPostMessageSent?` / `executePostMessageSent`
- **Fires**: After a regular message is sent to clients.
- **Can block**: No — action already happened.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify`
- **Returns**: `Promise<void>`

```typescript
import { IPostMessageSent } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IModify, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class LogSentMessages implements IPostMessageSent {
    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        console.log(`Message ${message.id} sent by ${message.sender.username}`);
    }
}
```

### `IPostSystemMessageSent`

- **Method**: `executePostSystemMessageSent` (no `check*` guard)
- **Fires**: After a system message (e.g. "User joined channel") is sent.
- **Can block**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify`
- **Returns**: `Promise<void>`

```typescript
import { IPostSystemMessageSent } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IModify, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class TrackSystemMessages implements IPostSystemMessageSent {
    public async executePostSystemMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        // React to system messages like user joins, room changes, etc.
        if (message.t === "uj") {
            console.log(`User joined room ${message.rid}`);
        }
    }
}
```

### `IPostMessageSentToBot`

- **Method**: `executePostMessageSentToBot` (no `check*` guard)
- **Fires**: After a direct message is sent that targets a bot user.
- **Can block**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify`
- **Returns**: `Promise<void>`

```typescript
import { IPostMessageSentToBot } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IModify, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class BotResponder implements IPostMessageSentToBot {
    public async executePostMessageSentToBot(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const response = modify
            .getCreator()
            .startMessage()
            .setSender(message.room)
            .setText(`Echo: ${message.text}`);
        await modify.getCreator().finish(response);
    }
}
```

---

## Group: Post-Message Deleted

### `IPostMessageDeleted`

- **Method**: `checkPostMessageDeleted?` / `executePostMessageDeleted`
- **Fires**: After a message is deleted.
- **Can block**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify`
- **Context**: `IMessageDeleteContext` — contains `message` (the deleted message) and `user` (who deleted it).
- **Returns**: `Promise<void>`

```typescript
import { IPostMessageDeleted } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IModify, IPersistence, IRead, IMessageDeleteContext,
} from "@rocket.chat/apps-engine/definition/accessors";

export class AuditDeletedMessages implements IPostMessageDeleted {
    public async executePostMessageDeleted(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
        context: IMessageDeleteContext,
    ): Promise<void> {
        console.log(
            `Message ${context.message.id} deleted by ${context.user.username}`
        );
    }
}
```

---

## Group: Post-Message Updated

### `IPostMessageUpdated`

- **Method**: `checkPostMessageUpdated?` / `executePostMessageUpdated`
- **Fires**: After a message edit is propagated to clients.
- **Can block**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify`
- **Returns**: `Promise<void>`

```typescript
import { IPostMessageUpdated } from "@rocket.chat/apps-engine/definition/messages";
import type {
    IMessage, IHttp, IModify, IPersistence, IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

export class NotifyOnEdit implements IPostMessageUpdated {
    public async executePostMessageUpdated(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const notifier = modify
            .getCreator()
            .startMessage()
            .setRoom(message.room)
            .setText(`A message was just edited in this room.`);
        await modify.getCreator().finish(notifier);
    }
}
```

---

## Group: Other Post Event Handlers

These handlers fire after various message interactions. All follow the same pattern: a single `execute*` method receiving a typed context object plus standard `IRead`, `IHttp`, `IPersistence`, `IModify` accessors.

### `IPostMessageReacted`

- **Fires**: After a reaction is added to or removed from a message.
- **Context**: `IMessageReactionContext` — `reaction` (emoji), `isReacted` (true=added, false=removed), `message`, `user`.

```typescript
import { IPostMessageReacted } from "@rocket.chat/apps-engine/definition/messages";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import type { IMessageReactionContext } from "@rocket.chat/apps-engine/definition/messages";

export class ReactionLogger implements IPostMessageReacted {
    public async executePostMessageReacted(
        context: IMessageReactionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const action = context.isReacted ? "added" : "removed";
        console.log(
            `${context.user.username} ${action} reaction :${context.reaction}: on msg ${context.message.id}`
        );
    }
}
```

### `IPostMessageFollowed`

- **Fires**: After a message is followed or unfollowed by a user.
- **Context**: `IMessageFollowContext` — `message`, `user`, `isFollowed`.

```typescript
import { IPostMessageFollowed } from "@rocket.chat/apps-engine/definition/messages";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import type { IMessageFollowContext } from "@rocket.chat/apps-engine/definition/messages";

export class FollowTracker implements IPostMessageFollowed {
    public async executePostMessageFollowed(
        context: IMessageFollowContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const action = context.isFollowed ? "started following" : "unfollowed";
        console.log(`${context.user.username} ${action} message ${context.message.id}`);
    }
}
```

### `IPostMessagePinned`

- **Fires**: After a message is pinned or unpinned.
- **Context**: `IMessagePinContext` — `message`, `user`, `isPinned`.

```typescript
import { IPostMessagePinned } from "@rocket.chat/apps-engine/definition/messages";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import type { IMessagePinContext } from "@rocket.chat/apps-engine/definition/messages";

export class PinNotifier implements IPostMessagePinned {
    public async executePostMessagePinned(
        context: IMessagePinContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const action = context.isPinned ? "pinned" : "unpinned";
        console.log(`${context.user.username} ${action} message ${context.message.id}`);
    }
}
```

### `IPostMessageStarred`

- **Fires**: After a message is starred or unstarred.
- **Context**: `IMessageStarContext` — `message`, `user`, `isStarred`.

```typescript
import { IPostMessageStarred } from "@rocket.chat/apps-engine/definition/messages";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import type { IMessageStarContext } from "@rocket.chat/apps-engine/definition/messages";

export class StarAudit implements IPostMessageStarred {
    public async executePostMessageStarred(
        context: IMessageStarContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const action = context.isStarred ? "starred" : "unstarred";
        console.log(`${context.user.username} ${action} message ${context.message.id}`);
    }
}
```

### `IPostMessageReported`

- **Fires**: After a message is reported by a user.
- **Context**: `IMessageReportContext` — `message`, `user`, `reason` (string).

```typescript
import { IPostMessageReported } from "@rocket.chat/apps-engine/definition/messages";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import type { IMessageReportContext } from "@rocket.chat/apps-engine/definition/messages";

export class ReportEscalator implements IPostMessageReported {
    public async executePostMessageReported(
        context: IMessageReportContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        console.log(
            `Message ${context.message.id} reported by ${context.user.username}: ${context.reason}`
        );
        // Forward to an external moderation service via http.post()
    }
}
```

---

## Execution Order Summary

For any message lifecycle event (send, update, delete), the framework dispatches handlers in this order:

```
1. Prevent handlers (IPre*Prevent)     → can block the action
2. Extend handlers  (IPre*Extend)      → non-destructive enrichment
3. Modify handlers  (IPre*Modify)      → destructive modification
4. Action executes (message sent/updated/deleted, reaction added, etc.)
5. Post handlers    (IPost*)           → read-only notification
```

Multiple apps can each have handlers for the same event. Within a single app, handlers of the same type run in registration order.

---

## Registration

In your app's main class, implement the interfaces and override the corresponding `extendConfiguration` property or register directly:

```typescript
import { App } from "@rocket.chat/apps-engine/definition/App";

export class MyMessageApp extends App {
    // The framework auto-discovers implemented interfaces.
    // Implement any of the interfaces above and the method
    // will be called automatically at the right time.
}
```

No explicit registration call is needed — implementing the interface is enough.
