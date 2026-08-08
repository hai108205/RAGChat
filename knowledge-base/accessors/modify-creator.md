# Modify Creator

## Purpose

`IModifyCreator` is the creation engine of the Apps Engine. It provides builder factories for every type of Rocket.Chat domain object — messages, rooms, discussions, livechat rooms, uploads, video conferences, and bot users. All creation flows follow the same pattern: start a builder, configure it, then call `finish()`.

---

## Overview

`IModifyCreator` is accessed via `modify.getCreator()`. It exposes two groups:

- **Builder starters** — return a typed builder object (e.g. `startMessage()` → `IMessageBuilder`)
- **Domain-specific creators** — return a dedicated creator for complex sub-systems (e.g. `getLivechatCreator()` → `ILivechatCreator`)

Every builder follows the **fluent builder pattern**: chain configuration methods, then pass the builder to `finish()` to persist. The builder itself is inert until `finish()` is called.

---

## When To Use

- Sending a message → `startMessage() ... finish()`
- Sending a message in a livechat room → `startLivechatMessage() ... finish()`
- Creating a channel/group/DM → `startRoom() ... finish()`
- Creating a discussion thread room → `startDiscussion() ... finish()`
- Uploading a file → `getUploadCreator().uploadBuffer()`
- Creating a bot user → `startBotUser() ... finish()`
- Starting a video conference → `startVideoConference() ... finish()`

---

## Important Methods

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `startMessage(data?)` | `IMessageBuilder` | Begin building a message |
| `startLivechatMessage(data?)` | `ILivechatMessageBuilder` | Begin building a livechat message |
| `startRoom(data?)` | `IRoomBuilder` | Begin building a room |
| `startDiscussion(data?)` | `IDiscussionBuilder` | Begin building a discussion |
| `startVideoConference(data?)` | `IVideoConferenceBuilder` | Begin building a video conference |
| `startBotUser(data?)` | `IUserBuilder` | Begin building a bot user |
| `getLivechatCreator()` | `ILivechatCreator` | Create livechat rooms/visitors/departments |
| `getUploadCreator()` | `IUploadCreator` | Create file uploads from buffers/URLs |
| `getEmailCreator()` | `IEmailCreator` | Send emails |
| `getContactCreator()` | `IContactCreator` | Create contact entries |
| `finish(builder)` | `Promise<string>` | Persist the built object; returns the new ID |

---

## Typical Workflows

### Creating a Message

```typescript
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function sendMessage(room: IRoom, text: string, read: IRead, modify: IModify) {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(text)
        .setParseUrls(true);

    const messageId = await modify.getCreator().finish(builder);
    console.log(`Message created: ${messageId}`);
}
```

### Creating a Message with Attachments

```typescript
const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(appUser)
    .setText('Report attached')
    .setAttachments([{
        color: '#ff0000',
        text: 'Monthly report',
    }]);

await modify.getCreator().finish(builder);
```

### Creating a Room

```typescript
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

async function createChannel(name: string, read: IRead, modify: IModify) {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startRoom()
        .setType(RoomType.CHANNEL)
        .setName(name)
        .setCreator(appUser)
        .setMembersToBeAddedByUsernames(['user1', 'user2'])
        .setReadOnly(false);

    const roomId = await modify.getCreator().finish(builder);
    console.log(`Room created: ${roomId}`);
}
```

### Creating a Discussion

```typescript
async function createDiscussion(
    parentMessage: IMessage,
    name: string,
    read: IRead,
    modify: IModify,
) {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startDiscussion()
        .setParentRoom(parentMessage.room)
        .setParentMessage(parentMessage)
        .setDiscussionName(name)
        .setCreator(appUser)
        .setMembersToBeAddedByUsernames(['user1']);

    const discussionId = await modify.getCreator().finish(builder);
    console.log(`Discussion created: ${discussionId}`);
}
```

A discussion must be linked to a parent message — it inherits the parent room's context.

### Creating a Bot User

```typescript
async function createBotUser(read: IRead, modify: IModify) {
    const builder = modify.getCreator().startBotUser()
        .setUsername('my-bot')
        .setDisplayName('My Bot')
        .setRoles(['bot']);

    const botUserId = await modify.getCreator().finish(builder);
}
```

### Uploading a File

```typescript
async function uploadFile(room: IRoom, read: IRead, modify: IModify) {
    const appUser = await read.getUserReader().getAppUser();
    const uploadCreator = modify.getCreator().getUploadCreator();

    const buffer = Buffer.from('Hello World', 'utf-8');

    await uploadCreator.uploadBuffer(
        buffer,
        {
            filename: 'hello.txt',
            contentType: 'text/plain',
        },
        appUser,
        room.id,
    );
}
```

### Starting a Video Conference

```typescript
async function startVideoConference(room: IRoom, read: IRead, modify: IModify) {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startVideoConference()
        .setRoomId(room.id)
        .setCreatedBy(appUser.id)
        .setTitle('Sprint Planning');

    const vcId = await modify.getCreator().finish(builder);
}
```

---

## Best Practices

- **Always set the sender** — Use `read.getUserReader().getAppUser()` for messages and room creation.
- **Chain builder methods** — The fluent API returns `this`; all configuration belongs on one chain.
- **Only call `finish()` after full configuration** — The builder does not validate before persistence.
- **Use `startDiscussion()` for threaded conversations** — Not `startRoom()`. Discussions are a distinct room subtype.
- **Use `getUploadCreator()` for file uploads** — No builder pattern here; the creator handles the upload directly.
- **Handle `finish()` rejections** — Wrap in try/catch; creation may fail due to permissions or validation.

---

## Common Mistakes

- **Setting an ID on initial data** → The `data` parameter on `start*()` methods ignores the `id` property.
- **Forgetting `await` on `finish()`** → Returns `Promise<string>`, not `string`.
- **Using `startRoom()` for discussions** → Discussions need `startDiscussion()` to properly link a parent message.
- **Calling `finish()` with the wrong builder type** → `finish()` accepts a union type; TypeScript will catch mismatches.
- **Assuming the room/user is available immediately** → `finish()` returns an ID; the object may still be processing.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [Modify Updater](./modify-updater.md)
- [Modify Deleter](./modify-deleter.md)
- [Modify Extender](./modify-extender.md)
