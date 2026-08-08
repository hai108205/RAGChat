# Message Reactions

## Purpose

`IMessageReactions` represents emoji reactions on a Rocket.Chat message. Any user can react to any message with an emoji, and the reactions are stored as a map of emoji to arrays of usernames.

---

## Overview

Reactions are stored on the `IMessage.reactions` property as a dictionary where each key is an emoji string (wrapped in colons, e.g., `':thumbsup:'`, `':heart:'`) and each value is an array of `IMessageReaction` objects containing usernames. Unicode emoji (e.g., `'👍'`) may also appear as keys.

Reactions are cumulative — multiple users can add the same emoji, and all usernames are aggregated. When the last user removes their reaction, the emoji key may be removed entirely or left with an empty usernames array.

---

## When To Use

- Reading reactions on an incoming message → `message.reactions[':heart:']`
- Checking if a specific user reacted with a specific emoji → check `usernames.includes(username)`
- Counting total reactions on a message → iterate keys and sum usernames
- Finding the most popular reaction → find the key with the largest usernames array

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IMessageReactions` | Dictionary of emoji → reaction data | `[emoji: string]: Array<IMessageReaction>` |
| `IMessageReaction` | Reaction data for one emoji | `usernames: string[]` |
| `Reaction` | Type alias | `` `:${string}:` `` — emoji wrapped in colons |

---

## Interface Details

### Reaction (Type Alias)

```typescript
export type Reaction = `:${string}:`;
```

A template literal type for colon-wrapped emoji strings (e.g., `':smile:'`, `':+1:'`). Note that in practice, Unicode emoji may also appear as keys without colons.

### IMessageReactions

```typescript
export interface IMessageReactions {
    [emoji: string]: Array<IMessageReaction>;
}
```

A string-indexed dictionary. Each key is the emoji identifier and each value is an array (typically length 1) of `IMessageReaction` objects.

### IMessageReaction

```typescript
export interface IMessageReaction {
    usernames?: Array<string>;
}
```

Contains an optional array of usernames who reacted with this emoji. It is wrapped in an array on the parent `IMessageReactions` for protocol compatibility, but most reactions have a single entry.

---

## Typical Workflow

### 1. Reading Reactions from a Message

```typescript
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

function readReactions(message: IMessage): void {
    const reactions = message.reactions;

    if (!reactions) {
        console.log('No reactions on this message');
        return;
    }

    // Iterate over each emoji reaction
    for (const [emoji, reactionDataList] of Object.entries(reactions)) {
        // reactionDataList is Array<IMessageReaction> — usually length 1
        const usernames = reactionDataList[0]?.usernames ?? [];
        console.log(`${emoji}: ${usernames.length} user(s) — ${usernames.join(', ')}`);
    }
}
```

### 2. Checking If a Specific User Reacted

```typescript
function hasUserReacted(
    message: IMessage,
    emoji: string,
    username: string
): boolean {
    const reactions = message.reactions;
    if (!reactions || !reactions[emoji]) return false;

    for (const reactionData of reactions[emoji]) {
        if (reactionData.usernames?.includes(username)) {
            return true;
        }
    }
    return false;
}

// Usage
if (hasUserReacted(message, ':heart:', 'john.doe')) {
    console.log('John reacted with :heart:');
}
```

### 3. Counting All Reactions on a Message

```typescript
function countReactions(message: IMessage): number {
    if (!message.reactions) return 0;

    let total = 0;
    for (const reactionDataList of Object.values(message.reactions)) {
        for (const reactionData of reactionDataList) {
            total += reactionData.usernames?.length ?? 0;
        }
    }
    return total;
}

// Usage
console.log(`Total reactions: ${countReactions(message)}`);
```

### 4. Finding the Most Popular Reaction

```typescript
function mostPopularReaction(message: IMessage): {
    emoji: string;
    count: number;
} | null {
    if (!message.reactions) return null;

    let bestEmoji = '';
    let bestCount = 0;

    for (const [emoji, reactionDataList] of Object.entries(message.reactions)) {
        const count = reactionDataList.reduce(
            (sum, r) => sum + (r.usernames?.length ?? 0),
            0
        );
        if (count > bestCount) {
            bestCount = count;
            bestEmoji = emoji;
        }
    }

    return bestEmoji ? { emoji: bestEmoji, count: bestCount } : null;
}
```

---

## Example

### Message Handler That Analyzes Reactions

```typescript
import {
    IMessage,
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';

async function analyzeReactions(
    message: IMessage,
    read: IRead,
    modify: IModify,
): Promise<void> {
    if (!message.reactions) return;

    const reactionSummary = Object.entries(message.reactions)
        .map(([emoji, dataList]) => {
            const count = dataList.reduce(
                (sum, r) => sum + (r.usernames?.length ?? 0),
                0
            );
            return `${emoji} x${count}`;
        })
        .join(', ');

    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startMessage()
        .setRoom(message.room)
        .setSender(appUser)
        .setText(`Current reactions: ${reactionSummary}`);

    await modify.getCreator().finish(builder);
}
```

---

## Best Practices

- **Check for undefined** — `message.reactions` is optional. Always guard with `if (message.reactions)`.
- **Access usernames via `reactions[emoji][0]?.usernames`** — the array wrapper (usually length 1) is part of the protocol.
- **Use `usernames?.includes(username)`** with optional chaining since `usernames` is optional.
- **Be aware of both colon-wrapped and raw emoji keys** — `':+1:'` and `'👍'` may both appear depending on the Rocket.Chat version.
- **React to reactions via the event handler** — use `IPostMessageReacted` or similar lifecycle hooks to detect new reactions.

---

## Common Mistakes

- **Accessing `reactions[emoji].usernames` directly** — `reactions[emoji]` returns `Array<IMessageReaction>`, not `IMessageReaction` directly. Must index: `reactions[emoji][0].usernames`.
- **Assuming every message has reactions** — `message.reactions` is optional and `undefined` for most messages.
- **Assuming colon-wrapped emoji** — the keys may be raw Unicode emoji or colon-wrapped. Support both.
- **Not handling removed reactions** — when all users remove their reaction, the key may be deleted or contain an empty `usernames` array. Handle both cases.
- **Confusing reactions with actions** — Reactions are emoji (smiley faces, thumbs up). Actions are buttons on attachments. They are entirely different concepts.

---

## Related Topics

- [Message Structure](./message-structure.md)
- [Message Attachments](./message-attachments.md)
- [Message Files](./message-files.md)
- [Message Actions](./message-actions.md)
