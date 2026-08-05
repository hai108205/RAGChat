# IMessageRead Accessor

## Purpose

`IMessageRead` provides read-only access to messages in Rocket.Chat. It allows retrieving messages by ID, looking up the sender of a message, and getting the room a message belongs to.

---

## Overview

`IMessageRead` is obtained via `read.getMessageReader()`. It is a focused interface with three methods for querying messages. Despite its small surface, it serves as the foundation for message lookups throughout the Apps Engine.

The interface returns `IMessage` objects (the strongly typed representation), along with complementary lookups for the sender (`IUser`) and the room (`IRoom`).

---

## When To Use

- Retrieving a specific message by its ID → `getById()`
- Looking up who sent a message → `getSenderUser()`
- Determining which room a message belongs to → `getRoom()`

---

## Important Methods

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `getById` | `id: string` | `Promise<IMessage \| undefined>` | Fetch a message by its unique ID |
| `getSenderUser` | `messageId: string` | `Promise<IUser \| undefined>` | Get the user who sent a message |
| `getRoom` | `messageId: string` | `Promise<IRoom \| undefined>` | Get the room containing a message |

---

## Typical Workflow

1. Receive `read: IRead` in a lifecycle hook or event handler
2. Call `read.getMessageReader()` to get the `IMessageRead` instance
3. Use `getById()` to fetch a message, then optionally chain `getSenderUser()` or `getRoom()` for context
4. All methods return Promises — always `await`
5. Check for `undefined` results before using returned values

---

## Example

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

async function inspectMessage(messageId: string, read: IRead): Promise<void> {
    const messageReader = read.getMessageReader();

    // Fetch the message itself
    const message: IMessage | undefined = await messageReader.getById(messageId);

    if (!message) {
        console.log(`Message ${messageId} not found`);
        return;
    }

    console.log(`Message text: ${message.text}`);

    // Look up the sender
    const sender = await messageReader.getSenderUser(messageId);
    if (sender) {
        console.log(`Sent by: ${sender.username} (${sender.name})`);
    }

    // Look up the room
    const room = await messageReader.getRoom(messageId);
    if (room) {
        console.log(`In room: ${room.displayName || room.slugifiedName}`);
    }
}
```

### Using in a PostMessageSent Handler

```typescript
import {
    IPostMessageSent,
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

export class MyPostMessageSentHandler implements IPostMessageSent {
    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const messageReader = read.getMessageReader();

        // message.id is available directly from the hook parameter,
        // but you can also re-fetch it fresh:
        const freshMessage = await messageReader.getById(message.id);

        if (freshMessage) {
            const sender = await messageReader.getSenderUser(freshMessage.id);
            const room = await messageReader.getRoom(freshMessage.id);

            console.log(`New message from ${sender?.username} in ${room?.slugifiedName}`);
        }
    }
}
```

---

## Best Practices

- **Always check for `undefined`** — `getById()`, `getSenderUser()`, and `getRoom()` all return `undefined` when the record is not found.
- **Use the message ID from the event context** — In lifecycle hooks (e.g., `IPostMessageSent`), the `message` parameter already has the ID; re-fetch only when you need a guaranteed fresh copy.
- **Combine with `IRoomRead.getMessages()`** — `IMessageRead` is designed for single-message lookups; use `IRoomRead.getMessages()` for bulk retrieval.
- **Minimize chained lookups** — If you already have a room ID from the message object (`message.room.id`), prefer `read.getRoomReader().getById()` directly instead of `messageReader.getRoom()`.

---

## Common Mistakes

- **Assuming the message exists** → Always handle the `undefined` case.
- **Using `getById()` for bulk reads** → Use `IRoomRead.getMessages()` for querying multiple messages from a room.
- **Confusing `getSenderUser()` with the sender field on the message** → `message.sender` on the raw object is available in hooks, but `getSenderUser()` fetches the full current user record.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [IRoomRead Accessor](./room-reader.md)
- [IMessageBuilder Accessor](./message-builder.md)
- [Message Structure](../messages/message-structure.md)
