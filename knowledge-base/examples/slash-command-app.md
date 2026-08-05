# Slash Command App

## Architecture

A full-featured slash command app demonstrating argument parsing, user/room information reading, message building with attachments, and error handling. The app registers a `/poll` command that creates a simple poll message with interactive elements, parses the user's input, reads room member information, builds a rich message with an attachment, and sends it to the room.

**Key concept**: Slash commands receive a `SlashCommandContext` that carries sender, room, arguments, thread ID, and trigger ID. Use the `IRead` accessor for data retrieval. Use `IModify.getCreator()` for message creation. Always validate input before processing.

## Folder Structure

```
slash-command-app/
  app.json
  app.ts
  commands/
    PollCommand.ts
```

## Flow

1. App registers `PollCommand` in `extendConfiguration()`
2. User types `/poll "What should we order?" "Pizza" "Sushi" "Tacos"`
3. Engine calls `PollCommand.executor(context, read, modify, http, persis)`
4. Executor gets arguments from `context.getArguments()` -- splits on spaces, respecting quotes
5. Executor validates: at least a question and two options required; sends usage help on failure
6. Executor gets sender info from `context.getSender()` and room from `context.getRoom()`
7. Executor optionally reads room members via `read.getRoomReader().getMembers(room.id)`
8. Executor gets App user via `read.getUserReader().getAppUser()`
9. Executor builds a message with text body and an attachment with poll fields
10. Message sent via `modify.getCreator().finish(builder)`

## Implementation

### app.json

```json
{
    "id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
    "version": "1.0.0",
    "requiredApiVersion": "^2.4.0",
    "iconFile": "icon.png",
    "author": {
        "name": "Your Name",
        "homepage": "https://example.com",
        "support": "https://example.com/support"
    },
    "name": "Poll",
    "nameSlug": "poll",
    "classFile": "app.ts",
    "description": "Create polls in Rocket.Chat channels.",
    "implements": []
}
```

### commands/PollCommand.ts

```typescript
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import {
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IMessageAttachment,
} from '@rocket.chat/apps-engine/definition/messages';

export class PollCommand implements ISlashCommand {
    public command = 'poll';
    public i18nParamsExample = '"Your question?" "Option 1" "Option 2" ["Option 3" ...]';
    public i18nDescription = 'Creates a poll with the given question and options';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        // Reconstruct options from space-separated arguments that may be quoted.
        // /poll "What to order?" "Pizza" "Sushi" "Tacos"
        if (args.length < 3) {
            await this.sendUsage(read, modify, room);
            return;
        }

        const question = args[0];
        const options = args.slice(1);

        if (options.length < 2) {
            await this.sendUsage(read, modify, room);
            return;
        }

        // Build the poll message
        const appUser = await read.getUserReader().getAppUser();

        const optionsText = options
            .map((opt, i) => `${i + 1}. ${opt}`)
            .join('\n');

        const pollBody = `**${question}**\n\n${optionsText}`;

        const attachment: IMessageAttachment = {
            color: '#1d74f5',
            title: { value: question },
            text: optionsText,
            author: {
                name: sender.username,
                icon: `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    sender.username,
                )}&background=1d74f5&color=fff`,
            },
            fields: options.map((opt, i) => ({
                title: `Option ${i + 1}`,
                value: opt,
                short: true,
            })),
            timestamp: new Date().toISOString(),
            collapsed: false,
        };

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`@${sender.username} created a poll:`)
            .setAttachments([attachment]);

        await modify.getCreator().finish(builder);
    }

    private async sendUsage(
        read: IRead,
        modify: IModify,
        room: any,
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(
                '**Usage:** `/poll "Your question?" "Option 1" "Option 2" ["Option 3" ...]`\n\n' +
                '**Examples:**\n' +
                '- `/poll "Where to eat?" "Pizza place" "Sushi bar"`\n' +
                '- `/poll "Sprint length?" "1 week" "2 weeks"`',
            );

        await modify.getCreator().finish(builder);
    }
}
```

### app.ts

```typescript
import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

import { PollCommand } from './commands/PollCommand';

export class PollApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(
            new PollCommand(),
        );
    }
}
```

## Best Practices

- **Validate arguments before processing**. Always check `args.length` and return a helpful usage message if the input is malformed. The command should never silently fail.
- **Use `IMessageAttachment` for rich content**. Attachments support color coding, author attribution, fields, thumbnails, and timestamps -- far more expressive than plain text.
- **Quote handling**: The slash command parser treats quoted strings as single arguments. Document this in `i18nParamsExample`.
- **Use `sender.username` for personalization**. The `getSender()` method returns the full `IUser` object with `id`, `username`, `name`, `emails`, and `roles`.
- **Send usage/help messages via the same message pipeline**. Consistent with the App's reply pattern -- small, focused helper methods keep the executor readable.
- **Derive dynamic URLs carefully**. The `ui-avatars.com` URL uses `encodeURIComponent` on the username. Always encode user-provided values in URLs.

## Related Topics

- [Slash Command Definition](../commands/slash-command-definition.md)
- [Slash Command Context](../commands/slash-command-context.md)
- [Message Attachments](../messages/message-attachments.md)
- [User Reader](../accessors/user-reader.md)
- [Modify Creator](../accessors/modify-creator.md)
- [App Configuration](../app/app-configuration.md)
