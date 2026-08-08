# Email Sending Handler

## Purpose

`IPreEmailSent` intercepts outgoing emails **before** the mailer sends them. Use it to inspect, modify, or block emails -- change recipients, alter subject lines, append footers, redirect to a different address, or prevent the email from being sent entirely.

---

## Overview

When Rocket.Chat is about to send an email (password reset, invitation, notification digest, etc.), the platform fires the `IPreEmailSent` event. Your handler receives the email descriptor (from, to, cc, bcc, subject, body text/HTML, headers) and can return a modified version of it.

This is the only handler in the App-Engine that can **modify** the event data -- the return type is `Promise<IEmailDescriptor>`, meaning you return the (possibly modified) email descriptor that should actually be sent.

To **block** the email, throw an error -- the mailer will catch it and skip sending.

---

## When To Use

- Adding a standard email footer or disclaimer to all outgoing emails
- Rewriting subject lines for branding or A/B testing
- Redirecting emails in development/staging environments (catch-all)
- Blocking emails to specific domains or addresses
- Logging all outgoing emails for audit purposes
- Modifying email headers (e.g., adding custom `X-*` headers)
- Converting plain-text emails to HTML or vice versa
- Appending tracking pixels or read-receipt tokens

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IPreEmailSent` | Email interceptor | `executePreEmailSent(context, read, http, persis, modify): Promise<IEmailDescriptor>` |
| `IPreEmailSentContext` | Handler context | `context: unknown`, `email: IEmailDescriptor` |
| `IEmailDescriptor` | Email fields (mutable) | `from`, `to`, `cc`, `bcc`, `replyTo`, `subject`, `text`, `html`, `headers` |

Note: `IEmailDescriptor` differs from `IEmail` (the internal Rocket.Chat email interface) in that all its fields are optional/undefined -- it represents the mail-sending parameters that may or may not be set.

---

## IPreEmailSentContext

```typescript
export interface IPreEmailSentContext {
    /** The internal Rocket.Chat context object (opaque to apps) */
    context: unknown;
    /** The email descriptor with all sending parameters */
    email: IEmailDescriptor;
}
```

The `context` field is opaque -- it carries the internal Rocket.Chat email context. Treat it as `unknown` and pass it through unchanged.

---

## IEmailDescriptor

```typescript
export interface IEmailDescriptor {
    from?: string | undefined;
    to?: string | Array<string> | undefined;
    cc?: string | Array<string> | undefined;
    bcc?: string | Array<string> | undefined;
    replyTo?: string | Array<string> | undefined;
    subject?: string | undefined;
    text?: string | undefined;
    html?: string | undefined;
    headers?: Record<string, string> | undefined;
}
```

All fields are optional. When the mailer receives the descriptor, it uses whatever fields are set and fills in defaults for missing ones (e.g., `from` comes from SMTP settings). String values like `to` can be a single address or an array.

---

## IPreEmailSent

**Fires**: Before the mailer sends an email. The email descriptor is fully populated at this point.

**Context**: `IPreEmailSentContext` -- contains the opaque `context` and the `email` descriptor.

**Can modify?** **Yes**. Return a modified `IEmailDescriptor` with any fields changed. The mailer will use your returned descriptor for the actual send.

**Can prevent?** **Yes**. Throw an error with a descriptive message to cancel this email. The mailer catches the error and skips sending.

**Method signature**: `executePreEmailSent(context, read, http, persis, modify): Promise<IEmailDescriptor>`

---

## Example: Inspect All Outgoing Emails

```typescript
import {
    IPreEmailSent,
    IPreEmailSentContext,
    IEmailDescriptor,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/email';

export class EmailInspector implements IPreEmailSent {
    public async executePreEmailSent(
        context: IPreEmailSentContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<IEmailDescriptor> {
        const email = context.email;

        console.log('--- Outgoing Email ---');
        console.log(`From: ${email.from}`);
        console.log(`To: ${email.to}`);
        console.log(`Subject: ${email.subject}`);
        console.log(`Has HTML: ${!!email.html}`);
        console.log(`Has Text: ${!!email.text}`);

        // Return the email unchanged (allow it to be sent)
        return email;
    }
}
```

---

## Example: Add Footer to All Emails

```typescript
import {
    IPreEmailSent,
    IPreEmailSentContext,
    IEmailDescriptor,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/email';

export class EmailFooterAppender implements IPreEmailSent {
    private readonly FOOTER_HTML = `
        <br><br>
        <hr>
        <p style="color: #888; font-size: 12px;">
            This email was sent by Rocket.Chat.<br>
            If you believe you received this in error, please contact your administrator.
        </p>
    `;

    private readonly FOOTER_TEXT = `

---
This email was sent by Rocket.Chat.
If you believe you received this in error, please contact your administrator.
`;

    public async executePreEmailSent(
        context: IPreEmailSentContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<IEmailDescriptor> {
        const email = { ...context.email };

        // Append footer to HTML version
        if (email.html) {
            email.html = email.html + this.FOOTER_HTML;
        }

        // Append footer to plain text version
        if (email.text) {
            email.text = email.text + this.FOOTER_TEXT;
        }

        return email;
    }
}
```

---

## Example: Redirect All Emails in Development

```typescript
import {
    IPreEmailSent,
    IPreEmailSentContext,
    IEmailDescriptor,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/email';

export class DevEmailRedirector implements IPreEmailSent {
    private readonly CATCH_ALL = 'dev-team@example.com';

    public async executePreEmailSent(
        context: IPreEmailSentContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<IEmailDescriptor> {
        const email = { ...context.email };

        // Redirect all email to the catch-all address
        const originalTo = email.to;
        email.to = this.CATCH_ALL;
        email.cc = undefined;       // Clear CC
        email.bcc = undefined;      // Clear BCC

        // Prepend original recipient info to subject for context
        email.subject = `[ORIG: ${originalTo}] ${email.subject}`;

        console.log(`Email redirected: ${originalTo} -> ${this.CATCH_ALL}`);

        return email;
    }
}
```

---

## Example: Block Emails to Specific Domains

```typescript
import {
    IPreEmailSent,
    IPreEmailSentContext,
    IEmailDescriptor,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/email';

export class DomainBlocker implements IPreEmailSent {
    private readonly BLOCKED_DOMAINS = [
        'competitor.com',
        'disposable-email.example.com',
    ];

    public async executePreEmailSent(
        context: IPreEmailSentContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<IEmailDescriptor> {
        const email = context.email;

        // Extract all recipient addresses
        const recipients = this.extractRecipients(email);

        // Check if any recipient matches a blocked domain
        for (const recipient of recipients) {
            const domain = recipient.split('@')[1]?.toLowerCase();
            if (domain && this.BLOCKED_DOMAINS.includes(domain)) {
                throw new Error(
                    `Blocked: cannot send email to domain "${domain}".`,
                );
            }
        }

        // Allow the email
        return email;
    }

    private extractRecipients(email: IEmailDescriptor): string[] {
        const list: string[] = [];
        const add = (val: string | string[] | undefined) => {
            if (!val) return;
            if (Array.isArray(val)) list.push(...val);
            else list.push(val);
        };
        add(email.to);
        add(email.cc);
        add(email.bcc);
        return list;
    }
}
```

---

## Example: Add Custom Headers for Tracking

```typescript
import {
    IPreEmailSent,
    IPreEmailSentContext,
    IEmailDescriptor,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/email';

export class TrackingHeaderAdder implements IPreEmailSent {
    public async executePreEmailSent(
        context: IPreEmailSentContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<IEmailDescriptor> {
        const email = { ...context.email };

        // Add custom tracking headers
        email.headers = {
            ...email.headers,
            'X-App-Id': 'my-email-tracker',
            'X-Message-Id': `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            'X-Environment': process.env.NODE_ENV || 'production',
        };

        // Add a tracking pixel to HTML emails
        if (email.html) {
            const trackingUrl = `https://analytics.example.com/pixel/${email.headers['X-Message-Id']}`;
            email.html = email.html + `<img src="${trackingUrl}" width="1" height="1" alt="" />`;
        }

        return email;
    }
}
```

---

## Key Points

1. **Return the descriptor to send**: Your handler **must** return an `IEmailDescriptor`. If you return the input unchanged, the email sends normally. Return a modified copy to change email fields.
2. **Throw to block**: Throw any error to prevent the email from being sent. The error message is logged by the mailer.
3. **All fields are optional**: The `IEmailDescriptor` has all optional fields. Fields you return will be used; missing fields will get defaults from SMTP settings.
4. **Copy before modifying**: Always spread the original descriptor (`{ ...context.email }`) before modifying. Mutating the original is unpredictable.
5. **Multiple handlers**: Multiple apps can register `IPreEmailSent`. Each receives the descriptor returned by the previous handler, chaining modifications.
6. **The `context` field**: The opaque `IPreEmailSentContext.context` is Rocket.Chat internal state. Do not rely on or modify it.

---

## IEmail vs IEmailDescriptor

Rocket.Chat uses two email interfaces internally:

- **`IEmail`**: Internal interface for email composition (`to`, `from`, `replyTo`, `subject`, `html`, `text`, `headers`). Used when composing emails within Rocket.Chat core.
- **`IEmailDescriptor`**: External interface passed to Apps Engine handlers. More flexible (all optional fields, supports `cc` and `bcc`). Always use this interface in Apps.

The engine converts from `IEmail` to `IEmailDescriptor` before calling your handler.
