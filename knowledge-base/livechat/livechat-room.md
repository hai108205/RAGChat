# Livechat Room

## Purpose

`ILivechatRoom` extends `IRoom` to represent a livechat/omnichannel conversation room. It carries livechat-specific data: the visitor (customer), assigned department, serving agent, closure metadata, and the source channel (widget, email, SMS, app, API, etc.).

---

## Overview

A livechat room is a `RoomType.LIVE_CHAT` room that connects a **visitor** (customer) with one or more **agents**. Every livechat room tracks:

- **Who**: the `visitor`, `servedBy` (agent), `responseBy` (first responder)
- **What department**: the `department` routing target
- **What source**: the `source` (widget, email, SMS, app, API, other)
- **Status**: `isOpen`, `isWaitingResponse`, `closedAt`, `closedBy`

The `OmnichannelSource` type identifies where the conversation originated. For app-initiated chats, the source type is `'app'` and carries additional display metadata (alias, label, sidebar icon).

Two type guards -- `isLivechatRoom()` and `isLivechatFromApp()` -- provide type-safe narrowing from `IRoom` to `ILivechatRoom`.

---

## When To Use

- Checking if a room is a livechat conversation → `isLivechatRoom(room)`
- Getting the visitor → `room.visitor`
- Getting the assigned department → `room.department`
- Checking who is serving → `room.servedBy`
- Checking conversation status → `room.isOpen`, `room.isWaitingResponse`
- Checking conversation source → `room.source.type`
- Getting the contact record → `room.contact`
- Identifying app-originated conversations → `isLivechatFromApp(room)`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `ILivechatRoom` | Livechat room (extends `IRoom`) | `visitor`, `department`, `servedBy`, `isOpen`, `isWaitingResponse`, `source`, `contact` |
| `IOmnichannelSource` | Conversation origin metadata | `type`, `id`, `alias`, `label`, `sidebarIcon`, `destination` |
| `OmnichannelSourceType` | Enum of source types | `WIDGET`, `EMAIL`, `SMS`, `APP`, `API`, `OTHER` |
| `IVisitorChannelInfo` | Channel-specific visitor info | `lastMessageTs`, `phone` |
| `ILivechatContact` | Unified contact record | `_id`, `name`, `emails`, `phones`, `channels`, `conflictingFields` |
| `isLivechatRoom()` | Type guard: `IRoom` -> `ILivechatRoom` | Checks `room.type === RoomType.LIVE_CHAT` |
| `isLivechatFromApp()` | Type guard: `ILivechatRoom` -> app-sourced | Checks `room.source?.type === 'app'` |

---

## ILivechatRoom Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `visitor` | `IVisitor` | Yes | The customer (external visitor) in this conversation |
| `visitorChannelInfo` | `IVisitorChannelInfo` | No | Channel-specific visitor metadata (last message timestamp, phone) |
| `department` | `IDepartment` | No | The department this room is assigned to |
| `closer` | `'user' \| 'visitor' \| 'bot'` | Yes | Who closed the conversation |
| `closedBy` | `IUser` | No | The user who closed (agent or bot) |
| `servedBy` | `IUser` | No | The agent currently serving/accepted the chat |
| `responseBy` | `IUser` | No | The first agent to respond to the visitor |
| `isWaitingResponse` | `boolean` | Yes | Whether the room is waiting for a visitor or agent response |
| `isOpen` | `boolean` | Yes | Whether the conversation is still open |
| `closedAt` | `Date` | No | When the conversation was closed |
| `source` | `OmnichannelSource` | No | Where the conversation originated |
| `contact` | `ILivechatContact` | No | Unified contact profile linked to this visitor |

**Inherited from `IRoom`**: `id`, `displayName`, `slugifiedName`, `type` (`RoomType.LIVE_CHAT`), `creator`, `customFields`, `livechatData`, etc.

---

## OmnichannelSourceType Enum

| Value | Alias | Description |
|-------|-------|-------------|
| `WIDGET` | `'widget'` | Livechat widget embedded on a website |
| `EMAIL` | `'email'` | Email-to-livechat integration |
| `SMS` | `'sms'` | SMS/text message chat |
| `APP` | `'app'` | Chat initiated by a Rocket.Chat App (WhatsApp, Facebook, etc.) |
| `API` | `'api'` | Chat created via REST API |
| `OTHER` | `'other'` | Any other source |

---

## IOmnichannelSource Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `OmnichannelSourceType` | Yes | Source type (see enum above) |
| `id` | `string` | No | Optional identifier for the external source (e.g., App ID) |
| `alias` | `string` | No | Human-readable alias for analytics (e.g., "WhatsApp Business") |
| `label` | `string` | No | Label shown in the room info sidebar |
| `sidebarIcon` | `string` | No | Custom sidebar icon URL |
| `defaultIcon` | `string` | No | Default icon to use when sidebar icon unavailable |
| `destination` | `string` | No | The destination address (widget host URL, email address, WhatsApp number) |

---

## OmnichannelSource Union Type

```typescript
export type OmnichannelSource =
    | { type: Exclude<OmnichannelSourceType, 'app'> }
    | IOmnichannelSourceApp;
```

For `type: 'app'`, additional display metadata (alias, label, sidebarIcon, destination) is available. For all other types, only the `type` field is guaranteed.

---

## IVisitorChannelInfo Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `lastMessageTs` | `Date` | No | Timestamp of the last message in this channel |
| `phone` | `string` | No | Visitor's phone number for this channel |

---

## isLivechatRoom() Type Guard

```typescript
export const isLivechatRoom = (room: IRoom): room is ILivechatRoom => {
    return room.type === RoomType.LIVE_CHAT;
};
```

Narrows `IRoom` to `ILivechatRoom`. After this check, TypeScript allows access to `room.visitor`, `room.department`, `room.isOpen`, etc.

---

## isLivechatFromApp() Type Guard

```typescript
export const isLivechatFromApp = (room: ILivechatRoom): room is ILivechatRoom & { source: IOmnichannelSourceApp } => {
    return room.source?.type === 'app';
};
```

Narrows `ILivechatRoom` to one where `source.type` is `'app'`. After this check, `room.source.alias`, `room.source.label`, `room.source.sidebarIcon`, etc. are safely accessible.

---

## Typical Workflow

### 1. Detecting and Narrowing a Livechat Room

```typescript
import { isLivechatRoom, isLivechatFromApp } from '@rocket.chat/apps-engine/definition/livechat';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

function handleRoom(room: IRoom) {
    if (!isLivechatRoom(room)) {
        return; // Not a livechat conversation
    }

    // Now TypeScript knows room is ILivechatRoom
    console.log(`Visitor: ${room.visitor.name}`);
    console.log(`Open: ${room.isOpen}`);
    console.log(`Source: ${room.source?.type}`);

    if (room.department) {
        console.log(`Department: ${room.department.name}`);
    }

    if (isLivechatFromApp(room)) {
        // TypeScript now knows source is IOmnichannelSourceApp
        console.log(`App alias: ${room.source.alias}`);
        console.log(`Destination: ${room.source.destination}`);
    }
}
```

### 2. Checking Conversation Status

```typescript
if (!room.isOpen) {
    const closedByRole = room.closer; // 'user', 'visitor', or 'bot'
    console.log(`Closed by ${closedByRole} at ${room.closedAt}`);
}
```

### 3. Identifying the Serving Agent

```typescript
if (room.servedBy) {
    console.log(`Served by: ${room.servedBy.username}`);
} else {
    console.log('Waiting in queue -- no agent assigned yet');
}
```

---

## Example

```typescript
import {
    ILivechatRoom,
    isLivechatRoom,
    isLivechatFromApp,
    OmnichannelSourceType,
} from '@rocket.chat/apps-engine/definition/livechat';
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';

async function summarizeLivechatRoom(
    room: IRoom,
    read: IRead,
    modify: IModify,
): Promise<void> {
    if (!isLivechatRoom(room)) {
        return;
    }

    const appUser = await read.getUserReader().getAppUser();
    const livechatRoom = room as ILivechatRoom;

    const parts: string[] = [
        `**Livechat Summary for ${livechatRoom.visitor.name}**`,
        `Status: ${livechatRoom.isOpen ? 'Open' : 'Closed'}`,
        `Waiting Response: ${livechatRoom.isWaitingResponse ? 'Yes' : 'No'}`,
    ];

    if (livechatRoom.visitor.visitorEmails?.length) {
        parts.push(`Email: ${livechatRoom.visitor.visitorEmails[0].address}`);
    }

    if (livechatRoom.servedBy) {
        parts.push(`Agent: ${livechatRoom.servedBy.username}`);
    }

    if (livechatRoom.department) {
        parts.push(`Department: ${livechatRoom.department.name}`);
    }

    if (livechatRoom.source) {
        parts.push(`Source: ${livechatRoom.source.type}`);
    }

    if (isLivechatFromApp(livechatRoom)) {
        parts.push(`App: ${livechatRoom.source.alias ?? livechatRoom.source.id}`);
    }

    if (!livechatRoom.isOpen) {
        parts.push(`Closed by: ${livechatRoom.closer}`);
        parts.push(`Closed at: ${livechatRoom.closedAt?.toISOString()}`);
    }

    const builder = modify.getCreator().startMessage()
        .setRoom(livechatRoom)
        .setSender(appUser)
        .setText(parts.join('\n'));

    await modify.getCreator().finish(builder);
}
```

---

## Best Practices

- **Always use `isLivechatRoom()` before accessing livechat properties** -- prevents runtime errors on non-livechat rooms.
- **Use `isLivechatFromApp()` to safely access app-specific source metadata** -- `source.alias`, `source.label`, `source.sidebarIcon` are only available for `type: 'app'`.
- **Check `room.isOpen` before performing write operations** -- closed rooms should not receive new messages or assignments.
- **Handle missing `servedBy`** -- rooms in the queue have no agent assigned yet.
- **Use `room.source.type` for analytics** -- track conversation origins to measure channel performance.

---

## Common Mistakes

- **Accessing `room.visitor` on non-livechat rooms** -- Always use the `isLivechatRoom()` type guard first.
- **Assuming `source` has extended fields for all types** -- `alias`, `label`, `sidebarIcon`, `destination` are only guaranteed for `type: 'app'`. Use `isLivechatFromApp()` to narrow.
- **Comparing `OmnichannelSourceType` as raw strings** -- Use `OmnichannelSourceType.WIDGET`, `OmnichannelSourceType.APP`, etc. constants.
- **Ignoring `isWaitingResponse`** -- This flag indicates whether the visitor or agent is expected to respond next; use it for SLA tracking and queue prioritization.

---

## Related Topics

- [Livechat Visitor](./livechat-visitor.md)
- [Livechat Message](./livechat-message.md)
- [Livechat Department](./livechat-department.md)
- [Room Structure](../rooms/room-structure.md)
