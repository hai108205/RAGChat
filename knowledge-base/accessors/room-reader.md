# IRoomRead Accessor

## Purpose

`IRoomRead` provides read-only access to rooms in Rocket.Chat. It supports querying rooms by ID, name, or usernames, retrieving messages and members, looking up room roles (moderators, owners, leaders), fetching unread message counts, and listing all rooms with optional filtering.

---

## Overview

`IRoomRead` is obtained via `read.getRoomReader()`. It is the primary interface for discovering and inspecting rooms within a workspace. It covers:

- **Direct lookups** — get a room by ID, name, or the usernames in a DM
- **Creator lookups** — find who created a room
- **Message queries** — retrieve messages from a room with pagination, sorting, and thread filtering
- **Member queries** — list all members, moderators, owners, or leaders of a room
- **Unread tracking** — get unread messages and unread counts for a specific user
- **Bulk listing** — retrieve all rooms with type and discussion/team filters

---

## When To Use

- Finding a room by ID → `getById()`
- Finding a room by its display name → `getByName()`
- Finding the DM between specific users → `getDirectByUsernames()`
- Listing members of a room → `getMembers()`
- Listing moderators/owners/leaders → `getModerators()` / `getOwners()` / `getLeaders()`
- Reading recent messages from a room → `getMessages()`
- Getting unread messages for a user → `getUnreadByUser()`
- Checking unread message count → `getUserUnreadMessageCount()`
- Listing all rooms with filters → `getAllRooms()`

---

## Important Methods

### Room Lookups

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `getById` | `id: string` | `Promise<IRoom \| undefined>` | Get a room by its ID |
| `getByName` | `name: string` | `Promise<IRoom \| undefined>` | Get a room by its slugified name |
| `getDirectByUsernames` | `usernames: Array<string>` | `Promise<IRoom>` | Get the DM room between the given usernames |
| `getAllRooms` | `filters?: GetRoomsFilters, options?: GetRoomsOptions` | `Promise<Array<IRoomRaw> \| undefined>` | List all rooms, optionally filtered by type, discussion, team |

### Creator Lookups

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `getCreatorUserById` | `id: string` | `Promise<IUser \| undefined>` | Get the creator of a room by room ID |
| `getCreatorUserByName` | `name: string` | `Promise<IUser \| undefined>` | Get the creator of a room by room name |

### Messages

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `getMessages` | `roomId: string, options?: Partial<GetMessagesOptions>` | `Promise<Array<IMessageRaw>>` | Get messages from a room with pagination and sorting |
| `getUnreadByUser` | `roomId: string, uid: string, options?: Partial<GetMessagesOptions>` | `Promise<IMessageRaw[]>` | Get unread messages for a specific user in a room |
| `getUserUnreadMessageCount` | `roomId: string, uid: string` | `Promise<number>` | Get the count of unread messages for a user |

### Members and Roles

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `getMembers` | `roomId: string` | `Promise<Array<IUser>>` | List all users in a room |
| `getModerators` | `roomId: string` | `Promise<Array<IUser>>` | List users with moderator role |
| `getOwners` | `roomId: string` | `Promise<Array<IUser>>` | List users with owner role |
| `getLeaders` | `roomId: string` | `Promise<Array<IUser>>` | List users with leader role |

---

## GetMessagesOptions

The `getMessages()` and `getUnreadByUser()` methods accept an optional options object:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | - | Maximum number of messages to retrieve (max 100) |
| `skip` | `number` | - | Number of messages to skip for pagination |
| `sort` | `Record<'createdAt', 'asc' \| 'desc'>` | - | Sort order by `createdAt` field |
| `showThreadMessages` | `boolean` | `true` | Whether to include thread messages in results |

---

## GetRoomsFilters

The `getAllRooms()` method accepts optional filters:

| Filter | Type | Default | Description |
|--------|------|---------|-------------|
| `types` | `Array<RoomType>` | - | Filter by room types (e.g., `['c', 'p']`) |
| `discussions` | `boolean` | `undefined` (all) | `true` = only discussions; `false` = exclude discussions |
| `teams` | `boolean` | `undefined` (all) | `true` = only team rooms; `false` = exclude team rooms |

---

## Examples

### Finding a Room

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function findRoom(roomName: string, read: IRead): Promise<IRoom | undefined> {
    const roomReader = read.getRoomReader();

    // Try by name first
    const room = await roomReader.getByName(roomName);
    return room;
}

async function findDirectMessage(
    userA: string,
    userB: string,
    read: IRead,
): Promise<IRoom> {
    const roomReader = read.getRoomReader();
    return await roomReader.getDirectByUsernames([userA, userB]);
}

async function findRoomCreator(roomId: string, read: IRead): Promise<string> {
    const roomReader = read.getRoomReader();
    const creator = await roomReader.getCreatorUserById(roomId);
    return creator?.username ?? 'unknown';
}
```

### Reading Messages with Pagination

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageRaw } from '@rocket.chat/apps-engine/definition/messages';

async function getRecentMessages(
    roomId: string,
    count: number,
    read: IRead,
): Promise<IMessageRaw[]> {
    const roomReader = read.getRoomReader();

    const messages = await roomReader.getMessages(roomId, {
        limit: Math.min(count, 100),
        sort: { createdAt: 'desc' },
        showThreadMessages: false,
    });

    return messages;
}

async function paginateAllMessages(
    roomId: string,
    read: IRead,
): Promise<IMessageRaw[]> {
    const roomReader = read.getRoomReader();
    const allMessages: IMessageRaw[] = [];
    const pageSize = 50;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
        const batch = await roomReader.getMessages(roomId, {
            limit: pageSize,
            skip: skip,
            sort: { createdAt: 'asc' },
        });

        allMessages.push(...batch);

        if (batch.length < pageSize) {
            hasMore = false;
        } else {
            skip += pageSize;
        }
    }

    return allMessages;
}
```

### Checking Unread Messages

```typescript
async function checkUnreadForUser(
    roomId: string,
    userId: string,
    read: IRead,
): Promise<void> {
    const roomReader = read.getRoomReader();

    const unreadCount = await roomReader.getUserUnreadMessageCount(roomId, userId);
    console.log(`User ${userId} has ${unreadCount} unread messages in room ${roomId}`);

    if (unreadCount > 0) {
        const unreadMessages = await roomReader.getUnreadByUser(roomId, userId, {
            limit: 20,
            sort: { createdAt: 'desc' },
        });

        for (const msg of unreadMessages) {
            console.log(`Unread: ${msg.text}`);
        }
    }
}
```

### Listing Rooms with Filters

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

async function listChannels(read: IRead): Promise<void> {
    const roomReader = read.getRoomReader();

    // Get only public channels, excluding discussions and team rooms
    const rooms = await roomReader.getAllRooms(
        {
            types: [RoomType.CHANNEL],
            discussions: false,
            teams: false,
        },
        { limit: 50 },
    );

    if (rooms) {
        for (const room of rooms) {
            console.log(`Channel: ${room.name} (${room._id})`);
        }
    }
}

async function listDiscussions(read: IRead): Promise<void> {
    const roomReader = read.getRoomReader();

    const discussions = await roomReader.getAllRooms({
        discussions: true,
    });

    if (discussions) {
        console.log(`Found ${discussions.length} discussions`);
    }
}
```

### Getting Room Members and Roles

```typescript
async function inspectRoomRoles(roomId: string, read: IRead): Promise<void> {
    const roomReader = read.getRoomReader();

    const [members, moderators, owners, leaders] = await Promise.all([
        roomReader.getMembers(roomId),
        roomReader.getModerators(roomId),
        roomReader.getOwners(roomId),
        roomReader.getLeaders(roomId),
    ]);

    console.log(`Room ${roomId}:`);
    console.log(`  Members: ${members.length}`);
    console.log(`  Moderators: ${moderators.map(u => u.username).join(', ')}`);
    console.log(`  Owners: ${owners.map(u => u.username).join(', ')}`);
    console.log(`  Leaders: ${leaders.map(u => u.username).join(', ')}`);
}
```

---

## Best Practices

- **Check for `undefined` on `getById()` and `getByName()`** — rooms may not exist or the app may lack permission.
- **Check for `undefined` on `getAllRooms()`** — returns `undefined` if the app lacks the `view-all-room` permission.
- **Use `limit` <= 100** — `getMessages()` caps at 100 per call; paginate with `skip` for larger datasets.
- **Use `getDirectByUsernames()` for DMs** — the usernames array determines which DM room is returned; order does not matter.
- **Combine role lookups with `Promise.all()`** — `getModerators()`, `getOwners()`, and `getLeaders()` are independent and can run in parallel.
- **Use `getUserUnreadMessageCount()` first** — check the count before fetching unread messages to avoid unnecessary queries.

---

## Common Mistakes

- **Assuming `getAllRooms()` always returns an array** → It returns `undefined` without the proper permission.
- **Using `getByName()` with a display name** → Use the slugified room name (lowercase, no spaces/special chars).
- **Passing a limit > 100** → Values over 100 are silently clamped to 100.
- **Forgetting to paginate** → A single `getMessages()` call returns at most 100 messages; iterate to get more.
- **Assuming all rooms are visible** → The app's permissions determine which rooms can be read.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [IRoomBuilder Accessor](./room-builder.md)
- [IMessageRead Accessor](./message-reader.md)
- [Room Structure](../rooms/room-structure.md)
