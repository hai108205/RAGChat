# Livechat Event Handlers

## Purpose

Livechat event handlers let your App react to omnichannel conversation lifecycle events -- rooms starting and closing, agent assignments and transfers, visitor/guest data saving, department management, and room creation prevention.

---

## Overview

Rocket.Chat fires livechat events throughout the lifecycle of an omnichannel conversation. Most handlers are **post-event** (the event has already happened) and are notification-only. One handler -- `IPreLivechatRoomCreatePrevent` -- fires **before** room creation and can cancel it.

The deprecated `ILivechatRoomClosedHandler` is replaced by `IPostLivechatRoomClosed` -- use the newer interface.

---

## When To Use

- Sending a notification when a new livechat room starts
- Logging room closures for reporting and analytics
- Routing work when an agent is assigned or unassigned
- Tracking transfers between agents or departments
- Syncing visitor data to an external CRM when guest info is saved
- Cleaning up external resources when a department is disabled or removed
- Preventing room creation based on business rules (blocked visitors, outside business hours, etc.)

---

## Important Interfaces

| Interface | Event | Context | Pre/Post |
|-----------|-------|---------|----------|
| `IPostLivechatRoomStarted` | Room is started | `ILivechatRoom` | Post |
| `IPostLivechatRoomClosed` | Room is closed | `ILivechatRoom` | Post |
| `IPostLivechatAgentAssigned` | Agent assigned to room | `ILivechatEventContext` | Post |
| `IPostLivechatAgentUnassigned` | Agent unassigned from room | `ILivechatEventContext` | Post |
| `IPostLivechatRoomTransferred` | Room transferred | `ILivechatTransferEventContext` | Post |
| `IPostLivechatGuestSaved` | Visitor/guest info saved | `IVisitor` | Post |
| `IPostLivechatRoomSaved` | Room info saved | `ILivechatRoom` | Post |
| `IPostLivechatDepartmentDisabled` | Department disabled | `ILivechatDepartmentEventContext` | Post |
| `IPostLivechatDepartmentRemoved` | Department removed | `ILivechatDepartmentEventContext` | Post |
| `IPreLivechatRoomCreatePrevent` | Room about to be created | `ILivechatRoom` | **Pre** |
| `ILivechatRoomClosedHandler` | **(DEPRECATED)** Room closed | `ILivechatRoom` | Post |

---

## Context Types

### ILivechatEventContext

```typescript
export interface ILivechatEventContext {
    agent: IUser;
    room: ILivechatRoom;
}
```

Used by: `IPostLivechatAgentAssigned`, `IPostLivechatAgentUnassigned`

### ILivechatTransferEventContext

```typescript
export enum LivechatTransferEventType {
    AGENT = 'agent',
    DEPARTMENT = 'department',
}

export interface ILivechatTransferEventContext {
    type: LivechatTransferEventType;
    room: IRoom;
    from: IUser | IDepartment;
    to: IUser | IDepartment;
}
```

Used by: `IPostLivechatRoomTransferred`

The `from` and `to` types depend on the transfer type:
- `AGENT` transfer: both `from` and `to` are `IUser`
- `DEPARTMENT` transfer: both `from` and `to` are `IDepartment`

### ILivechatDepartmentEventContext

```typescript
export interface ILivechatDepartmentEventContext {
    department: IDepartment;
}
```

Used by: `IPostLivechatDepartmentDisabled`, `IPostLivechatDepartmentRemoved`

---

## IPostLivechatRoomStarted

**Fires**: After a livechat room is created and started. A room starts when a visitor initiates a chat via the widget, API, or any omnichannel source.

**Context**: `ILivechatRoom` -- the newly started room with visitor, department, source, and routing information.

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import { IPostLivechatRoomStarted, ILivechatRoom, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatRoomStarted {
    public async executePostLivechatRoomStarted(
        room: ILivechatRoom,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        console.log(`Livechat room started: ${room.id}`);
        console.log(`Visitor: ${room.visitor.name}`);
        console.log(`Source: ${room.source?.type}`);

        // Notify external system
        await http.post('https://crm.example.com/conversations', {
            data: {
                roomId: room.id,
                visitor: room.visitor,
                source: room.source?.type,
                department: room.department?.name,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## IPostLivechatRoomClosed

**Fires**: After a livechat room is closed. A room can be closed by a user, the visitor, or a bot.

**Context**: `ILivechatRoom` -- the closed room including closure metadata (`closedBy`, `closedAt`, `closer`).

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import { IPostLivechatRoomClosed, ILivechatRoom, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatRoomClosed {
    public async executePostLivechatRoomClosed(
        room: ILivechatRoom,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        console.log(`Livechat room closed: ${room.id}`);
        console.log(`Closed by: ${room.closedBy?.username} (${room.closer})`);
        console.log(`Closed at: ${room.closedAt}`);

        // Send closure webhook
        await http.post('https://reporting.example.com/room-closed', {
            data: {
                roomId: room.id,
                visitor: room.visitor,
                agent: room.servedBy?.id,
                closer: room.closer,
                closedAt: room.closedAt,
                source: room.source?.type,
            },
        });
    }
}
```

---

## IPostLivechatAgentAssigned

**Fires**: After an agent is assigned to a livechat room (manual assignment or automatic routing).

**Context**: `ILivechatEventContext` -- contains the assigned `agent` and the `room`.

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import { IPostLivechatAgentAssigned, ILivechatEventContext, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatAgentAssigned {
    public async executePostLivechatAgentAssigned(
        context: ILivechatEventContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        const { agent, room } = context;

        console.log(`Agent ${agent.username} assigned to room ${room.id}`);
        console.log(`Visitor: ${room.visitor.name}`);

        // Send agent a notification via external system
        await http.post('https://notifications.example.com/agent-alert', {
            data: {
                agentId: agent.id,
                agentName: agent.name,
                roomId: room.id,
                visitorName: room.visitor.name,
                message: 'New livechat conversation assigned to you',
            },
        });
    }
}
```

---

## IPostLivechatAgentUnassigned

**Fires**: After an agent is unassigned from a livechat room.

**Context**: `ILivechatEventContext` -- contains the unassigned `agent` and the `room`.

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import { IPostLivechatAgentUnassigned, ILivechatEventContext, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatAgentUnassigned {
    public async executePostLivechatAgentUnassigned(
        context: ILivechatEventContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        const { agent, room } = context;

        console.log(`Agent ${agent.username} unassigned from room ${room.id}`);

        // Log for workforce management
        await http.post('https://wfm.example.com/agent-unassignment', {
            data: {
                agentId: agent.id,
                roomId: room.id,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## IPostLivechatRoomTransferred

**Fires**: After a livechat room is transferred -- either to another agent or to another department.

**Context**: `ILivechatTransferEventContext` -- includes the transfer `type` (`AGENT` or `DEPARTMENT`), the `room`, and the `from`/`to` (both typed as `IUser | IDepartment` depending on the transfer type).

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import {
    IPostLivechatRoomTransferred,
    ILivechatTransferEventContext,
    LivechatTransferEventType,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatRoomTransferred {
    public async executePostLivechatRoomTransferred(
        context: ILivechatTransferEventContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { type, room, from, to } = context;

        if (type === LivechatTransferEventType.AGENT) {
            console.log(`Room ${room.id} transferred from agent to agent`);
        } else {
            console.log(`Room ${room.id} transferred from department to department`);
        }

        // Log transfer for analytics
        await http.post('https://analytics.example.com/transfers', {
            data: {
                roomId: room.id,
                transferType: type,
                fromId: 'id' in from ? from.id : undefined,
                toId: 'id' in to ? to.id : undefined,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## IPostLivechatGuestSaved

**Fires**: After a visitor/guest's information is saved. This happens when the visitor submits the pre-chat form, when an agent updates visitor details, or when contact resolution merges visitor data.

**Context**: `IVisitor` -- the saved visitor with all current fields.

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import { IPostLivechatGuestSaved, IVisitor, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatGuestSaved {
    public async executePostLivechatGuestSaved(
        context: IVisitor,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        console.log(`Guest saved: ${context.name} (token: ${context.token})`);

        // Sync visitor data to CRM
        await http.post('https://crm.example.com/contacts', {
            data: {
                name: context.name,
                email: context.visitorEmails?.[0]?.address,
                phone: context.phone?.[0]?.phoneNumber,
                customFields: context.customFields,
                livechatData: context.livechatData,
            },
        });
    }
}
```

---

## IPostLivechatRoomSaved

**Fires**: After a livechat room's information is saved/updated. This fires when room metadata changes -- department reassignment, topic edits, tag updates, custom field changes, etc.

**Context**: `ILivechatRoom` -- the saved room with updated fields.

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import { IPostLivechatRoomSaved, ILivechatRoom, IRead, IHttp, IPersistence, IModify } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatRoomSaved {
    public async executePostLivechatRoomSaved(
        context: ILivechatRoom,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        console.log(`Room saved: ${context.id}`);
        console.log(`Department: ${context.department?.name}`);
        console.log(`Served by: ${context.servedBy?.username}`);

        // Sync room updates to external system
        await http.put(`https://crm.example.com/conversations/${context.id}`, {
            data: {
                department: context.department,
                agent: context.servedBy?.id,
                isOpen: context.isOpen,
                isWaitingResponse: context.isWaitingResponse,
            },
        });
    }
}
```

---

## IPostLivechatDepartmentDisabled

**Fires**: After a livechat department is disabled. When a department is disabled, it stops accepting new conversations.

**Context**: `ILivechatDepartmentEventContext` -- contains the disabled `department`.

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import {
    IPostLivechatDepartmentDisabled,
    ILivechatDepartmentEventContext,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatDepartmentDisabled {
    public async executePostLivechatDepartmentDisabled(
        context: ILivechatDepartmentEventContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        const { department } = context;

        console.log(`Department disabled: ${department.name} (${department.id})`);

        // Notify external system about department status change
        await http.post('https://routing.example.com/department-status', {
            data: {
                departmentId: department.id,
                departmentName: department.name,
                enabled: false,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## IPostLivechatDepartmentRemoved

**Fires**: After a livechat department is permanently removed/deleted.

**Context**: `ILivechatDepartmentEventContext` -- contains the removed `department` (last known state).

**Can modify?** No. Post-event notification.

**Example**:

```typescript
import {
    IPostLivechatDepartmentRemoved,
    ILivechatDepartmentEventContext,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPostLivechatDepartmentRemoved {
    public async executePostLivechatDepartmentRemoved(
        context: ILivechatDepartmentEventContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        const { department } = context;

        console.log(`Department removed: ${department.name} (${department.id})`);

        // Clean up external routing rules
        await http.delete(`https://routing.example.com/departments/${department.id}`);
    }
}
```

---

## IPreLivechatRoomCreatePrevent

**Fires**: **Before** a livechat room is about to be created. This is the only livechat event handler that runs **pre**-event and can prevent the action.

**Context**: `ILivechatRoom` -- the room object that is about to be created. Its properties are pre-populated with visitor info, source, department routing, etc.

**Can modify?** No -- but can **prevent**. To stop room creation, throw an `AppsEngineException` (or any error). The error message will be surfaced to the caller.

**Important**: This handler does **not** receive a `modify` parameter. You cannot modify the room before creation. You can only allow it (return normally) or prevent it (throw).

**Example**:

```typescript
import {
    IPreLivechatRoomCreatePrevent,
    ILivechatRoom,
    IRead,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements IPreLivechatRoomCreatePrevent {
    public async executePreLivechatRoomCreatePrevent(
        room: ILivechatRoom,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        console.log(`Livechat room creation requested for visitor: ${room.visitor.name}`);

        // Block room creation outside business hours
        const now = new Date();
        const hour = now.getHours();
        if (hour < 9 || hour >= 17) {
            throw new Error('Livechat is only available during business hours (9 AM - 5 PM).');
        }

        // Block specific visitors
        const blockedDomains = ['spam.example.com', 'competitor.com'];
        const visitorEmail = room.visitor.visitorEmails?.[0]?.address || '';
        const domain = visitorEmail.split('@')[1];
        if (domain && blockedDomains.includes(domain)) {
            throw new Error('Your domain is not allowed to create livechat conversations.');
        }

        // Allow all other room creations
        console.log('Room creation allowed.');
    }
}
```

**Note**: The source interface uses `[AppMethod.EXECUTE_PRE_LIVECHAT_ROOM_CREATE_PREVENT]` as the method key.

---

## ILivechatRoomClosedHandler (DEPRECATED)

**Status**: Deprecated. Use `IPostLivechatRoomClosed` instead.

**Fires**: After a livechat room is closed. Same event as `IPostLivechatRoomClosed`.

**Context**: `ILivechatRoom`

**Differences from `IPostLivechatRoomClosed`**:
- Uses method key `executeLivechatRoomClosedHandler` instead of `executePostLivechatRoomClosed`
- Does **not** receive a `modify` accessor (signature: `data, read, http, persistence`)
- Does not have the `modify?` optional parameter

**Do not use this interface in new code.** Migrate existing handlers to `IPostLivechatRoomClosed`.

```typescript
// DEPRECATED - do not use
import { ILivechatRoomClosedHandler, ILivechatRoom, IRead, IHttp, IPersistence } from '@rocket.chat/apps-engine/definition/livechat';

export class MyApp implements ILivechatRoomClosedHandler {
    public async executeLivechatRoomClosedHandler(
        data: ILivechatRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        // ... handler logic
    }
}
```

---

## Handler Summary

| Handler | Fires When | Can Prevent? | Context |
|---------|------------|--------------|---------|
| `IPostLivechatRoomStarted` | Room started | No | `ILivechatRoom` |
| `IPostLivechatRoomClosed` | Room closed | No | `ILivechatRoom` |
| `IPostLivechatAgentAssigned` | Agent assigned | No | `ILivechatEventContext` |
| `IPostLivechatAgentUnassigned` | Agent unassigned | No | `ILivechatEventContext` |
| `IPostLivechatRoomTransferred` | Room transferred | No | `ILivechatTransferEventContext` |
| `IPostLivechatGuestSaved` | Guest info saved | No | `IVisitor` |
| `IPostLivechatRoomSaved` | Room info saved | No | `ILivechatRoom` |
| `IPostLivechatDepartmentDisabled` | Department disabled | No | `ILivechatDepartmentEventContext` |
| `IPostLivechatDepartmentRemoved` | Department removed | No | `ILivechatDepartmentEventContext` |
| `IPreLivechatRoomCreatePrevent` | Room about to be created | **Yes** (throw) | `ILivechatRoom` |
| `ILivechatRoomClosedHandler` | Room closed | No | `ILivechatRoom` |

All post handlers are notification-only. Only `IPreLivechatRoomCreatePrevent` can cancel the underlying event.
