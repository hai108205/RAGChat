# Slash Command Context

## Purpose

`SlashCommandContext` is the context object passed to every slash command handler (`executor`, `previewer`, and `executePreviewItem`). It provides information about the user, room, arguments, thread, and an interaction trigger.

---

## Overview

The context is created by the Rocket.Chat engine whenever a user invokes a slash command. It encapsulates all the information your App needs to understand the execution environment: who issued the command, where, with what arguments, and whether it's part of a thread or UI interaction.

---

## When To Use

- Getting the sender to personalize the response
- Getting the room to know where to reply
- Parsing command arguments
- Checking if the command is inside a thread
- Getting the `triggerId` to open modals or UI Kit interfaces

---

## SlashCommandContext Class

```typescript
export class SlashCommandContext {
    constructor(
        private sender: IUser,
        private room: IRoom,
        private params: Array<string>,
        private threadId?: string,
        private triggerId?: string,
    ) {}
}
```

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getSender()` | `IUser` | The user who sent the slash command |
| `getRoom()` | `IRoom` | The room where the command was sent |
| `getArguments()` | `Array<string>` | The space-separated arguments typed after the command |
| `getThreadId()` | `string \| undefined` | The thread ID if the command was sent in a thread context. `undefined` otherwise |
| `getTriggerId()` | `string \| undefined` | The trigger ID for opening UI modals/interactions. `undefined` if not applicable |

---

## Argument Parsing

`getArguments()` returns a string array split by whitespace. For `/weather San Francisco in celsius`, you get `['San', 'Francisco', 'in', 'celsius']`.

### Simple positional arguments

```typescript
const args = context.getArguments();
const firstArg = args[0];      // 'San'
const secondArg = args[1];     // 'Francisco'
```

### Remaining text after a positional argument

```typescript
const args = context.getArguments();
const subCommand = args[0];                         // e.g. 'create'
const remaining = args.slice(1).join(' ');          // everything after the sub-command
```

### Quoted arguments (manual parsing)

The engine does NOT handle quoted arguments natively. `/command "hello world" foo` gives `['"hello', 'world"', 'foo']`. Use a simple parser if you need quoted-string support:

```typescript
function parseArgs(rawArgs: Array<string>): Array<string> {
    const joined = rawArgs.join(' ');
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    const result: Array<string> = [];
    let match;
    while ((match = regex.exec(joined)) !== null) {
        result.push(match[1] ?? match[2] ?? match[3]);
    }
    return result;
}

const parsed = parseArgs(context.getArguments());
// /command "hello world" foo => ['hello world', 'foo']
```

---

## Using the Sender

`getSender()` returns an `IUser` object. Common usage:

```typescript
const sender = context.getSender();
const username = sender.username;     // 'john.doe'
const senderName = sender.name;       // 'John Doe'
const senderId = sender.id;           // user's _id

// Personalize the response
const greeting = `Hello, @${username}!`;

// Check roles or type
if (sender.type === 'bot') {
    // Ignore bot commands if needed
    return;
}
```

---

## Using the Room

`getRoom()` returns an `IRoom` object. Common usage:

```typescript
const room = context.getRoom();
const roomId = room.id;               // room _id
const roomName = room.displayName;    // readable name
const roomType = room.type;           // 'c' (channel), 'p' (private), 'd' (direct), 'l' (livechat)

// Reply in the same room
const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(appUser)
    .setText('Your response here');

// Check room properties
if (room.type === 'd') {
    // Handler for direct messages
}
```

---

## Using Thread ID

`getThreadId()` tells you if the command was sent inside a thread. Replying in the same thread respects the conversation context:

```typescript
const threadId = context.getThreadId();

const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(appUser)
    .setText('Reply in thread');

if (threadId) {
    builder.setThreadId(threadId);       // Reply inside the thread
}
```

---

## Using Trigger ID

`getTriggerId()` provides an ID needed for UI interactions like opening modals:

```typescript
const triggerId = context.getTriggerId();

if (triggerId) {
    const modal = modify.getUiController().openModalView(
        {
            id: 'my-modal',
            title: { type: 'plain_text', text: 'My Modal' },
            blocks: [/* ... */],
            submit: { type: 'button', text: { type: 'plain_text', text: 'OK' } },
        },
        { triggerId },
        context.getSender(),
    );
}
```

The `triggerId` is a one-time-use token scoped to the current interaction. It is required by `openModalView()` and `openContextualBar()` to associate the UI element with the slash command invocation.

---

## Example (Complete Context Usage)

```typescript
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

class TicketCommand implements ISlashCommand {
    public command = 'ticket';
    public i18nParamsExample = 'create "Server down" priority high';
    public i18nDescription = 'Create a support ticket';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const sender = context.getSender();
        const room = context.getRoom();
        const args = context.getArguments();
        const threadId = context.getThreadId();
        const triggerId = context.getTriggerId();

        if (args.length === 0) {
            // Open a modal for ticket creation instead of requiring CLI args
            if (triggerId) {
                await modify.getUiController().openModalView(
                    this.buildTicketModal(),
                    { triggerId },
                    sender,
                );
            } else {
                await this.sendHelp(read, modify, room);
            }
            return;
        }

        const subCommand = args[0].toLowerCase();

        if (subCommand === 'create') {
            const title = args.slice(1).join(' ');
            if (!title) {
                await this.sendHelp(read, modify, room);
                return;
            }

            const ticketId = await this.createTicket(title, sender, read);
            const appUser = await read.getUserReader().getAppUser();

            const builder = modify.getCreator().startMessage()
                .setRoom(room)
                .setSender(appUser)
                .setText(`Ticket #${ticketId} created by @${sender.username}: "${title}"`);

            if (threadId) {
                builder.setThreadId(threadId);
            }

            await modify.getCreator().finish(builder);
        }
    }

    private async sendHelp(read: IRead, modify: IModify, room: any): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();
        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText('Usage: /ticket create "Ticket title"');

        await modify.getCreator().finish(builder);
    }

    private buildTicketModal(): any {
        return {
            id: 'ticket-modal',
            title: { type: 'plain_text', text: 'Create Ticket' },
            blocks: [
                {
                    type: 'input',
                    element: {
                        type: 'plain_text_input',
                        actionId: 'ticket-title',
                        placeholder: { type: 'plain_text', text: 'Enter ticket title' },
                    },
                    label: { type: 'plain_text', text: 'Title' },
                },
            ],
            submit: { type: 'button', text: { type: 'plain_text', text: 'Create' } },
        };
    }

    private async createTicket(title: string, sender: any, read: IRead): Promise<string> {
        // External API call or persistence logic
        return 'TICKET-123';
    }
}
```

---

## Best Practices

- **Check `args.length` before indexing** — never assume the user provided arguments.
- **Use `getSender()` for personalization** — include `@username` mentions in responses.
- **Respect `threadId`** — reply in-thread when the command context is threaded.
- **Use `triggerId` early** — it is a one-time token. Open your modal immediately or it may expire.
- **Fall back gracefully** when `triggerId` is unavailable — use a text response instead.
- **Parse arguments defensively** — handle extra spaces, missing arguments, and unexpected input.

---

## Common Mistakes

- **Assuming `getArguments()` is never empty** — `/command` with no args returns `[]`.
- **Using quoted-string expectations** — the engine splits on whitespace, quotes are not special.
- **Ignoring `getThreadId()`** — replies appear outside the thread context.
- **Trying to use a `triggerId` more than once** — it is consumed on first use.
- **Using `getSender()` without checking for bot type** — can cause infinite bot loops.
- **Not validating room type** — a DM-only command should check `room.type === 'd'`.

---

## Related Topics

- [Slash Command Definition](./slash-command-definition.md)
- [Slash Command Preview](./slash-command-preview.md)
- [User Structure](../users/user-structure.md)
- [Room Structure](../rooms/room-structure.md)
- [UI Kit / Modals](https://developer.rocket.chat/apps-engine/ui-kit)
