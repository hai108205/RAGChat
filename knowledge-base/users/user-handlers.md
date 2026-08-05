# User Event Handlers

## Purpose

Post-user event handlers let your App react to user lifecycle events -- creation, updates, deletion, login, logout, and status changes. All are **notification-only**: they fire after the event has already happened, and they cannot prevent or modify the event.

---

## Overview

When a user is created, updated, deleted, logs in, logs out, or changes presence status, Rocket.Chat fires the corresponding `IPostUser*` event. Your App implements the relevant interface, and the framework calls your handler with context about what happened and who did it.

**Key principle**: These handlers return `Promise<void>`. You cannot cancel the underlying event. Use them for side effects like logging, analytics, notifications, or syncing with external systems.

---

## When To Use

- Logging user account activity to an external audit system
- Sending welcome emails or notifications when a user is created
- Syncing user profile changes to an external CRM or directory
- Tracking login/logout timestamps for analytics
- Triggering workflows based on user status changes (e.g., escalate when agent goes offline)
- Auditing who performed user modifications (the `performedBy` field)

---

## Important Interfaces

| Interface | Event | Context | Method Key |
|-----------|-------|---------|------------|
| `IPostUserCreated` | User saved to DB | `IUserContext` | `executePostUserCreated` |
| `IPostUserUpdated` | User updated in DB | `IUserContext` | `executePostUserUpdated` |
| `IPostUserDeleted` | User removed from DB | `IUserContext` | `executePostUserDeleted` |
| `IPostUserLoggedIn` | User logs in | `IUser` | `executePostUserLoggedIn` |
| `IPostUserLoggedOut` | User logs out | `IUser` | `executePostUserLoggedOut` |
| `IPostUserStatusChanged` | Presence changes | `IUserStatusContext` | `executePostUserStatusChanged` |
| `IUserContext` | CRUD event context | `user` + `performedBy` | -- |
| `IUserStatusContext` | Status event context | `user` + `currentStatus` + `previousStatus` | -- |

---

## IUserContext

```typescript
export interface IUserContext {
    /** The user that was affected by the update */
    user: IUser;
    /** The user that performed the updates (who did it) */
    performedBy?: IUser;
}
```

Used by: `IPostUserCreated`, `IPostUserUpdated`, `IPostUserDeleted`

---

## IUserStatusContext

```typescript
export interface IUserStatusContext {
    /** The user whose status changed */
    user: IUser;
    /** The new status (e.g. "online", "away", "busy", "offline") */
    currentStatus: string;
    /** The status before the change */
    previousStatus: string;
}
```

Used by: `IPostUserStatusChanged`

Does **not** fire when a custom status message changes -- only when the presence status changes (online, away, busy, offline).

---

## IPostUserCreated

**Fires**: After a new user is saved to the database.

**Context**: `IUserContext` -- contains the newly created `user` and the `performedBy` user (if the creation was triggered by another user, e.g. an admin). For self-registration, `performedBy` may be undefined.

**Can modify?** No. This is a notification-only handler. Return `Promise<void>`.

**Example**:

```typescript
import { IPostUserCreated, IUserContext, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/users';
import { IAppAccessors } from '@rocket.chat/apps-engine/definition/accessors';

export class MyApp implements IPostUserCreated {
    public async executePostUserCreated(
        context: IUserContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const newUser = context.user;
        const createdBy = context.performedBy;

        console.log(`User created: ${newUser.username} (${newUser.id})`);
        if (createdBy) {
            console.log(`Created by: ${createdBy.username}`);
        }

        // Side effect: send welcome message via external service
        await http.post('https://my-service.example.com/new-user-webhook', {
            data: {
                userId: newUser.id,
                username: newUser.username,
                email: newUser.emails?.[0]?.address,
            },
        });
    }
}
```

---

## IPostUserUpdated

**Fires**: After an existing user is updated and saved to the database.

**Context**: `IUserContext` -- contains the updated `user` (with all current values) and the `performedBy` user who made the change. The context does not include the previous values -- only the current state.

**Can modify?** No. Notification-only.

**Example**:

```typescript
import { IPostUserUpdated, IUserContext, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/users';

export class MyApp implements IPostUserUpdated {
    public async executePostUserUpdated(
        context: IUserContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const updatedUser = context.user;
        const performedBy = context.performedBy;

        console.log(`User updated: ${updatedUser.username}`);
        console.log(`New name: ${updatedUser.name}`);
        console.log(`Roles: ${updatedUser.roles.join(', ')}`);

        // Sync profile changes to external system
        await http.put(`https://crm.example.com/users/${updatedUser.id}`, {
            data: {
                name: updatedUser.name,
                email: updatedUser.emails?.[0]?.address,
                roles: updatedUser.roles,
            },
        });
    }
}
```

---

## IPostUserDeleted

**Fires**: After a user is removed from the database.

**Context**: `IUserContext` -- contains the deleted `user` (the last known state) and the `performedBy` user who performed the deletion.

**Can modify?** No. Notification-only. The user no longer exists in the database at this point, so reading the user again by ID will fail.

**Example**:

```typescript
import { IPostUserDeleted, IUserContext, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/users';

export class MyApp implements IPostUserDeleted {
    public async executePostUserDeleted(
        context: IUserContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const deletedUser = context.user;
        const deletedBy = context.performedBy;

        console.log(`User deleted: ${deletedUser.username} (${deletedUser.id})`);

        // Clean up external resources belonging to this user
        await http.delete(`https://my-service.example.com/users/${deletedUser.id}`);

        // Store deletion audit record
        const auditEntry = {
            action: 'user_deleted',
            userId: deletedUser.id,
            username: deletedUser.username,
            performedBy: deletedBy?.id,
            timestamp: new Date(),
        };
        await persis.update(`audit-${deletedUser.id}`, auditEntry);
    }
}
```

---

## IPostUserLoggedIn

**Fires**: After a user successfully authenticates and logs into Rocket.Chat.

**Context**: `IUser` -- the user who logged in (directly, not wrapped in a context object).

**Can modify?** No. Notification-only.

**Note**: Unlike the CRUD events, the context is the `IUser` object itself, not an `IUserContext`. There is no `performedBy` field.

**Example**:

```typescript
import { IPostUserLoggedIn, IUser, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/users';

export class MyApp implements IPostUserLoggedIn {
    public async executePostUserLoggedIn(
        context: IUser,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        console.log(`User logged in: ${context.username} at ${new Date().toISOString()}`);

        // Track login for analytics
        await http.post('https://analytics.example.com/events', {
            data: {
                event: 'user_login',
                userId: context.id,
                username: context.username,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## IPostUserLoggedOut

**Fires**: After a user logs out of Rocket.Chat.

**Context**: `IUser` -- the user who logged out (directly).

**Can modify?** No. Notification-only.

**Example**:

```typescript
import { IPostUserLoggedOut, IUser, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/users';

export class MyApp implements IPostUserLoggedOut {
    public async executePostUserLoggedOut(
        context: IUser,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        console.log(`User logged out: ${context.username}`);

        // Clear session tracking in external system
        await http.delete(`https://my-service.example.com/sessions/${context.id}`);
    }
}
```

---

## IPostUserStatusChanged

**Fires**: After a user changes their presence status. The valid statuses are `online`, `away`, `busy`, and `offline`.

**Does NOT fire** when the custom status message changes -- only when the presence status itself changes.

**Context**: `IUserStatusContext` -- contains the `user`, the `currentStatus`, and the `previousStatus`.

**Can modify?** No. Notification-only.

**Example**:

```typescript
import {
    IPostUserStatusChanged,
    IUserStatusContext,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/users';

export class MyApp implements IPostUserStatusChanged {
    public async executePostUserStatusChanged(
        context: IUserStatusContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { user, currentStatus, previousStatus } = context;

        console.log(`Status change: ${user.username} went from ${previousStatus} to ${currentStatus}`);

        // Escalate if an agent goes offline during business hours
        if (currentStatus === 'offline' && user.roles.includes('livechat-agent')) {
            await http.post('https://escalation.example.com/alerts', {
                data: {
                    alert: 'agent_offline',
                    agentId: user.id,
                    agentName: user.name,
                    timestamp: new Date().toISOString(),
                },
            });
        }

        // Track availability for workforce management
        await http.post('https://wfm.example.com/presence', {
            data: {
                userId: user.id,
                status: currentStatus,
                previousStatus,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## Summary

| Handler | Fires When | Context Type | Includes `performedBy`? |
|---------|------------|--------------|------------------------|
| `IPostUserCreated` | User saved to DB | `IUserContext` | Yes |
| `IPostUserUpdated` | User saved (update) | `IUserContext` | Yes |
| `IPostUserDeleted` | User removed from DB | `IUserContext` | Yes |
| `IPostUserLoggedIn` | User authenticates | `IUser` | No |
| `IPostUserLoggedOut` | User session ends | `IUser` | No |
| `IPostUserStatusChanged` | Presence changes | `IUserStatusContext` | No |

All handlers are **post-event, notification-only**. They cannot prevent or modify the underlying event. Throw an error only to signal an internal failure in your handler, not to cancel the event -- the event already completed before your handler runs.
