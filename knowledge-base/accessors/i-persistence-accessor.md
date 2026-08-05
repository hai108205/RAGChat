# IPersistence Accessor

## Purpose

`IPersistence` provides CRUD (Create, Read, Update, Delete) access to the App's dedicated persistent storage. Data is stored as JSON-serializable objects, uniquely identified by generated IDs, and can be associated with Rocket.Chat domain records (rooms, users, messages, etc.) for efficient queries.

---

## Overview

Every Rocket.Chat App gets its own isolated persistent storage. An App cannot read or modify another App's data — the storage is fully sandboxed by App ID. All data must be an object (not a primitive string, number, or array). All methods return Promises.

Associations (via `RocketChatAssociationRecord`) link stored records to Rocket.Chat entities. For example, you can associate a "note" with a specific room, user, or message. The `IPersistenceRead` accessor (via `IRead`) then lets you query records by those associations.

---

## When To Use

- Saving app configuration or state across restarts
- Storing user preferences per-room or per-user
- Caching external API responses
- Logging app activity for later retrieval
- Persisting form submissions or survey responses
- Any data that needs to survive App restarts

---

## Important Interfaces

### IPersistence

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `(data: object)` | `Promise<string>` | Create a record. Returns the generated ID. |
| `createWithAssociation` | `(data: object, association: RocketChatAssociationRecord)` | `Promise<string>` | Create a record associated with one Rocket.Chat entity. |
| `createWithAssociations` | `(data: object, associations: Array<RocketChatAssociationRecord>)` | `Promise<string>` | Create a record associated with multiple entities (AND logic). |
| `update` | `(id: string, data: object, upsert?: boolean)` | `Promise<string>` | Update a record by ID. Throws if not found (unless `upsert: true`). |
| `updateByAssociation` | `(association: RocketChatAssociationRecord, data: object, upsert?: boolean)` | `Promise<string>` | Update records matching one association. |
| `updateByAssociations` | `(associations: Array<RocketChatAssociationRecord>, data: object, upsert?: boolean)` | `Promise<string>` | Update records matching all given associations (AND logic). |
| `remove` | `(id: string)` | `Promise<object>` | Remove a record by ID. Returns the removed record. |
| `removeByAssociation` | `(association: RocketChatAssociationRecord)` | `Promise<Array<object>>` | Remove all records matching one association. Returns removed records. |
| `removeByAssociations` | `(associations: Array<RocketChatAssociationRecord>)` | `Promise<Array<object>>` | Remove all records matching all given associations (AND). Returns removed records. |

### RocketChatAssociationRecord

```typescript
class RocketChatAssociationRecord {
    constructor(model: RocketChatAssociationModel, id: string);

    getModel(): RocketChatAssociationModel;
    getID(): string;
}
```

### RocketChatAssociationModel

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

## Typical Workflow

1. Receive `persistence: IPersistence` in a lifecycle hook or event handler
2. For creation: call `create(data)` or `createWithAssociation(data, association)`
3. For updates: first look up the record ID (via `IPersistenceRead`), then call `update(id, newData)`
4. For deletion: call `remove(id)` or `removeByAssociation(association)`
5. `await` all calls — every method returns a Promise

---

## Examples

### Creating and Updating a Simple Record

```typescript
import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationRecord,
    RocketChatAssociationModel,
} from '@rocket.chat/apps-engine/definition/metadata';

async function saveAndUpdate(
    persistence: IPersistence,
    persistenceRead: IPersistenceRead,
): Promise<void> {
    // Create a record — data must be an object
    const id: string = await persistence.create({
        counter: 0,
        label: 'My Counter',
        lastUpdated: new Date().toISOString(),
    });

    // Later: update the record
    const newId: string = await persistence.update(id, {
        counter: 1,
        label: 'My Counter',
        lastUpdated: new Date().toISOString(),
    });

    // Upsert: create if not found, update if exists
    await persistence.update(
        'possibly-missing-id',
        { counter: 42, label: 'Force Created' },
        true,  // upsert = true
    );
}
```

### Creating Data Associated with a Room

```typescript
async function saveRoomNote(
    persistence: IPersistence,
    roomId: string,
    noteText: string,
): Promise<string> {
    const association = new RocketChatAssociationRecord(
        RocketChatAssociationModel.ROOM,
        roomId,
    );

    const recordId = await persistence.createWithAssociation(
        {
            type: 'room-note',
            text: noteText,
            createdAt: new Date().toISOString(),
        },
        association,
    );

    return recordId;
}
```

### Creating Data with Multiple Associations

```typescript
async function saveUserMessageNote(
    persistence: IPersistence,
    userId: string,
    messageId: string,
    note: string,
): Promise<string> {
    const associations = [
        new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId),
        new RocketChatAssociationRecord(RocketChatAssociationModel.MESSAGE, messageId),
    ];

    const recordId = await persistence.createWithAssociations(
        {
            type: 'message-highlight',
            note: note,
            createdAt: new Date().toISOString(),
        },
        associations,
    );

    return recordId;
}
```

### Removing Records by Association

```typescript
async function clearRoomData(
    persistence: IPersistence,
    roomId: string,
): Promise<Array<object>> {
    const association = new RocketChatAssociationRecord(
        RocketChatAssociationModel.ROOM,
        roomId,
    );

    // Removes ALL records associated with this room
    const removedRecords = await persistence.removeByAssociation(association);
    console.log(`Removed ${removedRecords.length} records`);

    return removedRecords;
}
```

---

## Best Practices

- **Data must be an object** — Wrapping primitives in an object (`{ value: 42 }`) works. Passing a raw string or number will throw.
- **Use associations for queryability** — Records without associations can only be retrieved by ID. Use `RocketChatAssociationRecord` to link data to rooms, users, or messages for easy retrieval.
- **Use `upsert: true` sparingly** — It can mask bugs where a record ID should exist but doesn't. Prefer explicit create/update when possible.
- **No cross-app access** — An App can only see its own data. Do not attempt to read another App's records.
- **Use `IPersistenceRead` for queries** — `IPersistence` is for writes. Use `read.getPersistenceReader()` for reading and searching.
- **Return value of `update`** — Returns the ID of the updated/upserted record, not the data itself.

---

## Common Mistakes

- **Passing a primitive as data** → `persistence.create('Hello')` will error. Use `persistence.create({ value: 'Hello' })`.
- **Forgetting to `await`** → Creating/updating without `await` means the operation races and the ID is never captured.
- **Assuming association updates replace** → `createWithAssociation` always creates a new record. To update an existing associated record, find it first, then call `update` by ID.
- **Mixing up `IPersistence` (write) and `IPersistenceRead` (read)** → `IPersistence` only has write methods (create/update/remove). Use `read.getPersistenceReader()` for querying.
- **Using `removeByAssociation` with multiple associations as OR** → Multiple associations act as AND. A record must have ALL specified associations to be removed.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [IPersistenceRead](./persistence-reader.md)
- [IModify Accessor](./i-modify-accessor.md)
- [RocketChatAssociationRecord](../../../packages/apps-engine/src/definition/metadata/RocketChatAssociations.ts)
