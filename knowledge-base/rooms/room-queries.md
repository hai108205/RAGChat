# Room Queries

## Purpose

`GetMessagesOptions` and `GetRoomsFilters` control how messages and rooms are retrieved from the Rocket.Chat server. They are used with `IRoomRead` accessor methods to paginate, sort, and filter results.

---

## Overview

**GetMessagesOptions** defines pagination and sorting for message retrieval. It is passed to `getMessages()` and `getUnreadByUser()`. Fields: `limit` (max 100), `skip` (offset), `sort` (only `createdAt` ascending/descending), and `showThreadMessages` (whether to include thread replies).

**GetRoomsFilters** filters the room list returned by `getAllRooms()`. Fields: `types` (array of `RoomType`), `discussions` (include/exclude discussion rooms), and `teams` (include/exclude team main rooms).

Both are imported from `@rocket.chat/apps-engine/definition/rooms/IGetMessagesOptions`.

---

## When To Use

- Loading messages page by page → `getMessages()` with `limit` and `skip`
- Getting newest messages first → `sort: { createdAt: 'desc' }`
- Getting oldest messages first → `sort: { createdAt: 'asc' }`
- Excluding thread replies → `showThreadMessages: false`
- Finding only channels → `GetRoomsFilters.types: [RoomType.CHANNEL]`
- Finding only DMs → `GetRoomsFilters.types: [RoomType.DIRECT_MESSAGE]`
- Excluding discussions from room list → `discussions: false`
- Getting only team rooms → `teams: true`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `GetMessagesOptions` | Message query options | `limit`, `skip`, `sort`, `showThreadMessages` |
| `GetRoomsFilters` | Room query filters | `types`, `discussions`, `teams` |
| `GetRoomsOptions` | Room pagination | `limit`, `skip` |
| `GetMessagesSortableFields` | Allowed sort fields | `['createdAt']` (only) |

---

## GetMessagesOptions

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `limit` | `number` | No (per call) | Server default | Max messages to return. Capped at 100. |
| `skip` | `number` | No (per call) | 0 | Number of messages to skip (pagination offset) |
| `sort` | `Record<'createdAt', 'asc' \| 'desc'>` | No (per call) | Server default | Sort order. Only `createdAt` is supported. |
| `showThreadMessages` | `boolean` | No (per call) | `true` | Include thread messages in results |

## GetRoomsFilters

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `types` | `Array<RoomType>` | No | All types | Room types to include: `CHANNEL`, `PRIVATE_GROUP`, `DIRECT_MESSAGE`, `LIVE_CHAT` |
| `discussions` | `boolean` | No | `undefined` (include all) | `true` = only discussions. `false` = exclude discussions. |
| `teams` | `boolean` | No | `undefined` (include all) | `true` = only team main rooms. `false` = exclude team rooms. |

## GetRoomsOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `limit` | `number` | No | Max rooms to return |
| `skip` | `number` | No | Number of rooms to skip (pagination offset) |

---

## Typical Workflow

### 1. Paginated Message Loading

```typescript
import { GetMessagesOptions } from '@rocket.chat/apps-engine/definition/rooms/IGetMessagesOptions';

// Page 1: first 50 messages (most recent first)
const page1: Partial<GetMessagesOptions> = {
    limit: 50,
    skip: 0,
    sort: { createdAt: 'desc' },
};

const messagesPage1 = await read.getRoomReader().getMessages(roomId, page1);

// Page 2: next 50 messages
const page2: Partial<GetMessagesOptions> = {
    limit: 50,
    skip: 50,
    sort: { createdAt: 'desc' },
};

const messagesPage2 = await read.getRoomReader().getMessages(roomId, page2);
```

### 2. Loading by Date Range (Manual Filtering)

Since `GetMessagesOptions` doesn't support date filtering natively, load batches and filter by `createdAt`:

```typescript
import { IMessageRaw } from '@rocket.chat/apps-engine/definition/messages';

async function getMessagesBetweenDates(
    roomId: string,
    read: IRead,
    startDate: Date,
    endDate: Date,
): Promise<IMessageRaw[]> {
    const results: IMessageRaw[] = [];
    let skip = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
        const batch = await read.getRoomReader().getMessages(roomId, {
            limit,
            skip,
            sort: { createdAt: 'asc' },
        });

        if (batch.length === 0) {
            hasMore = false;
            break;
        }

        for (const msg of batch) {
            const msgDate = new Date(msg.createdAt);
            if (msgDate >= startDate && msgDate <= endDate) {
                results.push(msg);
            }
            // Stop if we've passed the end date (messages are ascending)
            if (msgDate > endDate) {
                hasMore = false;
                break;
            }
        }

        skip += limit;
        if (batch.length < limit) hasMore = false;
    }

    return results;
}
```

### 3. Filtering Rooms by Type

```typescript
import { GetRoomsFilters, GetRoomsOptions } from '@rocket.chat/apps-engine/definition/rooms/IGetMessagesOptions';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

// Get only channels and private groups, excluding discussions
const filters: GetRoomsFilters = {
    types: [RoomType.CHANNEL, RoomType.PRIVATE_GROUP],
    discussions: false,
};

const rooms = await read.getRoomReader().getAllRooms(filters);

// Get only team rooms
const teamFilters: GetRoomsFilters = {
    teams: true,
};

const teamRooms = await read.getRoomReader().getAllRooms(teamFilters);
```

### 4. Getting Unread Messages for a User

```typescript
const options: Partial<GetMessagesOptions> = {
    limit: 20,
    sort: { createdAt: 'asc' },
    showThreadMessages: false, // Only main messages
};

const unreadMessages = await read.getRoomReader().getUnreadByUser(
    roomId,
    userId,
    options,
);
```

---

## Best Practices

- **Keep `limit` at or under 100** — the server caps it.
- **Use `sort: { createdAt: 'asc' }` for chronological order** — consistent with oldest-first pagination.
- **Use `sort: { createdAt: 'desc' }` for "latest N messages"** — recent messages first.
- **Set `showThreadMessages: false` when you only want top-level messages** — reduces noise and data volume.
- **Use `GetRoomsFilters.types` to narrow room searches** — avoids loading all rooms when you only need channels.
- **All options are `Partial`** — you can omit any field and the server uses defaults. Pass only what you need.

---

## Common Mistakes

- **Assuming `limit` has no cap** — The server caps at 100. Requesting 500 returns at most 100.
- **Using `sort` with a field other than `createdAt`** — Only `createdAt` is a valid sort field. Other fields will be ignored.
- **Forgetting `discussions` and `teams` default to undefined** — Undefined means "include all", which may return more rooms than expected.
- **Not handling `getAllRooms()` returning `undefined`** — Returns `undefined` if the App lacks the permission to view all rooms.
- **Paginating without checking `batch.length < limit`** — Signals end of results. Continuing to paginate wastes calls.

---

## Related Topics

- [Room Structure](./room-structure.md)
- [Room Reader Accessor](../accessors/room-reader.md)
- [Message Structure](../messages/message-structure.md)
- [Message Reader Accessor](../accessors/message-reader.md)
