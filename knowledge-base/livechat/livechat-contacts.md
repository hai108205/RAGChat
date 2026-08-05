# Livechat Contacts

## Purpose

`ILivechatContact` represents a unified contact record in Rocket.Chat's omnichannel system, aggregating a person's identity across multiple communication channels (WhatsApp, email, SMS, widget, etc.). `IContactRead` and `IContactCreator` provide accessors for reading and managing contacts.

---

## Overview

A contact is a **cross-channel person record** that links multiple visitor identities together. One contact can have multiple channels (e.g., WhatsApp number + email address), each with its own verification status and visitor association. Contacts support conflict detection (conflicting fields from different sources), custom fields, contact managers, and import IDs for external system linking.

---

## When To Use

| Task | Accessor | Method |
|------|----------|--------|
| Get contact by ID | `IContactRead` | `getById(contactId)` |
| Verify a contact channel | `IContactCreator` | `verifyContact(params)` |
| Add email to a contact | `IContactCreator` | `addContactEmail(contactId, email)` |
| Access contact from room | `ILivechatRoom` | `room.contact` |

---

## Important Interfaces

### ILivechatContact

```typescript
interface ILivechatContact {
    _id: string;
    _updatedAt: Date;
    name: string;
    phones?: IVisitorPhone[];
    emails?: IVisitorEmail[];
    contactManager?: string;
    unknown?: boolean;
    conflictingFields?: ILivechatContactConflictingField[];
    customFields?: Record<string, string | unknown>;
    channels: ILivechatContactChannel[];
    createdAt: Date;
    lastChat?: { _id: string; ts: Date };
    importIds?: string[];
}
```

| Member | Type | Description |
|--------|------|-------------|
| `_id` | `string` | Unique contact ID |
| `_updatedAt` | `Date` | Last modification timestamp |
| `name` | `string` | Contact display name |
| `phones` | `IVisitorPhone[]` (optional) | Phone numbers (`{ phoneNumber: string }`) |
| `emails` | `IVisitorEmail[]` (optional) | Email addresses (`{ address: string }`) |
| `contactManager` | `string` (optional) | Assigned manager username |
| `unknown` | `boolean` (optional) | Whether the contact identity is unconfirmed |
| `conflictingFields` | `ILivechatContactConflictingField[]` (optional) | Fields with conflicting values from different sources |
| `customFields` | `Record<string, string \| unknown>` (optional) | Arbitrary custom data |
| `channels` | `ILivechatContactChannel[]` | Communication channels associated with this contact |
| `createdAt` | `Date` | Creation timestamp |
| `lastChat` | `{ _id: string; ts: Date }` (optional) | Most recent chat reference |
| `importIds` | `string[]` (optional) | External system import identifiers |

### ILivechatContactChannel

```typescript
interface ILivechatContactChannel {
    name: string;
    verified: boolean;
    visitor: ILivechatContactVisitorAssociation;
    blocked: boolean;
    field?: string;
    value?: string;
    verifiedAt?: Date;
    details: IOmnichannelSource;
    lastChat?: { _id: string; ts: Date };
}
```

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Channel name (e.g., "WhatsApp", "Email", "widget") |
| `verified` | `boolean` | Whether the channel has been verified |
| `visitor` | `ILivechatContactVisitorAssociation` | The visitor linked to this channel |
| `blocked` | `boolean` | Whether the channel is blocked |
| `field` | `string` (optional) | The contact field this channel maps to (e.g., "phone", "email") |
| `value` | `string` (optional) | The value for the mapped field |
| `verifiedAt` | `Date` (optional) | When the channel was verified |
| `details` | `IOmnichannelSource` | Source details (type, id, alias, label, etc.) |
| `lastChat` | `{ _id: string; ts: Date }` (optional) | Most recent chat on this channel |

### ILivechatContactVisitorAssociation

```typescript
interface ILivechatContactVisitorAssociation {
    visitorId: string;
    source: { type: OmnichannelSourceType; id?: IOmnichannelSource['id'] };
}
```

### ILivechatContactConflictingField

```typescript
interface ILivechatContactConflictingField {
    field: 'name' | 'manager' | `customFields.${string}`;
    value: string;
}
```

- `field` -- the field with a conflict (can be `'name'`, `'manager'`, or any `customFields.*` key)
- `value` -- the conflicting value from another source

---

## Accessors

### IContactRead

```typescript
interface IContactRead {
    getById(contactId: ILivechatContact['_id']): Promise<ILivechatContact | null>;
}
```

Accessed via `read.getContactReader()`.

### IContactCreator

```typescript
interface IContactCreator {
    verifyContact(verifyContactChannelParams: {
        contactId: string;
        field: string;
        value: string;
        visitorId: string;
        roomId: string;
    }): Promise<void>;

    addContactEmail(contactId: ILivechatContact['_id'], email: string): Promise<ILivechatContact>;
}
```

Accessed via `modify.getCreator().getContactCreator()`.

---

## Typical Workflows

### Reading a Contact

```typescript
public async executePostLivechatRoomStarted(
    context: ILivechatRoom,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<void> {
    // Contacts are available on the room directly
    if (context.contact) {
        console.log(`Contact: ${context.contact.name}`);
        console.log(`Channels: ${context.contact.channels.length}`);
        console.log(`Emails: ${context.contact.emails?.map(e => e.address).join(', ')}`);
        console.log(`Phones: ${context.contact.phones?.map(p => p.phoneNumber).join(', ')}`);
        console.log(`Manager: ${context.contact.contactManager}`);

        // Check for conflicting fields
        if (context.contact.conflictingFields?.length) {
            for (const conflict of context.contact.conflictingFields) {
                console.log(`Conflict on ${conflict.field}: ${conflict.value}`);
            }
        }

        // Check channel verification status
        for (const channel of context.contact.channels) {
            if (!channel.verified) {
                console.log(`Unverified channel: ${channel.name}`);
            }
        }
    }

    // Alternatively, fetch by ID
    const contactReader = read.getContactReader();
    const contact = await contactReader.getById('contact-id-here');
    if (contact) {
        console.log(`Found contact: ${contact.name}`);
    }
}
```

### Verifying a Contact Channel

```typescript
public async executeBlockAction(
    context: UIKitBlockInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const contactCreator = modify.getCreator().getContactCreator();

    await contactCreator.verifyContact({
        contactId: 'contact-id',
        field: 'phone',
        value: '+1234567890',
        visitorId: 'visitor-id',
        roomId: 'room-id',
    });

    return context.getInteractionResponder().successResponse();
}
```

### Adding an Email to a Contact

```typescript
const contactCreator = modify.getCreator().getContactCreator();

const updatedContact = await contactCreator.addContactEmail(
    'contact-id',
    'new-email@example.com',
);

console.log(`Updated contact now has ${updatedContact.emails?.length} emails`);
```

---

## Anti-Patterns

- **Do not assume channels are verified** -- always check `channel.verified` before trusting channel data.
- **Check `conflictingFields`** before overwriting contact data -- the field may have conflicting values from different sources.
- **`getById` returns `null`** for non-existent contacts -- always null-check.
- **`verifyContact` is void** -- it does not return the updated contact; re-fetch if needed.
- **Contact may not exist on every room** -- `room.contact` is optional.
