# IRead Accessor

## Purpose

`IRead` is the read-only gateway to Rocket.Chat's data. It provides 15 specialized sub-readers covering messages, rooms, users, persistence, environment, livechat, uploads, video conferences, OAuth apps, roles, contacts, and more.

---

## Overview

Every Rocket.Chat lifecycle hook that receives `read: IRead` can access any of the 15 sub-readers. Each sub-reader is a focused interface for a specific domain. For example, `read.getRoomReader()` returns an `IRoomRead` instance for querying rooms.

`IRead` is safe to inject anywhere — it is idempotent, extensible, and provides only read access (no mutations).

---

## When To Use

- Reading messages from a room → `read.getMessageReader()`
- Getting a user by ID → `read.getUserReader().getById()`
- Querying room information → `read.getRoomReader()`
- Reading persisted app data → `read.getPersistenceReader()`
- Accessing app/server settings → `read.getEnvironmentReader()`
- Getting the notifier → `read.getNotifier()`
- Reading livechat data → `read.getLivechatReader()`
- Checking uploads → `read.getUploadReader()`

---

## Important Interfaces

| Sub-Reader | Accessor Method | Return Type | Purpose |
|------------|----------------|-------------|---------|
| Environment Reader | `getEnvironmentReader()` | `IEnvironmentRead` | App settings, server settings, env variables |
| Thread Reader | `getThreadReader()` | `IThreadRead` | Thread metadata and messages |
| Message Reader | `getMessageReader()` | `IMessageRead` | Query messages by room, date, etc. |
| Persistence Reader | `getPersistenceReader()` | `IPersistenceRead` | Read stored app data |
| Room Reader | `getRoomReader()` | `IRoomRead` | Query rooms, members, metadata |
| User Reader | `getUserReader()` | `IUserRead` | Query users by ID, username, app user |
| Notifier | `getNotifier()` | `INotifier` | Send notifications to users/rooms |
| Livechat Reader | `getLivechatReader()` | `ILivechatRead` | Livechat rooms, visitors, departments |
| Upload Reader | `getUploadReader()` | `IUploadRead` | Query uploaded files |
| Cloud Workspace Reader | `getCloudWorkspaceReader()` | `ICloudWorkspaceRead` | Workspace tokens |
| Video Conference Reader | `getVideoConferenceReader()` | `IVideoConferenceRead` | Active video conferences |
| OAuth Apps Reader | `getOAuthAppsReader()` | `IOAuthAppsReader` | OAuth app configurations |
| Role Reader | `getRoleReader()` | `IRoleRead` | Role definitions |
| Contact Reader | `getContactReader()` | `IContactRead` | Contact information |
| Experimental Reader | `getExperimentalReader()` | `IExperimentalRead` | Unstable/experimental features |

---

## Typical Workflow

1. Receive `read: IRead` in a lifecycle hook or event handler
2. Call the appropriate `get*Reader()` method
3. Use the returned reader to perform queries
4. All reader methods return Promises — always `await`

---

## Example

```typescript
import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

async function processMessage(
    message: IMessage,
    read: IRead,
    modify: IModify
): Promise<void> {
    // Get all the readers you need
    const roomReader = read.getRoomReader();
    const userReader = read.getUserReader();
    const messageReader = read.getMessageReader();
    const settingsReader = read.getEnvironmentReader().getSettings();

    // Read room info
    const room = await roomReader.getById(message.room.id);

    // Read sender info
    const sender = await userReader.getById(message.sender.id);

    // Read app setting
    const prefix = await settingsReader.getValueById('message-prefix');

    // Read recent messages
    const recentMessages = await messageReader.getByRoom(room.id, { limit: 5 });

    // Read persisted app data
    const storedData = await read.getPersistenceReader().readByAssociation(
        new RocketChatAssociationRecord(
            RocketChatAssociationModel.ROOM,
            room.id
        )
    );
}
```

---

## Best Practices

- **Get readers once per function** — Don't call `read.getRoomReader()` inside loops.
- **Handle null returns** — Most `getById()` methods return `null` for missing records.
- **Use `getNotifier()`** for user-facing notifications (separate from sending messages).
- **Use `getPersistenceReader()`** instead of raw storage — associations enable efficient queries.

---

## Common Mistakes

- **Assuming data exists** → Always check for `null` from `getById()` calls.
- **Using readers for mutations** → IRead is read-only. Use IModify for writes.
- **Reading in the constructor** → Data is not available until lifecycle hooks.

---

## Related Topics

- [IModify Accessor](./i-modify-accessor.md)
- [IEnvironmentRead Accessor](./i-environment-read.md)
- [Message Reader](./message-reader.md)
- [Room Reader](./room-reader.md)
- [User Reader](./user-reader.md)
