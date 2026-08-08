# Room Structure

## Purpose

`IRoom` represents a Rocket.Chat room — a channel, private group, direct message, or livechat room. Understanding the room structure is essential for reading and sending messages, creating rooms, and handling room events.

---

## Overview

A room is the container for messages. Every message belongs to exactly one room. The `IRoom` interface carries the room's identity (id, displayName, slugifiedName), type (channel, private group, DM, livechat), membership information, and metadata.

The `RoomType` enum distinguishes the four room types:
- **CHANNEL** (`c`) — Public channels visible to all
- **PRIVATE_GROUP** (`p`) — Private groups, invite-only
- **DIRECT_MESSAGE** (`d`) — One-on-one or multi-user DMs
- **LIVE_CHAT** (`l`) — Livechat/omnichannel rooms

---

## When To Use

- Getting the room from a message → `message.room`
- Getting the room from a slash command → `context.getRoom()`
- Checking room type → `room.type === RoomType.CHANNEL`
- Checking if room is read-only → `room.isReadOnly`
- Getting room members → `room.userIds`
- Creating a new room → `modify.getCreator().startRoom()`
- Finding a room by ID → `read.getRoomReader().getById()`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IRoom` | Room data structure | `id`, `displayName`, `slugifiedName`, `type`, `creator`, `userIds` |
| `RoomType` | Enum | `CHANNEL`, `PRIVATE_GROUP`, `DIRECT_MESSAGE`, `LIVE_CHAT` |
| `ILivechatRoom` | Livechat room extension | Extends IRoom with `visitor`, `department`, `isOpen`, `closer`, `source` |
| `isLivechatRoom()` | Type guard | Checks if `room.type === RoomType.LIVE_CHAT` |

---

## IRoom Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique room ID |
| `slugifiedName` | `string` | Yes | URL-safe slug |
| `type` | `RoomType` | Yes | `CHANNEL`, `PRIVATE_GROUP`, `DIRECT_MESSAGE`, or `LIVE_CHAT` |
| `creator` | `IUser` | Yes | User who created the room |
| `usernames` | `Array<string>` | Yes **(deprecated)** | Member usernames — use `userIds` instead. Will be removed in v2.0.0 |
| `displayName` | `string` | No | Human-readable name |
| `userIds` | `Array<string>` | No | Member user IDs |
| `teamId` | `string` | No | Team this room belongs to |
| `isTeamMain` | `boolean` | No | Is the main team room |
| `isDefault` | `boolean` | No | Is a default channel (auto-joined) |
| `isReadOnly` | `boolean` | No | Read-only mode (announcements) |
| `displaySystemMessages` | `boolean` | No | Show join/leave/rename messages |
| `messageCount` | `number` | No | Total messages in room |
| `createdAt` | `Date` | No | Creation date |
| `updatedAt` | `Date` | No | Last update |
| `lastModifiedAt` | `Date` | No | Last content modification |
| `description` | `string` | No | Room topic/description |
| `customFields` | `{ [key: string]: any }` | No | App-specific metadata |
| `parentRoom` | `IRoom` | No | Parent room (for discussions/threads) |
| `livechatData` | `{ [key: string]: any }` | No | Livechat-specific custom fields |
| `isFederated` | `boolean` | No | Is a federated room |
| `federation` | `FederationLookup` | No | Federation origin metadata |
| `abacAttributes` | `IAbacAttributeDefinition[]` | No | ABAC security attributes |

**Deprecated**: `usernames: Array<string>` — use `userIds` instead. Will be removed in v2.0.0.

---

## RoomType Enum

| Value | Alias | Description |
|-------|-------|-------------|
| `CHANNEL` | `'c'` | Public channel |
| `PRIVATE_GROUP` | `'p'` | Private group |
| `DIRECT_MESSAGE` | `'d'` | Direct message |
| `LIVE_CHAT` | `'l'` | Livechat/omnichannel room |

---

## Typical Workflow

### 1. Checking Room Type

```typescript
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

if (room.type === RoomType.CHANNEL) {
    // Public channel logic
} else if (room.type === RoomType.PRIVATE_GROUP) {
    // Private group logic
} else if (room.type === RoomType.DIRECT_MESSAGE) {
    // DM logic
}
```

### 2. Checking if Room is Read-Only

```typescript
if (room.isReadOnly) {
    // Skip — can't send messages here
    return;
}
```

### 3. Detecting a Livechat Room

```typescript
import { isLivechatRoom, ILivechatRoom } from '@rocket.chat/apps-engine/definition/livechat';

if (isLivechatRoom(room)) {
    const livechatRoom = room as ILivechatRoom;
    console.log(`Visitor: ${livechatRoom.visitor.name}`);
    console.log(`Open: ${livechatRoom.isOpen}`);
}
```

### 4. Checking Team Membership

```typescript
if (room.teamId) {
    if (room.isTeamMain) {
        // This is the main team room
    } else {
        // This is a sub-room of a team
    }
}
```

---

## Example

```typescript
import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';

async function sendToRoom(room: IRoom, text: string, modify: IModify): Promise<void> {
    // Don't send to read-only rooms
    if (room.isReadOnly) {
        return;
    }

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setText(text);

    await modify.getCreator().finish(builder);
}

async function describeRoom(room: IRoom): Promise<string> {
    const typeLabel = {
        [RoomType.CHANNEL]: 'Public Channel',
        [RoomType.PRIVATE_GROUP]: 'Private Group',
        [RoomType.DIRECT_MESSAGE]: 'Direct Message',
        [RoomType.LIVE_CHAT]: 'Livechat',
    }[room.type] || 'Unknown';

    return `${typeLabel}: ${room.displayName || room.slugifiedName} (${room.id})`;
}
```

---

## Best Practices

- **Check `room.isReadOnly` before sending messages** — writing to a read-only room fails.
- **Use the `isLivechatRoom()` type guard** before accessing livechat-specific properties.
- **Use `room.userIds` for membership checks** — the deprecated `usernames` array will be removed in v2.0.0.
- **Check `room.type` before accessing properties** — some properties are only meaningful for specific room types.
- **Handle the `parentRoom` relationship** for discussion threads — discussions have a parent room.
- **Handle `teamId` and `isTeamMain`** — rooms can belong to teams, and the main team room has special semantics.

---

## Common Mistakes

- **Assuming all rooms have a `displayName`** — DMs may not have one set.
- **Using `room.usernames`** — Deprecated. Use `userIds` instead. Will be removed in v2.0.0.
- **Sending messages without checking `isReadOnly`** — Your app should respect room settings.
- **Not using `isLivechatRoom()` type guard** — Accessing `visitor` on a non-livechat room causes a runtime error.
- **Comparing RoomType values as raw strings** — Use `RoomType.CHANNEL` constants, not `'c'`.

---

## Related Topics

- [Room Event Handlers](./room-handlers.md)
- [Room Queries](./room-queries.md)
- [Room Reader](../accessors/room-reader.md)
- [Room Builder](../accessors/room-builder.md)
- [Modify Creator](../accessors/modify-creator.md)
- [Livechat Room](../livechat/livechat-room.md)
