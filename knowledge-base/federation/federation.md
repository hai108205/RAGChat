# Federation

Federation connects Rocket.Chat instances across different servers. The `FederationLookup` type appears on rooms and users to indicate their federation origin.

---

## FederationLookup Type

```typescript
export type FederationLookup = {
    version: number;  // Federation protocol version
    mrid: string;     // Matrix Room ID (MRID) -- the federated identifier
    origin: string;   // Origin server domain (e.g., 'matrix.example.com')
};
```

---

## Where It Appears

### On IRoom

Federated rooms have a `federation` property. Use it to check if a room originates from an external server:

```typescript
const room = await read.getRoomReader().getById(roomId);
if (room.federation) {
    console.log(`Federated room from ${room.federation.origin}`);
    console.log(`MRID: ${room.federation.mrid}`);
    console.log(`Protocol v${room.federation.version}`);
}
```

### On IUser

Federated users also carry the `federation` property:

```typescript
const user = await read.getUserReader().getById(userId);
if (user.federation) {
    console.log(`Federated user from ${user.federation.origin}`);
    console.log(`MRID: ${user.federation.mrid}`);
}
```

---

## Checking Federation Status

```typescript
function isFederated(entity: IRoom | IUser): boolean {
    return entity.federation != null;
}

// Specific checks:
if (room.federation?.origin === 'matrix.example.com') {
    // Room comes from a known federation peer
}
```

---

## Handling Federated Rooms and Users

When a room or user is federated, certain operations may behave differently. Always check `federation` before performing actions that might not apply to external entities.

```typescript
import { IPreMessageSentPrevent } from '@rocket.chat/apps-engine/definition/messages';

class FederationAwareFilter implements IPreMessageSentPrevent {
    async checkPreMessageSentPrevent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        const room = await read.getRoomReader().getById(message.room.id);
        // Only apply this filter to non-federated rooms
        return !room?.federation;
    }

    async executePreMessageSentPrevent(
        message: IMessage, read: IRead, http: IHttp, persistence: IPersistence,
    ): Promise<boolean> {
        // Filter logic for local rooms only
        return false;
    }
}
```

---

## Example: Federation-Aware Notification

Skip notifications for federated rooms where the user is remote:

```typescript
import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';

class LocalRoomNotifier implements IPostMessageSent {
    async executePostMessageSent(
        message: IMessage, read: IRead, http: IHttp,
        persistence: IPersistence, modify: IModify,
    ): Promise<void> {
        const room = await read.getRoomReader().getById(message.room.id);

        // Skip for federated rooms
        if (room?.federation) return;

        // Send notification to local users
        const notifier = read.getNotifier();
        const notifMsg = notifier.getMessageBuilder()
            .setText('New message in local room')
            .setRoom(message.room)
            .setSender(await read.getUserReader().getAppUser())
            .getMessage();

        await notifier.notifyRoom(message.room, notifMsg);
    }
}
```
