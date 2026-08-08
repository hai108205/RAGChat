# UI Kit Action Buttons

## Purpose
Action buttons are **registered UI extensions** that appear in Rocket.Chat's native UI — message toolbar, room header, message composer, user dropdown, and room sidebar. They provide a way for Apps to add contextual actions throughout the client.

## Overview
Two-step workflow:
1. **Register** the button in `extendConfiguration()` via `configuration.ui.registerButton()`
2. **Handle** clicks in `IUIKitInteractionHandler[AppMethod.UIKIT_ACTION_BUTTON]`

Each button is an `IUIActionButtonDescriptor` specifying where it appears (`context`), its label (`labelI18n`), and optional visibility conditions (`when`).

## When to Use

- Add a custom action to messages (e.g., "Create Task", "Translate", "Report")
- Add room-level actions (e.g., "Export Chat", "Generate Summary")
- Add composer toolbar buttons (e.g., "Insert Template", "Attach from App")
- Add user profile dropdown actions (e.g., "View Profile Details")
- Add room sidebar actions (e.g., "Open Dashboard")

## Important Interfaces

### `UIActionButtonContext` Enum

```typescript
enum UIActionButtonContext {
    MESSAGE_ACTION = 'messageAction',           // Message toolbar (hover actions)
    ROOM_ACTION = 'roomAction',                 // Room header actions
    MESSAGE_BOX_ACTION = 'messageBoxAction',    // Message composer toolbar
    USER_DROPDOWN_ACTION = 'userDropdownAction', // User profile dropdown
    ROOM_SIDEBAR_ACTION = 'roomSideBarAction',   // Room sidebar
}
```

| Context | Where It Appears | What Data You Get |
|---|---|---|
| `MESSAGE_ACTION` | Message hover actions (kebab menu) | `message`, `room`, `user` |
| `ROOM_ACTION` | Room header action buttons | `room`, `user` |
| `MESSAGE_BOX_ACTION` | Message composer toolbar | `room`, `user`, `text` (composer content) |
| `USER_DROPDOWN_ACTION` | User profile card dropdown | `user` (target user) |
| `ROOM_SIDEBAR_ACTION` | Room sidebar context menu | `room`, `user` |

### `IUIActionButtonDescriptor`

```typescript
interface IUIActionButtonDescriptor {
    actionId: string;        // Unique identifier — used in handler routing
    context: UIActionButtonContext;  // Where the button appears
    labelI18n: string;       // i18n key for the button label
    variant?: 'danger';      // Red danger styling (omit for default)
    when?: IUActionButtonWhen; // Conditional visibility (optional)
    category?: 'default' | 'ai'; // Groups buttons (default | 'ai' for AI section)
}
```

### `IUActionButtonWhen` — Conditional Visibility

```typescript
interface IUActionButtonWhen {
    roomTypes?: Array<RoomTypeFilter>;        // Show only in these room types
    messageActionContext?: Array<MessageActionContext>;  // Show for messages, threads, starred
    hasOnePermission?: Array<string>;         // Show if user has at least one of these
    hasAllPermissions?: Array<string>;        // Show if user has all of these
    hasOneRole?: Array<string>;               // Show if user has at least one role
    hasAllRoles?: Array<string>;              // Show if user has all roles
}
```

### `RoomTypeFilter` Enum

```typescript
enum RoomTypeFilter {
    PUBLIC_CHANNEL = 'public_channel',
    PRIVATE_CHANNEL = 'private_channel',
    PUBLIC_TEAM = 'public_team',
    PRIVATE_TEAM = 'private_team',
    PUBLIC_DISCUSSION = 'public_discussion',
    PRIVATE_DISCUSSION = 'private_discussion',
    DIRECT = 'direct',
    DIRECT_MULTIPLE = 'direct_multiple',
    LIVE_CHAT = 'livechat',
}
```

### `MessageActionContext` Enum

```typescript
enum MessageActionContext {
    MESSAGE = 'message',
    MESSAGE_MOBILE = 'message-mobile',
    THREADS = 'threads',
    STARRED = 'starred',
}
```

### `IUIExtend`

```typescript
interface IUIExtend {
    registerButton(button: IUIActionButtonDescriptor): void;
}
```

### `IUIController`

```typescript
interface IUIController {
    openModalView(view, context, user): Promise<void>;
    updateModalView(view, context, user): Promise<void>;
    openContextualBarView(view, context, user): Promise<void>;
    updateContextualBarView(view, context, user): Promise<void>;
    setViewError(errorInteraction, context, user): Promise<void>;
    openSurfaceView(view, context, user): Promise<void>;
    updateSurfaceView(view, context, user): Promise<void>;
}
```

Note: `IUIController` is typically used from within accessor methods. For response-based UI operations from handlers, prefer `UIKitInteractionResponder` (accessed via `context.getInteractionResponder()`).

## Typical Workflow

1. **Register** one or more action buttons in `extendConfiguration()`
2. **Implement** `IUIKitInteractionHandler` on your App class
3. **Route** by `actionId` in `[AppMethod.UIKIT_ACTION_BUTTON]`
4. **Respond** with a success, modal, or contextual bar

## Step 1: Register Action Buttons

Register in `extendConfiguration()` via `configuration.ui.registerButton()`:

```typescript
import {
    IConfigurationExtend,
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {
    UIActionButtonContext,
    RoomTypeFilter,
    MessageActionContext,
} from '@rocket.chat/apps-engine/definition/ui';
import {
    IUIKitInteractionHandler,
    UIKitActionButtonInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { AppMethod } from '@rocket.chat/apps-engine/definition/metadata';

export class MyApp extends App implements IUIKitInteractionHandler {
    public async extendConfiguration(configuration: IConfigurationExtend) {
        // Message action: appears on every message's kebab menu
        configuration.ui.registerButton({
            actionId: 'create-task-from-message',
            context: UIActionButtonContext.MESSAGE_ACTION,
            labelI18n: 'Create Task',
            when: {
                roomTypes: [
                    RoomTypeFilter.PUBLIC_CHANNEL,
                    RoomTypeFilter.PRIVATE_CHANNEL,
                    RoomTypeFilter.DIRECT,
                ],
                messageActionContext: [
                    MessageActionContext.MESSAGE,
                    MessageActionContext.THREADS,
                ],
            },
        });

        // Room action: appears in the room header
        configuration.ui.registerButton({
            actionId: 'export-chat-log',
            context: UIActionButtonContext.ROOM_ACTION,
            labelI18n: 'Export Chat',
            variant: 'danger',
            when: {
                hasAllPermissions: ['can-export-room'],
            },
        });

        // Message box action: appears in the composer toolbar
        configuration.ui.registerButton({
            actionId: 'insert-template',
            context: UIActionButtonContext.MESSAGE_BOX_ACTION,
            labelI18n: 'Insert Template',
            when: {
                roomTypes: [
                    RoomTypeFilter.PUBLIC_CHANNEL,
                    RoomTypeFilter.PRIVATE_CHANNEL,
                ],
            },
        });

        // User dropdown action: appears when clicking a user's avatar
        configuration.ui.registerButton({
            actionId: 'view-user-activity',
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
            labelI18n: 'View Activity',
        });

        // Room sidebar action: right-click on room in sidebar
        configuration.ui.registerButton({
            actionId: 'open-dashboard',
            context: UIActionButtonContext.ROOM_SIDEBAR_ACTION,
            labelI18n: 'Dashboard',
        });

        // AI category: groups into the AI section of the message composer
        configuration.ui.registerButton({
            actionId: 'summarize-thread',
            context: UIActionButtonContext.MESSAGE_BOX_ACTION,
            labelI18n: 'Summarize Thread',
            category: 'ai',
        });
    }
}
```

## Step 2: Handle Action Button Clicks

```typescript
async [AppMethod.UIKIT_ACTION_BUTTON](
    context: UIKitActionButtonInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
) {
    const { actionId, user, room, triggerId, message, buttonContext } =
        context.getInteractionData();
    const responder = context.getInteractionResponder();

    switch (actionId) {
        case 'create-task-from-message': {
            if (!message) {
                return responder.errorResponse();
            }
            // Build a task creation modal pre-filled with message content
            const blocks = new BlockBuilder(this.getID());
            blocks.addSectionBlock({
                text: blocks.newMarkdownTextObject(
                    `Creating task from:\n> ${message.text}`,
                ),
            });
            blocks.addInputBlock({
                label: blocks.newPlainTextObject('Task Title'),
                element: blocks.newPlainTextInputElement({
                    placeholder: blocks.newPlainTextObject('Enter task title'),
                    actionId: 'task-title',
                }),
            });
            return responder.openModalViewResponse({
                title: blocks.newPlainTextObject('Create Task'),
                blocks: blocks.getBlocks(),
                submit: blocks.newButtonElement({
                    text: blocks.newPlainTextObject('Create'),
                }),
            });
        }

        case 'insert-template': {
            // For MESSAGE_BOX_ACTION, we can manipulate composer text
            const interaction = context.getInteractionData();
            if ('text' in interaction) {
                const template = `**Template:**\n- Item 1\n- Item 2\n- Item 3`;
                // Use modify to update composer content
                const msgBuilder = modify.getCreator().startMessage()
                    .setRoom(room)
                    .setSender(user as any)
                    .setText(template);
                await modify.getCreator().finish(msgBuilder);
            }
            return responder.successResponse();
        }

        case 'view-user-activity': {
            return responder.openModalViewResponse({
                title: { type: 'plain_text', text: 'User Activity' },
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'plain_text', text: 'Activity data loading...', emoji: true },
                    },
                ],
            });
        }

        default:
            return responder.successResponse();
    }
}
```

## Handling `MESSAGE_BOX_ACTION` Specifically

The `MESSAGE_BOX_ACTION` context provides an additional property: `text` (the current composer content). You can check for it using the `isMessageBoxIncomingInteraction` type guard:

```typescript
import { isMessageBoxIncomingInteraction } from '@rocket.chat/apps-engine/definition/uikit';

async [AppMethod.UIKIT_ACTION_BUTTON](context, read, http, persistence, modify) {
    const interaction = context.getInteractionData();

    if (isMessageBoxIncomingInteraction(interaction)) {
        // interaction now typed as IUIKitActionButtonMessageBoxIncomingInteraction
        const composerText = interaction.text; // string | undefined
        // ... use composer text
    }
}
```

## Conditional Visibility (`when`) Reference

| Condition | Type | Description |
|---|---|---|
| `roomTypes` | `RoomTypeFilter[]` | Only visible in specified room types |
| `messageActionContext` | `MessageActionContext[]` | Only for messages, threads, starred messages (MESSAGE_ACTION only) |
| `hasOnePermission` | `string[]` | User has at least one listed permission |
| `hasAllPermissions` | `string[]` | User has all listed permissions |
| `hasOneRole` | `string[]` | User has at least one listed role |
| `hasAllRoles` | `string[]` | User has all listed roles |

All conditions within the `when` object are ANDed together. Omit `when` entirely to show the button unconditionally.

## Best Practices

1. **Use descriptive `actionId` values** — `create-task-from-message` is clearer than `btn1`.
2. **Scope with `when`** — don't show a channel-only action in DMs. Use `roomTypes` to filter.
3. **Use `variant: 'danger'` sparingly** — reserved for destructive actions (delete, remove, archive).
4. **Use `category: 'ai'`** for AI-related buttons — they appear grouped in the AI section of the composer.
5. **Keep `MESSAGE_BOX_ACTION` inline** — composer actions should be quick; complex forms should open in a modal instead.
6. **Handle missing `message`** — `MESSAGE_ACTION` might not always have a message payload. Guard with an `if (!message)` check.

## Common Mistakes

- **Not implementing `IUIKitInteractionHandler`** — if your App class doesn't `implements IUIKitInteractionHandler`, the framework won't recognize the handler methods.
- **Duplicate `actionId` across buttons** — the handler routes by `actionId`; duplicates cause ambiguous behavior.
- **Using `MESSAGE_ACTION` without `messageActionContext`** — the button may not appear if the context filter is too broad or unexpected.
- **Forgetting `triggerId` is required for modals** — `openModalViewResponse()` works because the context provides `triggerId`. Don't try to open a modal from outside a handler.
- **Modifying the room/modifying data without checking permissions** — use `hasAllPermissions` in the `when` clause to pre-filter, but also validate in the handler for defense-in-depth.

## Related Topics
- [UI Kit Interaction Handler](./uikit-interaction-handler.md)
- [UI Kit Modals](./uikit-modals.md)
- [UI Kit Elements](./uikit-elements.md)
- [UI Kit Block Builder](./uikit-block-builder.md)
