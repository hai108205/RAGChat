# Contacts Accessors

## Purpose

`IContactRead` and `IContactCreator` provide accessors for reading and managing unified contact records in Rocket.Chat's omnichannel system. Contacts aggregate a person's identity across multiple communication channels.

---

## Overview

- `IContactRead` -- read-only access to contacts by ID
- `IContactCreator` -- verify contact channels and add emails to contacts
- Contacts are cross-channel person records linking WhatsApp, email, SMS, widget, and other channels
- Accessed via `read.getContactReader()` and `modify.getCreator().getContactCreator()`

---

## When To Use

| Task | Accessor | Method |
|------|----------|--------|
| Look up a contact by ID | `IContactRead` | `getById(contactId)` |
| Verify a contact's channel | `IContactCreator` | `verifyContact(params)` |
| Add an email to a contact | `IContactCreator` | `addContactEmail(contactId, email)` |

---

## Important Interfaces

### IContactRead

```typescript
interface IContactRead {
    getById(contactId: ILivechatContact['_id']): Promise<ILivechatContact | null>;
}
```

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

---

## How to Access

```typescript
const contactReader = read.getContactReader();
const contactCreator = modify.getCreator().getContactCreator();
```

---

## Typical Workflows

### Reading a Contact by ID

```typescript
const contactReader = read.getContactReader();
const contact = await contactReader.getById('contact-id-here');

if (contact) {
    console.log(`Contact: ${contact.name}`);
    console.log(`Manager: ${contact.contactManager}`);
    console.log(`Channels: ${contact.channels.map(c => c.name).join(', ')}`);
    console.log(`Emails: ${contact.emails?.map(e => e.address).join(', ')}`);
    console.log(`Phones: ${contact.phones?.map(p => p.phoneNumber).join(', ')}`);
    console.log(`Created: ${contact.createdAt}`);

    if (contact.conflictingFields?.length) {
        console.log('Has conflicting fields from different sources');
    }
} else {
    console.log('Contact not found');
}
```

### Verifying a Contact Channel

```typescript
const contactCreator = modify.getCreator().getContactCreator();

await contactCreator.verifyContact({
    contactId: 'contact-id',
    field: 'phone',
    value: '+1234567890',
    visitorId: 'visitor-id',
    roomId: 'room-id',
});

// Channel is now marked as verified
```

### Adding an Email to a Contact

```typescript
const contactCreator = modify.getCreator().getContactCreator();

const updatedContact = await contactCreator.addContactEmail(
    'contact-id',
    'user@example.com',
);

console.log(`Contact now has ${updatedContact.emails?.length} email(s)`);
```

### Searching Contacts by Room

```typescript
// Contacts are also accessible from livechat rooms directly:
const roomReader = read.getRoomReader();
const room = await roomReader.getById('room-id');

if (room && isLivechatRoom(room) && room.contact) {
    const contact = room.contact;
    console.log(`Room belongs to contact: ${contact.name}`);

    // Verify unverified channels
    for (const channel of contact.channels) {
        if (!channel.verified) {
            console.log(`Unverified channel: ${channel.name} (${channel.field}: ${channel.value})`);
        }
    }
}
```

---

## Anti-Patterns

- **`getById` returns `null`** for non-existent contacts -- always null-check the result.
- **`verifyContact` is void** -- it does not return the updated contact. Re-fetch if you need updated data.
- **`addContactEmail` returns the updated contact** -- use the return value directly.
- **Do not assume contacts exist on every room** -- `room.contact` is optional on `ILivechatRoom`.
- **Do not trust unverified channels** -- check `channel.verified` before using channel data.
