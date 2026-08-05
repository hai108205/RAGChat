# Room Event Handlers

Reference for all room-related event handler interfaces in the Rocket.Chat Apps Engine. Each interface corresponds to an `AppMethod` enum value.

---

## Handler Lifecycle Pattern

Most Pre-* handlers follow a two-phase lifecycle:

1. **`check*`** (optional) — Gate method. Receives `(room, read, http)`. Returns `Promise<boolean>`. When it returns `false`, the framework skips the `execute*` method for this handler instance.
2. **`execute*`** (required) — Action method. Receives the full context: `(room, read, http, persistence, ...extras)`.

The execution order across multiple handlers of the same type is: Prevent -> Extend -> Modify -> Post.

---

## Group: Pre-Room Create

Handlers that run before a room is created.

### `IPreRoomCreatePrevent`

- **Method**: `checkPreRoomCreatePrevent?` / `executePreRoomCreatePrevent`
- **Fires**: Before a room (channel, group, DM) is created.
- **Can block**: Yes — return `true` to prevent room creation.
- **Can modify**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreRoomCreatePrevent } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class LimitRoomCount implements IPreRoomCreatePrevent {
    public async checkPreRoomCreatePrevent(
        room: IRoom,
        read: IRead,
        http: IHttp,
    ): Promise<boolean> {
        // Only apply to public channels
        return room.type === "c";
    }

    public async executePreRoomCreatePrevent(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<boolean> {
        // Count existing rooms of this type
        const rooms = await read.getRoomReader().getByType(room.type);
        const maxRooms = 50;
        return rooms.length >= maxRooms;
    }
}
```

### `IPreRoomCreateExtend`

- **Method**: `checkPreRoomCreateExtend?` / `executePreRoomCreateExtend`
- **Fires**: Before a room is created.
- **Can block**: No (unless you throw).
- **Can modify**: Yes — non-destructive enrichment via `IRoomExtender`.
- **Accessors**: `IRoomExtender`, `IRead`, `IHttp`, `IPersistence`
- **Returns**: `Promise<IRoom>`

```typescript
import { IPreRoomCreateExtend } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead, IRoomExtender } from "@rocket.chat/apps-engine/definition/accessors";

export class AddRoomMetadata implements IPreRoomCreateExtend {
    public async executePreRoomCreateExtend(
        room: IRoom,
        extend: IRoomExtender,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IRoom> {
        return extend
            .addCustomField("createdByApp", "my-app-id")
            .addCustomField("region", "us-east")
            .getRoom();
    }
}
```

### `IPreRoomCreateModify`

- **Method**: `checkPreRoomCreateModify?` / `executePreRoomCreateModify`
- **Fires**: Before a room is created.
- **Can block**: No (unless you throw).
- **Can modify**: Yes — destructive modification via `IRoomBuilder`.
- **Accessors**: `IRoomBuilder`, `IRead`, `IHttp`, `IPersistence`
- **Returns**: `Promise<IRoom>`

```typescript
import { IPreRoomCreateModify } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead, IRoomBuilder } from "@rocket.chat/apps-engine/definition/accessors";

export class EnforceNamingConvention implements IPreRoomCreateModify {
    public async executePreRoomCreateModify(
        room: IRoom,
        builder: IRoomBuilder,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IRoom> {
        // Ensure room name has prefix
        const displayName = room.displayName || room.slugifiedName || "";
        if (room.type === "c" && !displayName.startsWith("team-")) {
            return builder.setDisplayName(`team-${displayName}`).getRoom();
        }
        return builder.getRoom();
    }
}
```

---

## Post-Room Create

### `IPostRoomCreate`

- **Method**: `checkPostRoomCreate?` / `executePostRoomCreate`
- **Fires**: After a room is successfully created.
- **Can block**: No — the room already exists.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify`
- **Returns**: `Promise<void>`

```typescript
import { IPostRoomCreate } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class WelcomeNewRoom implements IPostRoomCreate {
    public async executePostRoomCreate(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const message = modify
            .getCreator()
            .startMessage()
            .setRoom(room)
            .setText(`Welcome to #${room.displayName || room.slugifiedName}! :tada:`);
        await modify.getCreator().finish(message);
    }
}
```

---

## Group: Pre-Room Delete

### `IPreRoomDeletePrevent`

- **Method**: `checkPreRoomDeletePrevent?` / `executePreRoomDeletePrevent`
- **Fires**: Before a room is deleted.
- **Can block**: Yes — return `true` to prevent deletion.
- **Can modify**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreRoomDeletePrevent } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class ProtectImportantRooms implements IPreRoomDeletePrevent {
    private protectedNames = ["general", "announcements", "random"];

    public async executePreRoomDeletePrevent(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<boolean> {
        const name = room.slugifiedName || "";
        return this.protectedNames.includes(name);
    }
}
```

---

## Post-Room Deleted

### `IPostRoomDeleted`

- **Method**: `checkPostRoomDeleted?` / `executePostRoomDeleted`
- **Fires**: After a room is deleted.
- **Can block**: No.
- **Accessors**: `IRead`, `IHttp`, `IPersistence`
- **Note**: Does not receive `IModify` — you cannot send messages to a deleted room.
- **Returns**: `Promise<void>`

```typescript
import { IPostRoomDeleted } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class AuditRoomDeletion implements IPostRoomDeleted {
    public async executePostRoomDeleted(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        console.log(`Room deleted: ${room.displayName || room.slugifiedName} (${room.id})`);

        // Forward to external audit service
        await http.post("https://audit.example.com/room-deleted", {
            data: { roomId: room.id, roomName: room.displayName, timestamp: new Date().toISOString() },
        });
    }
}
```

---

## Group: Room User Events

These handlers fire when users join or leave a room. They use typed context objects (`IRoomUserJoinedContext` / `IRoomUserLeaveContext`) instead of raw `IRoom`. Pre-handlers **do not** have a `check*` gate method — they use exceptions to block.

### Blocking Pattern for User Events

Unlike `IPre*Prevent` handlers that return `boolean`, the user join/leave pre-handlers block by **throwing** inside `executePre*`:

```typescript
import { UserNotAllowedException } from "@rocket.chat/apps-engine/definition/exceptions";

// Inside executePreRoomUserJoined or executePreRoomUserLeave:
throw new UserNotAllowedException("User is not allowed to perform this action");
```

---

### `IPreRoomUserJoined`

- **Method**: `executePreRoomUserJoined` (no `check*` guard)
- **Fires**: Before a user joins a room. Not triggered before room creation (use `IPreRoomCreate*` for that).
- **Can block**: Yes — throw `UserNotAllowedException`.
- **Context**: `IRoomUserJoinedContext` — `joiningUser`, `room`, `inviter?` (optional).
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreRoomUserJoined } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoomUserJoinedContext } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { UserNotAllowedException } from "@rocket.chat/apps-engine/definition/exceptions";

export class RestrictChannelAccess implements IPreRoomUserJoined {
    public async executePreRoomUserJoined(
        context: IRoomUserJoinedContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        // Only admins can join rooms named "confidential-*"
        if (context.room.slugifiedName?.startsWith("confidential-")) {
            const userRoles = context.joiningUser.roles || [];
            if (!userRoles.includes("admin")) {
                throw new UserNotAllowedException(
                    "Only admins can join confidential channels"
                );
            }
        }
    }
}
```

### `IPostRoomUserJoined`

- **Method**: `executePostRoomUserJoined`
- **Fires**: After a user successfully joins a room.
- **Can block**: No.
- **Context**: `IRoomUserJoinedContext` — `joiningUser`, `room`, `inviter?` (optional).
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify` (optional)

```typescript
import { IPostRoomUserJoined } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoomUserJoinedContext } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class GreetNewMembers implements IPostRoomUserJoined {
    public async executePostRoomUserJoined(
        context: IRoomUserJoinedContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        if (!modify) return;

        const inviter = context.inviter
            ? ` invited by @${context.inviter.username}`
            : "";
        const message = modify
            .getCreator()
            .startMessage()
            .setRoom(context.room)
            .setText(
                `Welcome @${context.joiningUser.username}! :wave:${inviter}`
            );
        await modify.getCreator().finish(message);
    }
}
```

### `IPreRoomUserLeave`

- **Method**: `executePreRoomUserLeave` (no `check*` guard)
- **Fires**: Before a user leaves a room (or is removed from one).
- **Can block**: Yes — throw `UserNotAllowedException`.
- **Context**: `IRoomUserLeaveContext` — `leavingUser`, `room`, `removedBy?` (optional, set when a user is removed by another user).
- **Accessors**: `IRead`, `IHttp`, `IPersistence`

```typescript
import { IPreRoomUserLeave } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoomUserLeaveContext } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { UserNotAllowedException } from "@rocket.chat/apps-engine/definition/exceptions";

export class PreventOwnerLeaving implements IPreRoomUserLeave {
    public async executePreRoomUserLeave(
        context: IRoomUserLeaveContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        // Prevent the room owner from leaving without transferring ownership
        const roomInfo = await read.getRoomReader().getById(context.room.id);
        if (roomInfo?.creator?.id === context.leavingUser.id) {
            throw new UserNotAllowedException(
                "The room owner must transfer ownership before leaving"
            );
        }
    }
}
```

### `IPostRoomUserLeave`

- **Method**: `executePostRoomUserLeave`
- **Fires**: After a user leaves a room or is removed.
- **Can block**: No.
- **Context**: `IRoomUserLeaveContext` — `leavingUser`, `room`, `removedBy?` (optional).
- **Accessors**: `IRead`, `IHttp`, `IPersistence`, `IModify` (optional)

```typescript
import { IPostRoomUserLeave } from "@rocket.chat/apps-engine/definition/rooms";
import type { IRoomUserLeaveContext } from "@rocket.chat/apps-engine/definition/rooms";
import type { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";

export class FarewellMessage implements IPostRoomUserLeave {
    public async executePostRoomUserLeave(
        context: IRoomUserLeaveContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        if (!modify) return;

        const removalNote = context.removedBy
            ? ` (removed by @${context.removedBy.username})`
            : "";

        const message = modify
            .getCreator()
            .startMessage()
            .setRoom(context.room)
            .setText(
                `@${context.leavingUser.username} has left the room.${removalNote}`
            );
        await modify.getCreator().finish(message);
    }
}
```

---

## Execution Order Summary

For room lifecycle events, the framework dispatches handlers in this order:

```
Room Create:
  1. IPreRoomCreatePrevent    → can block creation
  2. IPreRoomCreateExtend     → non-destructive enrichment
  3. IPreRoomCreateModify     → destructive modification
  4. Room is created
  5. IPostRoomCreate          → post-creation notification

Room Delete:
  1. IPreRoomDeletePrevent    → can block deletion
  2. Room is deleted
  3. IPostRoomDeleted         → post-deletion notification

User Join:
  1. IPreRoomUserJoined       → can block (throws UserNotAllowedException)
  2. User joins the room
  3. IPostRoomUserJoined      → post-join notification

User Leave:
  1. IPreRoomUserLeave        → can block (throws UserNotAllowedException)
  2. User leaves the room
  3. IPostRoomUserLeave       → post-leave notification
```

---

## Registration

Implement the interface in your app's main class. The framework auto-discovers handlers:

```typescript
import { App } from "@rocket.chat/apps-engine/definition/App";
import { IPreRoomCreatePrevent } from "@rocket.chat/apps-engine/definition/rooms";
import { IPostRoomCreate } from "@rocket.chat/apps-engine/definition/rooms";

export class MyRoomApp extends App implements IPreRoomCreatePrevent, IPostRoomCreate {
    // IPreRoomCreatePrevent
    public async executePreRoomCreatePrevent(/* ... */): Promise<boolean> {
        return false;
    }

    // IPostRoomCreate
    public async executePostRoomCreate(/* ... */): Promise<void> {
        // ...
    }
}
```

No explicit registration call needed — implementing the interface is sufficient.
