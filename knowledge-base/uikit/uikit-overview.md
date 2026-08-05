# UI Kit Overview

## Purpose

Rocket.Chat's UI Kit enables Apps to build interactive user interfaces — modals, action buttons, contextual bars — using a block-based composition system. Apps define blocks, users interact with them, and handlers respond by opening or updating surfaces.

---

## Overview

UI Kit is modeled after Slack's Block Kit. Developers compose interfaces declaratively using blocks (sections, inputs, actions, images, dividers) arranged on **surfaces** (modals, contextual bars, home tab). When a user clicks a button, submits a form, or triggers an action button, an **incoming interaction** is dispatched to the App's handler. The handler uses a **responder** to send back a response: another surface, an update to the current surface, error validation, or a simple success/failure acknowledgment.

The core loop:

```
Define blocks → User interacts → Handler fires → Responder returns surface or error
```

---

## When To Use

- Collecting user input via a modal form
- Displaying contextual information in the contextual bar
- Adding interactive action buttons to messages or message boxes
- Validating form input and showing field-level errors
- Updating an open surface in response to a user action
- Showing rich formatted content using sections, images, and context blocks

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `UIKitInteractionType` | Enum of all interaction types | `MODAL_OPEN`, `MODAL_CLOSE`, `MODAL_UPDATE`, `CONTEXTUAL_BAR_OPEN`, `CONTEXTUAL_BAR_CLOSE`, `CONTEXTUAL_BAR_UPDATE`, `ERRORS` |
| `IUIKitResponse` | Base response type | `success: boolean` |
| `IUIKitInteraction` | Base interaction sent to handler | `type`, `triggerId`, `appId` |
| `IUIKitModalInteraction` | Modal open/update/close interaction | extends `IUIKitInteraction`, adds `view: IUIKitSurface` |
| `IUIKitContextualBarInteraction` | Contextual bar open/update/close interaction | extends `IUIKitInteraction`, adds `view: IUIKitSurface` |
| `IUIKitErrorInteraction` | Error interaction for form validation | extends `IUIKitInteraction`, adds `viewId`, `errors` |
| `IUIKitBaseIncomingInteraction` | Incoming interaction data from Rocket.Chat | `appId`, `user`, `actionId`, `room`, `triggerId`, `threadId` |
| `IUIKitBlockIncomingInteraction` | Block action (button click, select change) | extends base, adds `value`, `message`, `blockId`, `container` |
| `IUIKitViewSubmitIncomingInteraction` | View/form submission | extends base, adds `view: IUIKitSurface` |
| `IUIKitViewCloseIncomingInteraction` | View/modal close event | extends base, adds `view`, `isCleared` |
| `IUIKitActionButtonIncomingInteraction` | Action button triggered | extends base, adds `buttonContext`, `actionId`, `triggerId`, `room`, `message` |
| `UIKitInteractionContext` | Abstract context wrapping incoming interaction + responder | `getInteractionResponder()`, `getInteractionData()` |
| `UIKitBlockInteractionContext` | Context for block action interactions | extends `UIKitInteractionContext` |
| `UIKitViewSubmitInteractionContext` | Context for view submit interactions | extends `UIKitInteractionContext` |
| `UIKitViewCloseInteractionContext` | Context for view close interactions | extends `UIKitInteractionContext` |
| `UIKitActionButtonInteractionContext` | Context for action button interactions | extends `UIKitInteractionContext` |
| `UIKitInteractionResponder` | Response builder returned by `getInteractionResponder()` | `successResponse()`, `errorResponse()`, `openModalViewResponse()`, `updateModalViewResponse()`, `openContextualBarViewResponse()`, `updateContextualBarViewResponse()`, `viewErrorResponse()` |
| `IUIKitModalViewParam` | Param type for opening/updating modals | `Omit<IUIKitSurface, 'appId' \| 'id' \| 'type'> & Partial<Pick<IUIKitSurface, 'id'>>` |
| `IUIKitContextualBarViewParam` | Param type for opening/updating contextual bars | Same structure as `IUIKitModalViewParam` |

---

## UIKitInteractionType Enum

```typescript
export enum UIKitInteractionType {
    MODAL_OPEN              = 'modal.open',
    MODAL_CLOSE             = 'modal.close',
    MODAL_UPDATE            = 'modal.update',
    CONTEXTUAL_BAR_OPEN     = 'contextual_bar.open',
    CONTEXTUAL_BAR_CLOSE    = 'contextual_bar.close',
    CONTEXTUAL_BAR_UPDATE   = 'contextual_bar.update',
    ERRORS                  = 'errors',
}
```

Each value maps to a specific action:
- **MODAL_OPEN** — Open a new modal dialog
- **MODAL_CLOSE** — Close the current modal
- **MODAL_UPDATE** — Update the currently open modal with new content
- **CONTEXTUAL_BAR_OPEN** — Open the contextual sidebar
- **CONTEXTUAL_BAR_CLOSE** — Close the contextual sidebar
- **CONTEXTUAL_BAR_UPDATE** — Update the contextual sidebar content
- **ERRORS** — Display field-level validation errors on the current view

---

## IUIKitResponse and IUIKitInteraction

Every interaction starts with a base `IUIKitInteraction` and every response derives from `IUIKitResponse`:

```typescript
export interface IUIKitResponse {
    success: boolean;
}

export interface IUIKitInteraction {
    type: UIKitInteractionType;
    triggerId: string;
    appId: string;
}
```

**Modal and Contextual Bar interactions** extend `IUIKitInteraction` with a `view: IUIKitSurface`:

```typescript
export interface IUIKitModalInteraction extends IUIKitInteraction {
    type: UIKitInteractionType.MODAL_OPEN | UIKitInteractionType.MODAL_UPDATE | UIKitInteractionType.MODAL_CLOSE;
    view: IUIKitSurface;
}
```

**Error interactions** add `viewId` and field-to-message error map:

```typescript
export interface IUIKitErrorInteraction extends IUIKitInteraction {
    type: UIKitInteractionType.ERRORS;
    viewId: string;
    errors: { [field: string]: string };
}
```

---

## UIKitInteractionContext Hierarchy

When a user triggers an interaction, Rocket.Chat dispatches an incoming interaction to the App's handler. The handler receives a context object whose concrete type depends on what the user did:

```
UIKitInteractionContext (abstract)
├── UIKitBlockInteractionContext        — user clicked a button, selected an option, etc.
├── UIKitViewSubmitInteractionContext   — user submitted a modal form
├── UIKitViewCloseInteractionContext    — user closed a modal
└── UIKitActionButtonInteractionContext — user clicked a registered action button
```

Every context provides two methods:
- `getInteractionData()` — returns the incoming interaction data (specific to the context type)
- `getInteractionResponder()` — returns a `UIKitInteractionResponder` for building the response

The base `UIKitInteractionContext` extracts `appId`, `actionId`, `room`, `user`, `triggerId`, and `threadId` from the incoming interaction and passes them to the responder.

---

## UIKitInteractionResponder

Returned by `context.getInteractionResponder()`. Each method builds a typed response:

| Method | Returns | Purpose |
|--------|---------|---------|
| `successResponse()` | `IUIKitResponse` | Acknowledge success, take no further action |
| `errorResponse()` | `IUIKitResponse` | Acknowledge failure |
| `openModalViewResponse(viewData)` | `IUIKitModalResponse` | Open a modal with the given view data |
| `updateModalViewResponse(viewData)` | `IUIKitModalResponse` | Update the current modal with new blocks |
| `openContextualBarViewResponse(viewData)` | `IUIKitContextualBarResponse` | Open the contextual bar |
| `updateContextualBarViewResponse(viewData)` | `IUIKitContextualBarResponse` | Update the contextual bar |
| `viewErrorResponse(errorInteraction)` | `IUIKitErrorResponse` | Show field-level validation errors |

The responder auto-fills `appId`, `triggerId`, and `id` (UUID v1 if not provided) from the base context.

---

## How Incoming Interactions Work

### Incoming Interaction Types

The raw data Rocket.Chat sends to the App varies by interaction trigger:

**Block interactions** (`IUIKitBlockIncomingInteraction`):
```typescript
{
    appId: string;
    user: IUser;
    actionId: string;        // Which element was clicked
    triggerId: string;
    blockId: string;         // Which block contains the element
    value?: string;          // Selected/entered value
    message?: IMessage;      // Message the block was attached to
    room?: IRoom;
    threadId?: string;
    container: IUIKitIncomingInteractionModalContainer
             | IUIKitIncomingInteractionContextualBarContainer
             | IUIKitIncomingInteractionMessageContainer;
}
```

**View submit interactions** (`IUIKitViewSubmitIncomingInteraction`):
```typescript
{
    appId: string;
    user: IUser;
    view: IUIKitSurface;     // The submitted view with all field values in .state
    triggerId: string;
}
```

**View close interactions** (`IUIKitViewCloseIncomingInteraction`):
```typescript
{
    appId: string;
    user: IUser;
    view: IUIKitSurface;
    isCleared: boolean;      // Whether the view was cleared on close
}
```

**Action button interactions** (`IUIKitActionButtonIncomingInteraction`):
```typescript
{
    appId: string;
    user: IUser;
    buttonContext: UIActionButtonContext;
    actionId: string;
    triggerId: string;
    room: IRoom;
    message?: IMessage;
    threadId?: string;
}
```

The **container** field on block interactions tells you where the block was rendered: inside a modal (`IUIKitIncomingInteractionModalContainer`), contextual bar (`IUIKitIncomingInteractionContextualBarContainer`), or message (`IUIKitIncomingInteractionMessageContainer`).

---

## Typical Workflow

### Complete Flow: Block Button to Modal

**Step 1 — The App registers an interaction handler in `extendConfiguration()`**:

```typescript
import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { UIKitInteractionType } from '@rocket.chat/apps-engine/definition/uikit';
import { MyInteractionHandler } from './MyInteractionHandler';

export class MyApp extends App {
    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await configuration.ui.registerInteractionHandler(
            UIKitInteractionType.MODAL_OPEN,
            new MyInteractionHandler()
        );
    }
}
```

The handler implements `IUIKitInteractionHandler`. It will be called whenever a `modal.open` interaction is triggered.

**Step 2 — The App creates a message with an interactive block** (via a slash command or event handler):

```typescript
import { BlockBuilder, BlockType, TextObjectType, BlockElementType, ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';

function buildBlocks(): BlockBuilder {
    const blocks = new BlockBuilder();

    blocks.addSectionBlock({
        text: blocks.newMarkdownTextObject('Click the button to open a form:'),
    });

    blocks.addActionsBlock({
        elements: [
            blocks.newButtonElement({
                actionId: 'open-form',
                text: blocks.newPlainTextObject('Open Form'),
                style: ButtonStyle.PRIMARY,
            }),
        ],
    });

    return blocks;
}
```

**Step 3 — User clicks the "Open Form" button**. Rocket.Chat dispatches the incoming interaction to the handler:

```typescript
import {
    IUIKitInteractionHandler,
    IUIKitResponse,
    UIKitBlockInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';

export class MyInteractionHandler implements IUIKitInteractionHandler {
    public async executeBlockActionHandler(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const { actionId, user, room } = data;

        if (actionId === 'open-form') {
            const blocks = new BlockBuilder();

            blocks.addInputBlock({
                blockId: 'name-input',
                label: blocks.newPlainTextObject('Your Name'),
                element: blocks.newPlainTextInputElement({
                    actionId: 'name',
                    placeholder: blocks.newPlainTextObject('Enter your name'),
                }),
            });

            blocks.addInputBlock({
                blockId: 'email-input',
                label: blocks.newPlainTextObject('Email'),
                element: blocks.newPlainTextInputElement({
                    actionId: 'email',
                    placeholder: blocks.newPlainTextObject('Enter your email'),
                }),
            });

            return context.getInteractionResponder().openModalViewResponse({
                id: 'my-modal',
                title: blocks.newPlainTextObject('Contact Form'),
                submit: blocks.newButtonElement({
                    actionId: 'submit-form',
                    text: blocks.newPlainTextObject('Submit'),
                }),
                blocks: blocks.getBlocks(),
            });
        }

        return context.getInteractionResponder().successResponse();
    }

    // Other handler methods...
}
```

**Step 4 — User fills in the form and clicks "Submit"**. The `executeViewSubmitHandler` is called:

```typescript
public async executeViewSubmitHandler(
    context: UIKitViewSubmitInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const data = context.getInteractionData();
    const { view } = data;
    const state = view.state as any;

    const name = state?.['name-input']?.name;
    const email = state?.['email-input']?.email;

    // Validate
    const errors: { [field: string]: string } = {};
    if (!name) {
        errors['name'] = 'Name is required';
    }
    if (!email) {
        errors['email'] = 'Email is required';
    }

    if (Object.keys(errors).length > 0) {
        return context.getInteractionResponder().viewErrorResponse({
            viewId: 'my-modal',
            errors,
        });
    }

    // Process the submission...

    return context.getInteractionResponder().successResponse();
}
```

**Step 5 — Flow completes**. The interaction lifecycle is:
1. App defines blocks in a message or surface
2. User interacts (clicks a button, submits a form, closes a modal)
3. Rocket.Chat dispatches the incoming interaction to the registered handler
4. Handler inspects `actionId` or `view` to determine next action
5. Handler returns a response via the responder: open/update a surface, show errors, or acknowledge success

---

## Best Practices

- **Register one handler per interaction type** in `extendConfiguration()`. Each handler receives all interactions of that type; use `actionId` to branch.
- **Use the responder, never construct responses manually**. The responder auto-fills `appId`, `triggerId`, `type`, and generates UUIDs for view IDs.
- **Return `viewErrorResponse()` for validation failures** — it displays inline errors on form fields.
- **Use `context.getInteractionData()` to inspect** which block/element was triggered, which user, and in what room.
- **Set `notifyOnClose: true`** on surfaces when you need to know if the user dismissed without submitting — this triggers `executeViewClosedHandler`.
- **Check `container.type`** on block interactions to know whether the block is inside a modal, contextual bar, or message.

---

## Common Mistakes

- **Forgetting to register the interaction handler** → Interactions silently do nothing.
- **Using `actionId` without matching it to a handler** → The handler fires but `actionId` is undefined if no element triggered it.
- **Returning nothing from a handler** → Must always return a response from the responder.
- **Manually constructing response objects** → If you skip the responder, `appId`, `triggerId`, and `id` may be missing and the response will be rejected.
- **Confusing `executeBlockActionHandler` with `executeViewSubmitHandler`** → Block actions fire on button clicks inside blocks. View submit fires when the user clicks the modal's submit button.

---

## Related Topics

- [UI Kit Surfaces](./uikit-surfaces.md) — Modals, Home, Contextual Bar surfaces
- [UI Kit Blocks](./uikit-blocks-overview.md) — Section, Image, Actions, Context, Input, Divider, Conditional blocks
- [Block Builder](./uikit-block-builder.md) — Fluent API for constructing blocks
- [UI Kit Elements](./uikit-elements.md) — Buttons, selects, text inputs, overflow menus
- [Text Objects](./uikit-text-objects.md) — Plain text and markdown text objects
- [Interaction Handler](./uikit-interaction-handler.md) — IUIKitInteractionHandler interface
- [UI Kit Errors](./uikit-errors.md) — Form validation errors
- [UI Kit Livechat](./uikit-livechat.md) — Livechat-specific UI Kit interactions
