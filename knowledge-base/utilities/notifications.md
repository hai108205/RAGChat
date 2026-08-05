# Notifications

`INotifier` sends in-app notifications to users or rooms. Notifications appear in Rocket.Chat's notification center, not as chat messages.

Access via `read.getNotifier()` or `modify.getNotifier()`.

---

## INotifier Interface

```typescript
export interface INotifier {
    notifyUser(user: IUser, message: IMessage): Promise<void>;
    notifyRoom(room: IRoom, message: IMessage): Promise<void>;
    typing(options: ITypingOptions): Promise<() => Promise<void>>;
    getMessageBuilder(): IMessageBuilder;
}
```

---

## notifyUser

Send a notification to a single user. Notification appears in the notification center and stays only for the duration of the user's current session.

```typescript
const notifier = read.getNotifier();

const message = notifier.getMessageBuilder()
    .setText('You have a new alert!')
    .setRoom(currentRoom)
    .setSender(appUser)
    .getMessage();

await notifier.notifyUser(targetUser, message);
```

---

## notifyRoom

Send a notification to all online users in a room.

```typescript
const message = notifier.getMessageBuilder()
    .setText('Meeting starting in 5 minutes')
    .setRoom(room)
    .setSender(appUser)
    .getMessage();

await notifier.notifyRoom(room, message);
```

---

## Notification vs Chat Message

| Aspect | Notification (`INotifier`) | Chat Message (`IModifyCreator`) |
|---|---|---|
| Where it appears | Notification center | Chat timeline |
| Persistence | Session-only (gone after logout) | Permanent in room history |
| User must be online? | Yes | No -- sent anyway |
| Recipients | Single user or all room members | Room message (visible to all) |
| API | `notifyUser()` / `notifyRoom()` | `creator.startMessage()...creator.finish()` |

**When to use notifications:** alerts, reminders, warnings that do not belong in chat history.

**When to use chat messages:** bot replies, announcements, content that should remain in the room history.

---

## Typing Indicator

Show a "typing..." indicator for the app's bot user in a room.

```typescript
const stopTyping = await notifier.typing({
    scope: TypingScope.Room,
    id: room.id,
    username: 'my-bot', // optional, defaults to app user's name
});

// Later, when done:
await stopTyping();
```

### ITypingOptions

| Field | Type | Description |
|---|---|---|
| `scope` | `TypingScope` | Currently only `TypingScope.Room` |
| `id` | `string` | Room ID (when scope is `Room`) |
| `username` | `string?` | Display name for the typing indicator. Defaults to app bot name. |

---

## getMessageBuilder

Returns an `IMessageBuilder` for constructing notification messages. The builder is the same one used for chat messages, but the message is delivered via notification, not stored in room history.

```typescript
const builder = notifier.getMessageBuilder();
builder.setText('Notification content')
       .setRoom(room)
       .setSender(appUser);
// Optional: builder.setEmojiAvatar(':bell:');
// Optional: builder.setUsernameAlias('Alert System');
const message = builder.getMessage();
```

---

## Complete Example

```typescript
import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';

class MentionNotifier implements IPostMessageSent {
    async executePostMessageSent(
        message: IMessage, read: IRead, http: IHttp,
        persistence: IPersistence, modify: IModify,
    ): Promise<void> {
        // Only notify for @mentions
        if (!message.mentions || message.mentions.length === 0) return;

        const notifier = read.getNotifier();
        const appUser = await read.getUserReader().getAppUser();

        for (const mentionedUser of message.mentions) {
            const notifMsg = notifier.getMessageBuilder()
                .setText(`You were mentioned by ${message.sender.username} in #${await this.getRoomName(message.room, read)}`)
                .setRoom(message.room)
                .setSender(appUser)
                .getMessage();

            await notifier.notifyUser(mentionedUser, notifMsg);
        }
    }

    private async getRoomName(room: IRoom, read: IRead): Promise<string> {
        const roomInfo = await read.getRoomReader().getById(room.id);
        return roomInfo?.displayName || roomInfo?.slugifiedName || room.id;
    }
}
```
