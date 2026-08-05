# Persistence Guide

Apps Engine provides persistent key-value storage scoped to your app. Data written by your app is not accessible by other apps.

---

## RocketChatAssociationRecord

Associate stored data with Rocket.Chat entities (rooms, users, messages, etc.) so you can query by those associations later.

```typescript
import {
    RocketChatAssociationRecord,
    RocketChatAssociationModel,
} from '@rocket.chat/apps-engine/definition/metadata';

// constructor(model, id)
const userAssoc = new RocketChatAssociationRecord(
    RocketChatAssociationModel.USER,
    'userId123',
);
```

### RocketChatAssociationModel Enum

| Value | Description |
|---|---|
| `ROOM` | A chat room (channel, group, DM) |
| `DISCUSSION` | A discussion thread |
| `MESSAGE` | A chat message |
| `LIVECHAT_MESSAGE` | A livechat/omnichannel message |
| `USER` | A Rocket.Chat user |
| `FILE` | An uploaded file |
| `MISC` | Miscellaneous/uncategorized generic data |
| `VIDEO_CONFERENCE` | A video conference session |

---

## Association Patterns

### Single Association (store per-user data)

```typescript
const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
const recordId = await persis.createWithAssociation({ theme: 'dark', volume: 80 }, assoc);
```

### Multiple Associations (combined user+room data)

Data must have ALL associations to match -- AND logic.

```typescript
const assocs = [
    new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId),
    new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId),
];
const recordId = await persis.createWithAssociations({ pinned: true, sortOrder: 1 }, assocs);
```

### Storing global/misc data (no entity association)

```typescript
const recordId = await persis.create({ lastRunTimestamp: Date.now() });
```

---

## CRUD Lifecycle

### Create

```typescript
// Create without association -- returns the new record id
const id: string = await persis.create({ key: 'value' });

// Create with single association
const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId);
const id = await persis.createWithAssociation({ settings: {} }, assoc);

// Create with multiple associations
const id = await persis.createWithAssociations(data, [assoc1, assoc2]);
```

### Read

```typescript
// Read by record id -- returns object or falsy if not found
const record: object = await persisRead.read(id);

// Read by association -- returns array (empty if none)
const records: Array<object> = await persisRead.readByAssociation(assoc);

// Read by multiple associations -- AND logic
const records: Array<object> = await persisRead.readByAssociations([assoc1, assoc2]);
```

### Update

```typescript
// Update by id -- upsert=true creates the record if it does not exist
const id = await persis.update(existingId, { updated: true }, true);

// Update by association
const id = await persis.updateByAssociation(assoc, newData, true);

// Update by multiple associations
const id = await persis.updateByAssociations([assoc1, assoc2], newData, true);
```

### Remove

```typescript
// Remove by id -- returns the removed record
const removed: object = await persis.remove(id);

// Remove by association -- returns array of removed records
const removed: Array<object> = await persis.removeByAssociation(assoc);

// Remove by multiple associations -- AND logic
const removed: Array<object> = await persis.removeByAssociations([assoc1, assoc2]);
```

---

## Data Ownership

- Data is scoped to your app. No other app can read or modify it.
- On app uninstall, all persistent data is removed automatically. However, you should clean up in `onUninstall` if you need to handle cascading effects.

---

## Best Practices

### 1. Use Specific Associations

Prefer `new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId)` over `MISC` for user-specific data. Specific associations let you query with `readByAssociation` later.

### 2. Clean Up on Uninstall

Although the platform deletes all data on uninstall, clean up any external references:

```typescript
import { IAppUninstallationContext } from '@rocket.chat/apps-engine/definition/accessors';

export class MyApp implements IApp {
    public async onUninstall(context: IAppUninstallationContext): Promise<void> {
        // Cleanup logic (e.g., notify external service)
    }
}
```

### 3. Handle Upsert

Always pass `upsert = true` during `update`/`updateByAssociation` unless you are certain the record already exists. Otherwise it throws.

### 4. Store Objects, Not Primitives

The `data` parameter in `create` and `update` must be an object. Passing a primitive (string, number) throws an error.

### 5. Avoid Storing Sensitive Data

Persistent storage is not encrypted. Do not store secrets, tokens, or PII.

---

## Complete Examples

### Storing Room Preferences

```typescript
import {
    RocketChatAssociationRecord,
    RocketChatAssociationModel,
} from '@rocket.chat/apps-engine/definition/metadata';

interface RoomPrefs {
    languageFilter: boolean;
    autoTranslate: boolean;
    notificationLevel: 'all' | 'mentions' | 'none';
}

class RoomPrefsManager {
    constructor(private read: IRead, private persistence: IPersistence) {}

    async savePrefs(roomId: string, prefs: RoomPrefs): Promise<string> {
        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.ROOM,
            roomId,
        );
        // Upsert: create if first time, update if already exists
        return this.persistence.updateByAssociation(assoc, prefs, true);
    }

    async getPrefs(roomId: string): Promise<RoomPrefs | null> {
        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.ROOM,
            roomId,
        );
        const results = await this.read.getPersistenceReader().readByAssociation(assoc);
        return results.length > 0 ? (results[0] as RoomPrefs) : null;
    }

    async deletePrefs(roomId: string): Promise<void> {
        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.ROOM,
            roomId,
        );
        await this.persistence.removeByAssociation(assoc);
    }
}
```

### Storing User Notification Settings

```typescript
interface NotifySettings {
    email: boolean;
    push: boolean;
    desktop: boolean;
    muteUntil: number | null; // epoch ms
}

async function saveUserNotifications(
    userId: string,
    read: IRead,
    persistence: IPersistence,
    settings: NotifySettings,
): Promise<string> {
    const assoc = new RocketChatAssociationRecord(
        RocketChatAssociationModel.USER,
        userId,
    );
    return persistence.updateByAssociation(assoc, settings, true);
}

async function getUserNotifications(
    userId: string,
    read: IRead,
): Promise<NotifySettings | null> {
    const assoc = new RocketChatAssociationRecord(
        RocketChatAssociationModel.USER,
        userId,
    );
    const records = await read.getPersistenceReader().readByAssociation(assoc);
    return records.length > 0 ? (records[0] as NotifySettings) : null;
}
```

---

## Accessing Persistence in Handlers

```typescript
// Read-only persistence via IRead
const persisRead = read.getPersistenceReader();
const data = await persisRead.readByAssociation(assoc);

// Write persistence via IPersistence (injected in handler methods)
// IPreMessageSentPrevent.executePreMessageSentPrevent(
//     message: IMessage, read: IRead, http: IHttp, persistence: IPersistence
// )
const recordId = await persistence.createWithAssociation(data, assoc);
```

Both `IPersistence` and `IPersistenceRead` are available as handler method parameters. Do not confuse them -- `IPersistenceRead` is read-only; `IPersistence` provides write and remove methods.
