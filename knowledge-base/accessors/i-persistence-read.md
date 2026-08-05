# IPersistenceRead Accessor

## Purpose

`IPersistenceRead` provides read-only access to an App's persistent storage. Each App has its own isolated storage — one App cannot access another App's persisted data.

Access it via `read.getPersistenceReader()` from any lifecycle hook that receives `IRead`.

---

## Overview

`IPersistenceRead` exposes three query methods:

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `read(id)` | `id: string` | `Promise<IPersistenceItem \| null>` | Read a single record by its unique ID |
| `readByAssociation(association)` | `association: RocketChatAssociationRecord` | `Promise<Array<IPersistenceItem>>` | Read all records matching a single association |
| `readByAssociations(associations)` | `associations: Array<RocketChatAssociationRecord>` | `Promise<Array<IPersistenceItem>>` | Read records matching ALL associations (AND logic) |

### IPersistenceItem

```typescript
interface IPersistenceItem {
    appId: string;
    data: Record<string, unknown>;
    associations?: Array<RocketChatAssociationRecord>;
}
```

- **`appId`** — The ID of the App that owns this record.
- **`data`** — Arbitrary key-value data stored by the App.
- **`associations`** — Optional list of Rocket.Chat associations linking this record to rooms, users, messages, etc.

---

## When To Use

- Retrieving previously persisted App data by its ID
- Querying all data associated with a specific room
- Querying data linked to a specific user
- Finding records that match multiple associations (e.g., a user's data in a specific room)
- Any read operation on stored App state

---

## Query Behavior

| Scenario | Return Value |
|----------|-------------|
| `read(id)` — record exists | `IPersistenceItem` |
| `read(id)` — record does not exist | `null` (falsy) |
| `readByAssociation(...)` — matches found | `Array<IPersistenceItem>` |
| `readByAssociation(...)` — no matches | Empty array `[]` |
| `readByAssociations(...)` — matches found | `Array<IPersistenceItem>` |
| `readByAssociations(...)` — no matches | Empty array `[]` |

`readByAssociations` uses **AND** logic: a record must have **all** of the provided associations to match.

---

## Association Models

`RocketChatAssociationRecord` pairs a model type with an ID:

```typescript
enum RocketChatAssociationModel {
    ROOM = 'room',
    DISCUSSION = 'discussion',
    MESSAGE = 'message',
    LIVECHAT_MESSAGE = 'livechat-message',
    USER = 'user',
    FILE = 'file',
    MISC = 'misc',
    VIDEO_CONFERENCE = 'video-conference',
}
```

---

## Examples

### Reading by Record ID

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function getStoredConfig(read: IRead): Promise<Record<string, unknown> | null> {
    const reader = read.getPersistenceReader();
    const item = await reader.read('my-config-id');

    if (!item) {
        console.log('No stored config found.');
        return null;
    }

    return item.data;
}
```

### Reading by Room Association

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationRecord, RocketChatAssociationModel } from '@rocket.chat/apps-engine/definition/metadata';

async function getRoomNotes(roomId: string, read: IRead): Promise<Array<Record<string, unknown>>> {
    const reader = read.getPersistenceReader();
    const items = await reader.readByAssociation(
        new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId),
    );

    return items.map((item) => item.data);
}
```

### Reading by User + Room Combined Associations (AND)

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationRecord, RocketChatAssociationModel } from '@rocket.chat/apps-engine/definition/metadata';

async function getUserDataInRoom(
    userId: string,
    roomId: string,
    read: IRead,
): Promise<Array<Record<string, unknown>>> {
    const reader = read.getPersistenceReader();
    const items = await reader.readByAssociations([
        new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId),
        new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId),
    ]);

    return items.map((item) => item.data);
}
```

---

## Best Practices

- **Use specific associations for efficient queries** — Associating records with relevant rooms, users, or messages enables targeted retrieval without scanning all stored data.
- **Always handle empty results** — `read(id)` returns `null` for missing records; `readByAssociation` and `readByAssociations` return `[]`. Guard both cases.
- **Use AND associations to narrow results** — Combine associations (e.g., user + room) to find precisely scoped records.
- **Store references via associations, not inline IDs in `data`** — Associations are indexed and queryable; IDs buried inside `data` are not.
- **Persist with matching associations** — When writing data via `IPersistence`, attach the same associations you will later use for reading.

---

## Common Mistakes

- **Assuming `read(id)` always returns an item** → It returns `null` for missing records. Always null-check.
- **Treating `readByAssociations` as OR logic** → It is AND: a record must have all listed associations to match.
- **Forgetting association models** → Always use `RocketChatAssociationModel.ROOM`, not the raw string `'room'`.
- **Using the wrong accessor** → `IPersistenceRead` is read-only. Use `IPersistence` (from `persistenceReader`) or `IPersistenceCreate` / `IPersistenceUpdate` for writes.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [IModify Accessor](./i-modify-accessor.md)
- [IPersistence](./i-persistence.md)
- [RocketChatAssociationRecord](../metadata/rocket-chat-associations.md)
