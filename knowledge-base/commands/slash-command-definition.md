# Slash Command Definition

## Purpose

A slash command is the primary way users invoke your App inside Rocket.Chat. Users type `/your-command` followed by arguments, and your App's executor runs.

---

## Overview

A slash command is defined by implementing the `ISlashCommand` interface. You provide a `command` string (what the user types after `/`), an executor function, and optional preview capabilities for autocomplete-style interaction. Commands are registered in `extendConfiguration()` via `configuration.slashCommands.provideSlashCommand()`.

---

## When To Use

- Creating a user-facing command like `/translate`, `/poll`, `/remind`
- Commands that accept arguments and perform actions
- Commands that need autocomplete/preview while the user types
- Any interactive feature triggered from the chat input bar

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `ISlashCommand` | Slash command definition | `command`, `executor`, `providesPreview`, `previewer`, `executePreviewItem` |
| `SlashCommandContext` | Context passed to executor | `getSender()`, `getRoom()`, `getArguments()`, `getThreadId()`, `getTriggerId()` |
| `ISlashCommandsExtend` | Registering commands | `provideSlashCommand(slashCommand)` |
| `ISlashCommandsModify` | Modifying existing commands | `modifySlashCommand()`, `disableSlashCommand()`, `enableSlashCommand()` |
| `ISlashCommandPreview` | Preview result container | `i18nTitle`, `items` |
| `ISlashCommandPreviewItem` | Individual preview item | `id`, `type`, `value` |
| `SlashCommandPreviewItemType` | Enum | `IMAGE`, `VIDEO`, `AUDIO`, `TEXT`, `OTHER` |

---

## ISlashCommand Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | `string` | Yes | What the user types after `/`. Must be unique across all Apps and system commands |
| `i18nParamsExample` | `string` | Yes | i18n key or literal example of parameters to show in the autocomplete help |
| `i18nDescription` | `string` | Yes | i18n key or literal description shown in the autocomplete help |
| `permission` | `string` | No | Optional permission required to see/use this command. If omitted, all users can use it |
| `providesPreview` | `boolean` | Yes | If `true`, the `previewer` is called as the user types, and autocomplete preview items appear |
| `executor` | `(context, read, modify, http, persis) => Promise<void>` | Yes | Main handler called when the user sends the command. Not called if a preview item is clicked — `executePreviewItem` runs instead |
| `previewer?` | `(context, read, modify, http, persis) => Promise<ISlashCommandPreview>` | No | Called each keystroke as user types (only if `providesPreview: true`). Must return max 10 items |
| `executePreviewItem?` | `(item, context, read, modify, http, persis) => Promise<void>` | No | Called when the user clicks a preview item from the autocomplete list |

### Executor Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | `SlashCommandContext` | The command context: sender, room, arguments, threadId, triggerId |
| `read` | `IRead` | Read accessor for users, rooms, messages, environment, settings |
| `modify` | `IModify` | Modify accessor for creating/updating/deleting messages, rooms, users |
| `http` | `IHttp` | HTTP accessor for making external API requests |
| `persis` | `IPersistence` | Persistence accessor for storing/retrieving app data |

---

## Typical Workflow

### 1. Implement the Slash Command

```typescript
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IRead, IModify, IHttp, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';

export class RemindCommand implements ISlashCommand {
    public command = 'remind';
    public i18nParamsExample = 'me in 5 minutes "Stand up!"';
    public i18nDescription = 'Set a reminder';
    public permission = 'create-d'; // Optional: requires room message permission
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        if (args.length < 2) {
            await this.sendUsage(sender, room, modify, read);
            return;
        }

        // Parse args and schedule the reminder...
        const reminderText = args.join(' ');

        const appUser = await read.getUserReader().getAppUser();
        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`Got it, @${sender.username}! I'll remind you: "${reminderText}"`);

        await modify.getCreator().finish(builder);
    }

    private async sendUsage(
        sender: any,
        room: any,
        modify: IModify,
        read: IRead
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();
        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`Usage: /remind me in 5 minutes "Stand up!"`);

        await modify.getCreator().finish(builder);
    }
}
```

### 2. Register in `extendConfiguration()`

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend, IEnvironmentRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RemindCommand } from './commands/RemindCommand';

export class MyApp extends App {
    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(new RemindCommand());
    }
}
```

### 3. Reading Arguments

The `context.getArguments()` returns `Array<string>` — the space-separated parts after `/command`. Example: `/translate en fr Hello world` yields `['en', 'fr', 'Hello', 'world']`.

To get remaining text as one string after a positional argument:

```typescript
const args = context.getArguments();
const targetLang = args[0];          // 'en'
const sourceLang = args[1];          // 'fr'
const text = args.slice(2).join(' '); // 'Hello world'
```

---

## Example (Complete App)

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend, IEnvironmentRead, IRead, IModify, IHttp, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

class EchoCommand implements ISlashCommand {
    public command = 'echo';
    public i18nParamsExample = 'your message here';
    public i18nDescription = 'Echoes back what you say';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const text = context.getArguments().join(' ') || 'nothing to echo';
        const sender = context.getSender();
        const room = context.getRoom();
        const appUser = await read.getUserReader().getAppUser();

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`@${sender.username} said: ${text}`);

        await modify.getCreator().finish(builder);
    }
}

export class EchoApp extends App {
    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(new EchoCommand());
    }
}
```

---

## Best Practices

- **Keep `command` values short and unique** — avoid colliding with built-in commands or other Apps.
- **Use `i18nParamsExample` clearly** — it shows in the autocomplete help popup.
- **Set `providesPreview: true` only when you implement `previewer`** — otherwise the behavior is undefined.
- **Validate arguments early** — return a helpful usage message if the user provides incorrect input.
- **Use `read.getUserReader().getAppUser()`** as the message sender when your App replies.
- **Respect `context.getThreadId()`** — if the command is issued inside a thread, consider replying in the same thread.
- **Use `context.getTriggerId()`** for opening modals or UI interactions — it serves as the interaction entry point.

---

## Common Mistakes

- **Not returning a response** to the user on invalid arguments — the command appears to do nothing.
- **Blocking the executor for too long** — slash commands should respond quickly. Offload long work to a scheduler job.
- **Assuming arguments are always present** — always check `args.length` before indexing.
- **Using `sender` directly without casting** — `getSender()` returns `IUser`, which has the full user shape.
- **Forgetting `await` on `finish()`** — the message won't send.
- **Setting `providesPreview: true` without implementing `previewer`** — the client will show a broken preview UI.

---

## Related Topics

- [Slash Command Preview](./slash-command-preview.md)
- [Slash Command Context](./slash-command-context.md)
- [App Configuration](../app/app-configuration.md)
- [App Lifecycle](../app/app-lifecycle.md)
