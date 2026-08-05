# Livechat Updater

## Purpose

`ILivechatUpdater` provides mutation methods for livechat rooms, visitors, and transfers. Use it to close rooms, transfer visitors between agents/departments, update visitor custom fields, and manage external identifiers.

---

## Overview

- `ILivechatUpdater` is accessed via `modify.getUpdater().getLivechatUpdater()`
- Transfer data uses `ILivechatTransferData` (current room, target agent/department)
- Transfer events produce `ILivechatTransferEventContext` with full from/to info
- All methods return Promises -- always `await`

---

## When To Use

| Task | Method |
|------|--------|
| Transfer visitor to another agent/department | `transferVisitor(visitor, transferData)` |
| Close a livechat room | `closeRoom(room, comment, closer?)` |
| Set visitor custom fields | `setCustomFields(token, key, value, overwrite)` |
| Update visitor external ID | `updateVisitorExternalId(visitorId, externalId)` |

---

## Important Interfaces

### ILivechatUpdater

```typescript
interface ILivechatUpdater {
    transferVisitor(visitor: IVisitor, transferData: ILivechatTransferData): Promise<boolean>;
    closeRoom(room: IRoom, comment: string, closer?: IUser): Promise<boolean>;
    setCustomFields(
        token: IVisitor['token'],
        key: string,
        value: string,
        overwrite: boolean,
    ): Promise<boolean>;
    updateVisitorExternalId(
        visitorId: string,
        externalId: Omit<IVisitorExternalIdentifier, 'appId'>,
    ): Promise<IVisitor | undefined>;
}
```

### ILivechatTransferData

```typescript
interface ILivechatTransferData {
    currentRoom: ILivechatRoom;
    targetAgent?: IUser;
    targetDepartment?: string;
}
```

- `currentRoom` -- the room the visitor is currently in
- `targetAgent` -- the agent to transfer to (mutually optional with `targetDepartment`)
- `targetDepartment` -- the department to transfer to (mutually optional with `targetAgent`)

### ILivechatTransferEventContext

```typescript
enum LivechatTransferEventType {
    AGENT = 'agent',
    DEPARTMENT = 'department',
}

interface ILivechatTransferEventContext {
    type: LivechatTransferEventType;
    room: IRoom;
    from: IUser | IDepartment;
    to: IUser | IDepartment;
}
```

- `type` -- `'agent'` or `'department'` based on whether the transfer is to an agent or a department
- `room` -- the room being transferred
- `from` -- the source agent or department
- `to` -- the destination agent or department

---

## How to Access

```typescript
// In any handler that receives modify:
const livechatUpdater = modify.getUpdater().getLivechatUpdater();
```

---

## Typical Workflows

### Closing a Livechat Room

```typescript
public async executeBlockAction(
    context: UIKitBlockInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const livechatUpdater = modify.getUpdater().getLivechatUpdater();
    const room = context.getInteractionData().room;

    if (!room) {
        return context.getInteractionResponder().errorResponse();
    }

    // Close the room with a comment
    const closed = await livechatUpdater.closeRoom(
        room,
        'Issue resolved. Customer confirmed fix.',
    );

    if (closed) {
        return context.getInteractionResponder().successResponse();
    }

    return context.getInteractionResponder().errorResponse();
}
```

### Transferring a Visitor to Another Agent

```typescript
public async executeViewSubmit(
    context: UIKitViewSubmitInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const livechatUpdater = modify.getUpdater().getLivechatUpdater();
    const livechatReader = read.getLivechatReader();
    const userReader = read.getUserReader();
    const { view } = context.getInteractionData();

    // Get the visitor from the current room
    const room = await livechatReader.getLivechatRooms(/* ... */);
    const visitor = room[0]?.visitor;

    // Find the target agent
    const targetAgent = await userReader.getById(view.state?.agentId);

    if (!visitor || !targetAgent || !room[0]) {
        return context.getInteractionResponder().errorResponse();
    }

    // Perform the transfer
    const transferred = await livechatUpdater.transferVisitor(visitor, {
        currentRoom: room[0],
        targetAgent,
    });

    if (transferred) {
        return context.getInteractionResponder().successResponse();
    }

    return context.getInteractionResponder().errorResponse();
}
```

### Transferring to a Department

```typescript
const transferred = await livechatUpdater.transferVisitor(visitor, {
    currentRoom: room,
    targetDepartment: 'support',
});
```

### Handling a Transfer Event

```typescript
// In IPostLivechatRoomTransferred handler:
public async executePostLivechatRoomTransferred(
    context: ILivechatTransferEventContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<void> {
    if (context.type === LivechatTransferEventType.AGENT) {
        console.log(`Room ${context.room.id} transferred from agent to agent`);
    } else {
        console.log(`Room ${context.room.id} transferred to department`);
    }
}
```

### Updating Visitor Custom Fields

```typescript
const livechatUpdater = modify.getUpdater().getLivechatUpdater();

// Set a custom field on the visitor identified by token
await livechatUpdater.setCustomFields(
    visitorToken,
    'preferredLanguage',
    'fr',
    true, // overwrite existing value
);
```

### Updating Visitor External ID (CRM Linking)

```typescript
const livechatUpdater = modify.getUpdater().getLivechatUpdater();

const updatedVisitor = await livechatUpdater.updateVisitorExternalId(
    visitorId,
    {
        entityId: 'salesforce-lead-789',
        metadata: { source: 'salesforce', lastSync: new Date().toISOString() },
    },
);

if (updatedVisitor) {
    console.log(`Linked visitor to external entity: ${updatedVisitor.externalIds}`);
}
```

---

## Anti-Patterns

- **Do not transfer without a current room** -- `ILivechatTransferData.currentRoom` is required.
- **Do not close without a comment** -- `closeRoom` requires a comment explaining the reason.
- **Check return values** -- all updater methods return `Promise<boolean>`, verify success before proceeding.
- **`updateVisitorExternalId` appends appId automatically** -- do not include `appId` in the externalId parameter; the Apps Engine sets it from the calling app.
