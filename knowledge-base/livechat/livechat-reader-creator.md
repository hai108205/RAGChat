# Livechat Reader and Creator

## Purpose

`ILivechatRead` and `ILivechatCreator` are the read and write accessors for livechat data. `ILivechatRead` queries livechat rooms, visitors, departments, and online status. `ILivechatCreator` creates livechat rooms, visitors, and tokens.

---

## Overview

- `ILivechatRead` is accessed via `read.getLivechatReader()`
- `ILivechatCreator` is accessed via `modify.getCreator().getLivechatCreator()`
- All methods return Promises (except the deprecated `isOnline`) -- always `await`

---

## When To Use

| Task | Accessor | Method |
|------|----------|--------|
| Check if livechat is online | `ILivechatRead` | `isOnlineAsync(departmentId?)` |
| Get departments with agents | `ILivechatRead` | `getDepartmentsEnabledWithAgents()` |
| Get a visitor's rooms | `ILivechatRead` | `getLivechatRooms(visitor, departmentId?)` |
| Get agent's open rooms | `ILivechatRead` | `getLivechatOpenRoomsByAgentId(agentId)` |
| Count agent's open rooms | `ILivechatRead` | `getLivechatTotalOpenRoomsByAgentId(agentId)` |
| Search visitors by query | `ILivechatRead` | `getLivechatVisitors(query)` (deprecated) |
| Get visitor by ID | `ILivechatRead` | `getLivechatVisitorById(id)` |
| Get visitor by email | `ILivechatRead` | `getLivechatVisitorByEmail(email)` |
| Get visitor by token | `ILivechatRead` | `getLivechatVisitorByToken(token)` |
| Get visitor by phone | `ILivechatRead` | `getLivechatVisitorByPhoneNumber(phoneNumber)` |
| Get department by ID or name | `ILivechatRead` | `getLivechatDepartmentByIdOrName(value)` |
| Fetch room messages | `ILivechatRead` | `_fetchLivechatRoomMessages(roomId)` (experimental) |
| Create a livechat room | `ILivechatCreator` | `createRoom(visitor, agent, extraParams?)` |
| Create a visitor | `ILivechatCreator` | `createAndReturnVisitor(visitor)` |
| Resolve visitor by external ID | `ILivechatCreator` | `resolveVisitor(externalId, contactData?)` |
| Generate a visitor token | `ILivechatCreator` | `createToken()` |

---

## Important Interfaces

### ILivechatRead

```typescript
interface ILivechatRead {
    isOnline(departmentId?: string): boolean;                              // @deprecated
    isOnlineAsync(departmentId?: string): Promise<boolean>;
    getDepartmentsEnabledWithAgents(): Promise<Array<IDepartment>>;
    getLivechatRooms(visitor: IVisitor, departmentId?: string): Promise<Array<ILivechatRoom>>;
    getLivechatOpenRoomsByAgentId(agentId: string): Promise<Array<ILivechatRoom>>;
    getLivechatTotalOpenRoomsByAgentId(agentId: string): Promise<number>;
    getLivechatVisitors(query: object): Promise<Array<IVisitor>>;           // @deprecated
    getLivechatVisitorById(id: string): Promise<IVisitor | undefined>;
    getLivechatVisitorByEmail(email: string): Promise<IVisitor | undefined>;
    getLivechatVisitorByToken(token: string): Promise<IVisitor | undefined>;
    getLivechatVisitorByPhoneNumber(phoneNumber: string): Promise<IVisitor | undefined>;
    getLivechatDepartmentByIdOrName(value: string): Promise<IDepartment | undefined>;
    _fetchLivechatRoomMessages(roomId: string): Promise<Array<IMessage>>;   // @experimental
}
```

### ILivechatCreator

```typescript
interface ILivechatCreator {
    resolveVisitor(
        externalId: Omit<IVisitorExternalIdentifier, 'appId'>,
        contactData?: ResolveVisitorContactData,
    ): Promise<IVisitor | undefined>;

    createRoom(visitor: IVisitor, agent: IUser, extraParams?: IExtraRoomParams): Promise<ILivechatRoom>;

    createVisitor(visitor: IVisitor): Promise<string>;                       // @deprecated
    createAndReturnVisitor(visitor: IVisitor): Promise<IVisitor | undefined>;
    createToken(): string;
}
```

### IExtraRoomParams

```typescript
interface IExtraRoomParams {
    source?: ILivechatRoom['source'];
    customFields?: { [key: string]: unknown };
}
```

### ResolveVisitorContactData

```typescript
type ResolveVisitorContactData = { phone: string } | { email: string };
```

---

## How to Access

```typescript
// In any handler that receives read and modify:
const livechatReader = read.getLivechatReader();
const livechatCreator = modify.getCreator().getLivechatCreator();
```

---

## Typical Workflows

### Reading a Visitor's Livechat Rooms

```typescript
public async executeLivechatRoomStarted(
    context: ILivechatRoom,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<void> {
    const livechatReader = read.getLivechatReader();

    // Get the visitor's rooms
    const rooms = await livechatReader.getLivechatRooms(context.visitor);
    console.log(`Visitor has ${rooms.length} rooms`);

    // Get agent's open rooms
    const agentId = context.servedBy?.id;
    if (agentId) {
        const openRooms = await livechatReader.getLivechatOpenRoomsByAgentId(agentId);
        console.log(`Agent has ${openRooms.length} open rooms`);
    }

    // Get visitor by token
    const visitor = await livechatReader.getLivechatVisitorByToken(context.visitor.token);
    if (visitor) {
        console.log(`Visitor name: ${visitor.name}`);
    }
}
```

### Creating a New Livechat Room

```typescript
public async executeBlockAction(
    context: UIKitBlockInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const livechatCreator = modify.getCreator().getLivechatCreator();
    const livechatReader = read.getLivechatReader();

    // Find an agent to assign
    const departments = await livechatReader.getDepartmentsEnabledWithAgents();
    if (!departments.length) {
        return context.getInteractionResponder().errorResponse();
    }

    // Resolve or create visitor
    const token = livechatCreator.createToken();
    const visitor = await livechatCreator.createAndReturnVisitor({
        token,
        username: `guest-${Date.now()}`,
        name: 'Jane Doe',
        visitorEmails: [{ address: 'jane@example.com' }],
    });

    if (!visitor) {
        return context.getInteractionResponder().errorResponse();
    }

    // Get an agent
    const userReader = read.getUserReader();
    const agent = await userReader.getById('agent-user-id');

    // Create the room with custom fields
    const room = await livechatCreator.createRoom(visitor, agent, {
        customFields: { priority: 'high', source: 'api' },
    });

    console.log(`Created room: ${room.id}`);

    return context.getInteractionResponder().successResponse();
}
```

### Resolving a Visitor by External ID

```typescript
const externalId = { entityId: 'crm-12345', metadata: { source: 'salesforce' } };

// Try to find by external ID, with email fallback
const visitor = await livechatCreator.resolveVisitor(
    externalId,
    { email: 'customer@example.com' },
);

if (visitor) {
    // Existing visitor found or enriched
    console.log(`Resolved visitor: ${visitor.name}`);
} else {
    // No visitor found -- create a new one
    const newVisitor = await livechatCreator.createAndReturnVisitor({
        token: livechatCreator.createToken(),
        username: `guest-${Date.now()}`,
        name: 'New Customer',
    });
}
```

---

## Anti-Patterns

- **Do not use `isOnline()`** -- it is deprecated, use `isOnlineAsync()` instead.
- **Do not use `createVisitor()`** -- it is deprecated, use `createAndReturnVisitor()` instead.
- **Do not use `getLivechatVisitors()`** -- it is deprecated and does not follow conversion practices.
- **`_fetchLivechatRoomMessages()`** is experimental and may change without notice.
- **Always check for `undefined`** -- visitor lookups return `IVisitor | undefined`.
