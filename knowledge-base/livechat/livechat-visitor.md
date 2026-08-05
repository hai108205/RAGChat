# Livechat Visitor

## Purpose

`IVisitor` represents a livechat visitor -- the customer (external person) chatting in a Rocket.Chat omnichannel/livechat conversation. Every livechat room has exactly one visitor associated with it.

---

## Overview

A visitor is an **unregistered external user** who initiates a chat via the livechat widget, email, SMS, app, or API. Unlike registered `IUser` accounts, visitors have a unique `token` (not a user ID) and carry contact information (phone, emails), department assignments, and arbitrary metadata (`customFields`, `livechatData`).

Visitors can be linked to external systems (CRM, helpdesk) via the `externalIds` array, which uses the `IVisitorExternalIdentifier` interface to map the visitor to an entity in a third-party system.

---

## When To Use

- Getting the visitor from a livechat room → `room.visitor`
- Accessing visitor contact details → `visitor.name`, `visitor.visitorEmails`, `visitor.phone`
- Identifying the visitor by token → `visitor.token`
- Linking visitor to external CRM → `visitor.externalIds`
- Reading visitor custom fields → `visitor.customFields`, `visitor.livechatData`
- Checking visitor status → `visitor.status`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IVisitor` | Livechat visitor (customer) | `id`, `token`, `username`, `name`, `department`, `phone`, `visitorEmails`, `status`, `externalIds` |
| `IVisitorEmail` | Email record | `address: string` |
| `IVisitorPhone` | Phone record | `phoneNumber: string` |
| `IVisitorExternalIdentifier` | Cross-system linking | `appId`, `entityId`, `metadata` |
| `ResolveVisitorContactData` | Union type for contact lookup | `{ phone: string } \| { email: string }` |

---

## IVisitor Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | No | Visitor's database ID (MongoDB `_id`). May be undefined for new visitors |
| `token` | `string` | Yes | Unique session token identifying this visitor across rooms |
| `username` | `string` | Yes | Username for the visitor |
| `updatedAt` | `Date` | No | Last update timestamp |
| `name` | `string` | Yes | Display name (often set to the same value as `username`) |
| `department` | `string` | No | Department ID the visitor was routed to |
| `phone` | `Array<IVisitorPhone>` | No | List of phone numbers |
| `visitorEmails` | `Array<IVisitorEmail>` | No | List of email addresses |
| `status` | `string` | No | Visitor status (e.g. `'online'`, `'offline'`, `'away'`) |
| `activity` | `string[]` | No | Activity history entries |
| `customFields` | `{ [key: string]: any }` | No | App-specific custom fields (form data from pre-chat form) |
| `livechatData` | `{ [key: string]: any }` | No | Livechat-specific metadata (pushed from widget API) |
| `externalIds` | `IVisitorExternalIdentifier[]` | No | Links to external system entities (CRM contacts, tickets) |

---

## IVisitorEmail Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `address` | `string` | Yes | Email address |

---

## IVisitorPhone Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `phoneNumber` | `string` | Yes | Phone number |

---

## IVisitorExternalIdentifier Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `appId` | `string` | Yes | The App that created this external mapping |
| `entityId` | `string` | Yes | The entity ID in the external system |
| `metadata` | `Record<string, unknown>` | No | Arbitrary metadata about the external link |

---

## ResolveVisitorContactData Union Type

```typescript
export type ResolveVisitorContactData = { phone: string } | { email: string };
```

Used for looking up a visitor by contact information. Pass an object with either `phone` or `email` (never both).

---

## Understanding externalIds

The `externalIds` array enables **cross-system visitor linking**. Each entry maps a Rocket.Chat visitor to a record in an external system (e.g., Salesforce contact, Zendesk user, HubSpot lead).

When a visitor initiates a chat, the widget or API can pass `externalIds` to associate the visitor with records in third-party systems. Multiple entries allow the same visitor to be linked to several external systems simultaneously.

**Typical flow**:

1. Your App creates a visitor with `externalIds: [{ appId: 'your-app-id', entityId: 'sfdc-001' }]`
2. When that visitor returns, Rocket.Chat resolves the external ID and loads the same visitor profile
3. Your App can use the `appId`/`entityId` pair to fetch additional data from the external system

---

## Typical Workflow

### 1. Accessing the Visitor from a Livechat Room

```typescript
import { isLivechatRoom } from '@rocket.chat/apps-engine/definition/livechat';

if (isLivechatRoom(room)) {
    const visitor = room.visitor;
    console.log(`Visitor: ${visitor.name} (token: ${visitor.token})`);
}
```

### 2. Reading Visitor Contact Info

```typescript
const visitor = room.visitor;

// Get primary email
const primaryEmail = visitor.visitorEmails?.[0]?.address;

// Get primary phone
const primaryPhone = visitor.phone?.[0]?.phoneNumber;
```

### 3. Reading Custom Fields

```typescript
// Pre-chat form fields (from widget configuration)
const company = visitor.customFields?.company;
const product = visitor.customFields?.product;

// Livechat data (pushed via widget API or SDK)
const pageUrl = visitor.livechatData?.pageUrl;
const userAgent = visitor.livechatData?.userAgent;
```

---

## Example

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { isLivechatRoom, IVisitor } from '@rocket.chat/apps-engine/definition/livechat';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function enrichVisitorContext(
    room: IRoom,
    read: IRead,
): Promise<void> {
    if (!isLivechatRoom(room)) {
        return;
    }

    const visitor: IVisitor = room.visitor;

    // Log visitor details
    console.log('Visitor details:', {
        name: visitor.name,
        token: visitor.token,
        emails: visitor.visitorEmails?.map((e) => e.address) ?? [],
        phones: visitor.phone?.map((p) => p.phoneNumber) ?? [],
        status: visitor.status,
        department: visitor.department,
    });

    // Check external system links
    const externalLinks = visitor.externalIds ?? [];
    for (const link of externalLinks) {
        console.log(`Linked to app ${link.appId}, entity ${link.entityId}`);
        // Fetch additional data from external system using link.appId and link.entityId
    }

    // Access pre-chat form data
    if (visitor.customFields?.priority === 'high') {
        // Handle high-priority visitor
    }

    // Access widget metadata
    const pageUrl = visitor.livechatData?.pageUrl;
    if (pageUrl) {
        console.log(`Chat started from: ${pageUrl}`);
    }
}
```

---

## Best Practices

- **Use `isLivechatRoom()` before accessing `room.visitor`** -- the visitor property only exists on livechat rooms.
- **Check `visitor.visitorEmails` and `visitor.phone` for null/undefined** -- visitors may not always provide contact information.
- **Use `visitor.token` as the stable identifier** -- the `id` field may not be available for new or unregistered visitors.
- **Use `visitor.livechatData` for widget/API metadata** -- this is distinct from `customFields` (which comes from the pre-chat registration form).
- **Use `visitor.externalIds` for CRM linking** -- each entry identifies an external system (`appId`) and the record within it (`entityId`).

---

## Common Mistakes

- **Accessing `room.visitor` without `isLivechatRoom()` check** -- causes runtime errors on non-livechat rooms.
- **Assuming `visitor.id` is always present** -- new visitors may not have a database ID yet. Use `visitor.token` for identification.
- **Confusing `customFields` with `livechatData`** -- `customFields` are configured form fields (pre-chat registration); `livechatData` is metadata from the widget API (like page URL, user-agent).
- **Treating `visitor` as `IUser`** -- visitors are not registered users. They have `UserType.UNKNOWN` and no roles, settings, or presence.

---

## Related Topics

- [Livechat Room](./livechat-room.md)
- [Livechat Message](./livechat-message.md)
- [Livechat Department](./livechat-department.md)
- [Room Structure](../rooms/room-structure.md)
