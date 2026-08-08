# Moderation

`IModerationModify` allows apps to report messages and dismiss reports. Access via `modify.getModerationModifier()`.

---

## IModerationModify Interface

```typescript
export interface IModerationModify {
    report(messageId: string, description: string, userId: string, appId: string): Promise<void>;
    dismissReportsByMessageId(messageId: string, reason: string, action: string, appId: string): Promise<void>;
    dismissReportsByUserId(userId: string, reason: string, action: string, appId: string): Promise<void>;
}
```

Access via:

```typescript
const moderation = modify.getModerationModifier();
```

---

## Report a Message

```typescript
await moderation.report(
    messageId,       // The id of the message to report
    'Spam content',  // Description explaining the reason for the report
    userId,          // The userId to be reported (the message sender)
    appId,           // Your app's id
);
```

---

## Dismiss Reports by Message ID

Dismiss all reports associated with a specific message.

```typescript
await moderation.dismissReportsByMessageId(
    messageId,
    'False alarm -- message reviewed and is clean', // Reason for dismissal
    'dismiss',                                       // Action taken
    appId,
);
```

---

## Dismiss Reports by User ID

Dismiss all reports against a specific user.

```typescript
await moderation.dismissReportsByUserId(
    userId,
    'User was warned and content removed', // Reason for dismissal
    'content_removed',                      // Action taken
    appId,
);
```

---

## Post-Message Report Handler

Listen for message reports via `IPostMessageReported`:

```typescript
import { IPostMessageReported } from '@rocket.chat/apps-engine/definition/messages';

class ReportLogger implements IPostMessageReported {
    async executePostMessageReported(
        context: IMessageReportContext,
        read: IRead, http: IHttp, persistence: IPersistence, modify: IModify,
    ): Promise<void> {
        const message = context.message;
        const reporter = context.user;

        console.log(
            `Message ${message.id} reported by ${reporter.username}: ${context.reason}`
        );

        // Auto-dismiss if report is frivolous
        if (context.reason === 'spam' && await this.isVerifiedUser(reporter, read)) {
            await modify.getModerationModifier().dismissReportsByMessageId(
                message.id, 'Auto-dismissed for verified user', 'auto_dismiss', read.getAppId(),
            );
        }
    }

    private async isVerifiedUser(user: IUser, read: IRead): Promise<boolean> {
        // Custom logic
        return true;
    }
}
```

---

## Complete Example: Auto-Moderation Bot

```typescript
import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IModerationModify } from '@rocket.chat/apps-engine/definition/accessors';

class AutoModerator implements IPostMessageSent {
    private blockedWords = ['spam', 'scam', 'phishing'];
    private appId: string;

    constructor(appId: string) {
        this.appId = appId;
    }

    async executePostMessageSent(
        message: IMessage, read: IRead, http: IHttp,
        persistence: IPersistence, modify: IModify,
    ): Promise<void> {
        const text = message.text?.toLowerCase() || '';

        if (this.blockedWords.some(w => text.includes(w))) {
            const moderation = modify.getModerationModifier();

            // Report the message
            await moderation.report(
                message.id,
                `Blocked word detected in message`,
                message.sender.id,
                this.appId,
            );

            // Also delete the message
            const user = await read.getUserReader().getById(message.sender.id);
            if (user) {
                await modify.getDeleter().deleteMessage(message, user);
            }
        }
    }
}
```

---

## Permissions

Using moderation features requires appropriate app permissions. Ensure your app declares them in its manifest.
