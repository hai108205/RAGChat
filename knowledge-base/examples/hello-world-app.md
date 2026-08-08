# Hello World App

## Architecture

The minimal Rocket.Chat App. A single slash command `/hello-world` that responds with "Hello, World!" in the current room. Demonstrates the four essential building blocks: extending the `App` class, registering a slash command in `extendConfiguration()`, using accessors to read user info and create messages, and defining the app metadata in `app.json`.

No external dependencies. No persistence. No HTTP calls. Pure Rocket.Chat Apps Engine.

**Key concept**: Every App starts with a class extending `App`, calling `super(info, logger, accessors)` and overriding `extendConfiguration()` to register capabilities.

## Folder Structure

```
hello-world-app/
  app.json
  app.ts
  commands/
    HelloWorldCommand.ts
```

## Flow

1. Rocket.Chat loads the App, reads `app.json` for metadata (`id`, `name`, `classFile`, `iconFile`)
2. Engine instantiates the class from `app.ts` -- calls constructor, then `initialize()`
3. On install/enable, engine calls `extendConfiguration()` where the slash command is registered
4. User types `/hello-world` in any channel
5. Engine invokes `HelloWorldCommand.executor()` with context and accessors
6. Executor reads the App user via `read.getUserReader().getAppUser()`
7. Executor builds a message via `modify.getCreator().startMessage()` chain
8. Message is sent to the room via `modify.getCreator().finish(builder)`

## Implementation

### app.json

```json
{
    "id": "60ae6bb9-6cd6-4a63-b65a-6b0ecbae0e8e",
    "version": "1.0.0",
    "requiredApiVersion": "^2.4.0",
    "iconFile": "icon.png",
    "author": {
        "name": "Your Name",
        "homepage": "https://example.com",
        "support": "https://example.com/support"
    },
    "name": "Hello World",
    "nameSlug": "hello-world",
    "classFile": "app.ts",
    "description": "A minimal Rocket.Chat App that says hello.",
    "implements": []
}
```

### commands/HelloWorldCommand.ts

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

export class HelloWorldCommand implements ISlashCommand {
    public command = 'hello-world';
    public i18nParamsExample = '';
    public i18nDescription = 'Says hello to the world!';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const room = context.getRoom();
        const sender = context.getSender();

        const appUser = await read.getUserReader().getAppUser();

        const messageBuilder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`Hello, World! (requested by @${sender.username})`);

        await modify.getCreator().finish(messageBuilder);
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

import { HelloWorldCommand } from './commands/HelloWorldCommand';

export class HelloWorldApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(
            new HelloWorldCommand(),
        );
    }
}
```

## Best Practices

- **Always call `super(info, logger, accessors)`** in the constructor. The base App class initializes internal state required by the engine.
- **Use `read.getUserReader().getAppUser()`** as the message sender. The App has its own bot user -- messages sent as the App user are clearly attributed.
- **Log with `this.getLogger()`** (accessible from the App class) for debugging. The engine routes logs to the Rocket.Chat logger.
- **Return `Promise<void>` from executor**. The engine awaits the promise; unhandled rejections surface as command failures.
- **Keep `i18nParamsExample` and `i18nDescription` meaningful** -- they appear in the slash command autocomplete popup.
- **Set `providesPreview: false`** unless you implement `previewer` and `executePreviewItem`. Otherwise the autocomplete UI breaks.

## Related Topics

- [App Lifecycle](../app/app-lifecycle.md)
- [App Configuration](../app/app-configuration.md)
- [Slash Command Definition](../commands/slash-command-definition.md)
- [Slash Command Context](../commands/slash-command-context.md)
- [IRead Accessor](../accessors/i-read-accessor.md)
- [IModify Accessor](../accessors/i-modify-accessor.md)
