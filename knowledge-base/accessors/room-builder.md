# IRoomBuilder and IDiscussionBuilder

## Purpose

`IRoomBuilder` is a fluent builder interface for creating new Rocket.Chat rooms. `IDiscussionBuilder` extends it with discussion-specific methods (parent room, parent message, reply text). Both follow the same builder pattern: `startRoom()` / `startDiscussion()` then chain methods then `finish()`.

---

## Overview

`IRoomBuilder` is created via `modify.getCreator().startRoom()`. It requires a creator, a display name (or slugified name), and a room type. Every setter returns `IRoomBuilder` for method chaining.

`IDiscussionBuilder` is created via `modify.getCreator().startDiscussion()`. It extends `IRoomBuilder` and adds methods to set the parent room, parent message, and initial reply text.

The builder validates constraints at `finish()` time — if creator, name, or type is missing, the operation fails.

---

## When To Use

- Creating a public channel → `startRoom()` with `RoomType.CHANNEL`
- Creating a private group → `startRoom()` with `RoomType.PRIVATE_GROUP`
- Creating a DM → `startRoom()` with `RoomType.DIRECT_MESSAGE`
- Creating a discussion thread → `startDiscussion()` with parent room and message
- Setting room as read-only → `setReadOnly(true)`
- Setting room as default for new users → `setDefault(true)`
- Adding members on creation → `setMembersToBeAddedByUsernames()`
- Hiding system messages → `setDisplayingOfSystemMessages(false)`
- Adding custom fields → `addCustomField()` or `setCustomFields()`

---

## Important Methods — IRoomBuilder

### Core Building

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `setData` | `room: Partial<IRoom>` | `IRoomBuilder` | Set room data from a partial object (id is ignored) |
| `setDisplayName` | `name: string` | `IRoomBuilder` | Set the human-readable room name |
| `setSlugifiedName` | `name: string` | `IRoomBuilder` | Set the URL-safe room name (no spaces, special chars) |
| `setType` | `type: RoomType` | `IRoomBuilder` | Set the room type (required) |
| `setCreator` | `creator: IUser` | `IRoomBuilder` | Set the room creator (required) |
| `getRoom` | - | `IRoom` | Get the built room object before finish |

### Members

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `addMemberToBeAddedByUsername` | `username: string` | `IRoomBuilder` | Add one member by username |
| `setMembersToBeAddedByUsernames` | `usernames: Array<string>` | `IRoomBuilder` | Set all members to add by username |
| `getMembersToBeAddedUsernames` | - | `Array<string>` | Get the current member usernames list |
| `addUsername` | `username: string` | `IRoomBuilder` | **Deprecated** — use `addMemberToBeAddedByUsername` |
| `setUsernames` | `usernames: Array<string>` | `IRoomBuilder` | **Deprecated** — use `setMembersToBeAddedByUsernames` |
| `getUsernames` | - | `Array<string>` | **Deprecated** — use `getMembersToBeAddedUsernames` |

### Configuration

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `setDefault` | `isDefault: boolean` | `IRoomBuilder` | Auto-join new users to this room |
| `setReadOnly` | `isReadOnly: boolean` | `IRoomBuilder` | Only users with permission can send messages |
| `setDisplayingOfSystemMessages` | `displaySystemMessages: boolean` | `IRoomBuilder` | Show/hide join/leave system messages |

### Custom Fields

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `addCustomField` | `key: string, value: object` | `IRoomBuilder` | Add a custom field (replaces existing key) |
| `setCustomFields` | `fields: { [key: string]: object }` | `IRoomBuilder` | Replace all custom fields |
| `getCustomFields` | - | `{ [key: string]: object }` | Get all custom fields |

---

## Important Methods — IDiscussionBuilder

`IDiscussionBuilder` inherits all `IRoomBuilder` methods and adds:

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `setParentRoom` | `parentRoom: IRoom` | `IDiscussionBuilder` | Set the parent room for the discussion |
| `getParentRoom` | - | `IRoom` | Get the parent room |
| `setParentMessage` | `parentMessage: IMessage` | `IDiscussionBuilder` | Set the message this discussion originates from |
| `getParentMessage` | - | `IMessage` | Get the parent message |
| `setReply` | `reply: string` | `IDiscussionBuilder` | Set the initial reply text in the discussion |
| `getReply` | - | `string` | Get the initial reply text |

---

## RoomType Enum

| Value | Description |
|-------|-------------|
| `RoomType.CHANNEL` | Public channel (`c`) |
| `RoomType.PRIVATE_GROUP` | Private group (`p`) |
| `RoomType.DIRECT_MESSAGE` | Direct message (`d`) |
| `RoomType.LIVE_CHAT` | Livechat room (`l`) |

---

## Builder Pattern

```
1. startRoom() / startDiscussion()   — creates an empty builder
2. .setCreator()                      — (required) who created the room
3. .setDisplayName() / .setSlugifiedName() — (required) room name
4. .setType()                         — (required) RoomType
5. .setReadOnly() / .setDefault()     — (optional) configuration
6. .setMembersToBeAddedByUsernames()  — (optional) initial members
7. .addCustomField()                  — (optional) metadata
8. finish(builder)                    — persists and returns the room ID
```

For discussions, the flow adds parent context before `.finish()`:

```
startDiscussion()
    .setCreator(appUser)
    .setDisplayName('My Discussion')
    .setType(RoomType.PRIVATE_GROUP)
    .setParentRoom(parentRoom)
    .setParentMessage(parentMessage)
    .setReply('Initial reply text')
    → finish()
```

---

## Examples

### Creating a Public Channel

```typescript
import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

async function createPublicChannel(
    name: string,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startRoom()
        .setCreator(appUser)
        .setDisplayName(name)
        .setSlugifiedName(name.toLowerCase().replace(/\s+/g, '-'))
        .setType(RoomType.CHANNEL)
        .setReadOnly(false)
        .setDisplayingOfSystemMessages(true);

    const roomId = await modify.getCreator().finish(builder);
    return roomId;
}
```

### Creating a Private Group with Members

```typescript
async function createPrivateGroup(
    name: string,
    memberUsernames: string[],
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startRoom()
        .setCreator(appUser)
        .setDisplayName(name)
        .setSlugifiedName(name.toLowerCase().replace(/\s+/g, '-'))
        .setType(RoomType.PRIVATE_GROUP)
        .setMembersToBeAddedByUsernames(memberUsernames)
        .setReadOnly(false);

    const roomId = await modify.getCreator().finish(builder);
    return roomId;
}
```

### Creating a Read-Only Announcement Channel

```typescript
async function createAnnouncementChannel(
    name: string,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startRoom()
        .setCreator(appUser)
        .setDisplayName(name)
        .setSlugifiedName(name.toLowerCase().replace(/\s+/g, '-'))
        .setType(RoomType.CHANNEL)
        .setReadOnly(true)
        .addCustomField('purpose', { value: 'announcements' })
        .addCustomField('moderated', { value: true });

    const roomId = await modify.getCreator().finish(builder);
    return roomId;
}
```

### Creating a Discussion

```typescript
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function createDiscussion(
    parentRoom: IRoom,
    parentMessage: IMessage,
    discussionName: string,
    initialReply: string,
    read: IRead,
    modify: IModify,
): Promise<string> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startDiscussion()
        .setCreator(appUser)
        .setDisplayName(discussionName)
        .setSlugifiedName(discussionName.toLowerCase().replace(/\s+/g, '-'))
        .setType(RoomType.PRIVATE_GROUP)
        .setParentRoom(parentRoom)
        .setParentMessage(parentMessage)
        .setReply(initialReply);

    const discussionId = await modify.getCreator().finish(builder);
    return discussionId;
}
```

### Full Workflow: Create Room and Send Welcome Message

```typescript
import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

async function createRoomWithWelcome(
    roomName: string,
    read: IRead,
    modify: IModify,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    const roomReader = read.getRoomReader();

    // Step 1: Build and create the room
    const roomBuilder = modify.getCreator().startRoom()
        .setCreator(appUser)
        .setDisplayName(roomName)
        .setSlugifiedName(roomName.toLowerCase().replace(/\s+/g, '-'))
        .setType(RoomType.CHANNEL)
        .setReadOnly(false);

    const roomId = await modify.getCreator().finish(roomBuilder);

    // Step 2: Fetch the created room
    const room = await roomReader.getById(roomId);

    if (!room) {
        throw new Error('Room was created but could not be fetched');
    }

    // Step 3: Send a welcome message
    const messageBuilder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(`Welcome to #${roomName}! This channel was created by the app.`)
        .setParseUrls(false)
        .setGroupable(false);

    await modify.getCreator().finish(messageBuilder);
}
```

---

## Best Practices

- **Set creator, name, and type first** — these three are required; `finish()` fails without them.
- **Use `setSlugifiedName()` with a valid slug** — no spaces, no special characters. The app validates this.
- **Use `addMemberToBeAddedByUsername()` for adding members** — the deprecated `addUsername()` will be removed in v2.0.0.
- **Use `setMembersToBeAddedByUsernames()` for bulk member assignment** — the deprecated `setUsernames()` will be removed in v2.0.0.
- **Set `setDisplayingOfSystemMessages(false)` for bot-managed rooms** — reduces noise from join/leave messages.
- **Use `setCustomFields()` for room metadata** — custom fields persist and can be read back via `IRoom.customFields`.
- **For discussions, set parent room and parent message before `finish()`** — these are required for discussions to function correctly.

---

## Common Mistakes

- **Using spaces or special characters in `setSlugifiedName()`** → The builder validates and throws an error.
- **Forgetting `setCreator()`** → The builder fails at `finish()` without a creator.
- **Confusing `setDisplayName()` with `setSlugifiedName()`** → Display name is human-readable; slugified name is the URL-safe identifier used for `getByName()` lookups.
- **Using deprecated member methods** → `addUsername()`, `setUsernames()`, `getUsernames()` are deprecated; migrate to the `*ToBeAdded*` equivalents.
- **Not fetching the created room before using it** — `finish()` returns the room ID; use `getById()` to get the full `IRoom` object for message sending.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [IModifyCreator](./modify-creator.md)
- [IRoomRead Accessor](./room-reader.md)
- [Room Structure](../rooms/room-structure.md)
- [IMessageBuilder Accessor](./message-builder.md)
