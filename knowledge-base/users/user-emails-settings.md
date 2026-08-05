# User Emails & Settings

## Purpose

`IUserEmail` represents an email address associated with a user. `IUserSettings` holds user-level preferences. Both are accessed via the `IUser` object.

---

## Overview

`IUserEmail` is a simple record with an email address and a verification flag. A user can have multiple emails (`user.emails: Array<IUserEmail>`).

`IUserSettings` holds the `preferences` object, primarily `language` — the user's locale preference. It is an optional field on `IUser` (`user.settings?`).

---

## When To Use

- Getting a user's primary email → `user.emails[0]?.address`
- Checking if email is verified → `email.verified`
- Finding all verified emails → `user.emails.filter(e => e.verified)`
- Reading user's language preference → `user.settings?.preferences?.language`
- Sending localized content based on user preference → fallback to workspace default

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IUserEmail` | Email record | `address: string`, `verified: boolean` |
| `IUserSettings` | User preferences | `preferences?: { language?: string }` |
| `IUser` | Parent object | `emails: Array<IUserEmail>`, `settings?: IUserSettings` |

---

## IUserEmail Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `address` | `string` | Yes | The email address |
| `verified` | `boolean` | Yes | Whether the email has been verified |

---

## IUserSettings Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `preferences` | `{ language?: string }` | No | User preference object |
| `preferences.language` | `string` | No | Locale code (e.g. `"en"`, `"vi"`, `"pt-BR"`) |

---

## Typical Workflow

### 1. Accessing Emails from IUser

```typescript
import { IUser } from '@rocket.chat/apps-engine/definition/users';

function getUserEmailInfo(user: IUser): void {
    // All emails (user can have multiple)
    for (const email of user.emails) {
        console.log(`${email.address} — verified: ${email.verified}`);
    }

    // Primary (first) email
    const primary = user.emails[0];
    if (primary) {
        console.log(`Primary email: ${primary.address}`);
    }

    // Get only verified emails
    const verified = user.emails.filter((e) => e.verified);
    console.log(`Verified emails: ${verified.map((e) => e.address).join(', ')}`);
}
```

### 2. Reading User Settings (Language Preference)

```typescript
import { IUser } from '@rocket.chat/apps-engine/definition/users';

function getPreferredLanguage(user: IUser): string {
    const lang = user.settings?.preferences?.language;
    return lang || 'en'; // Fallback to English
}

// In a slash command handler:
const sender = context.getSender();
const lang = getPreferredLanguage(sender);

const greeting = lang === 'vi' ? 'Xin chào' : lang === 'pt-BR' ? 'Olá' : 'Hello';
```

### 3. Full Example: Checking User Emails in a Command

```typescript
import { IHttp, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

async function handleCommand(
    context: SlashCommandContext,
    read: IRead,
    modify: IModify,
): Promise<void> {
    const sender: IUser = context.getSender();
    const room = context.getRoom();
    const appUser = await read.getUserReader().getAppUser();

    const verifiedEmails = sender.emails.filter((e) => e.verified);
    const lang = sender.settings?.preferences?.language || 'en';

    let response = `You have ${sender.emails.length} email(s), ${verifiedEmails.length} verified.\n`;
    response += `Your language preference: ${lang}`;

    const msg = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser!)
        .setText(response);

    await modify.getCreator().finish(msg);
}
```

---

## Best Practices

- **Always check `email.verified`** before using an email for notifications — unverified emails may be abandoned.
- **Handle empty `emails` array** — rare but possible (e.g. some SSO users).
- **Check `user.settings` for null/undefined** — it's an optional field. Use optional chaining: `user.settings?.preferences?.language`.
- **Provide a fallback for `language`** — not all users set a language preference.
- **Use `IUserEmail.address`** for displaying and comparing emails — it's the canonical email string.

---

## Common Mistakes

- **Assuming `user.emails[0]` exists** → Always check array length before indexing.
- **Using unverified emails for notifications** → Check `email.verified === true`.
- **Treating `settings` as always present** → Optional chaining or explicit null check required.
- **Assuming `preferences.language` is an ISO code** → It follows Rocket.Chat's locale strings (e.g. `"en"`, `"pt-BR"`).

---

## Related Topics

- [User Structure](./user-structure.md)
- [User Reader](../accessors/user-reader.md)
- [User Builder](../accessors/user-builder.md)
