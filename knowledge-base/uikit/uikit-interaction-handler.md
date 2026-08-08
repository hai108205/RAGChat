# UI Kit Interaction Handler

## Purpose
`IUIKitInteractionHandler` is the **interface your App implements** to respond to user interactions with UI Kit components — block actions (button clicks, select changes), view submissions, view closes, and action button clicks.

## Overview
Four optional handler methods, each mapped to a distinct `AppMethod` enum key:
- `UIKIT_BLOCK_ACTION` — interaction with a block element (button click, select change, text input)
- `UIKIT_VIEW_SUBMIT` — modal or contextual bar form submission
- `UIKIT_VIEW_CLOSE` — modal or contextual bar dismissed
- `UIKIT_ACTION_BUTTON` — room/message/user action button clicked

Each handler receives a typed context object and the standard accessor suite (`read`, `http`, `persistence`, `modify`).

## When to Use

| Handler | Trigger |
|---|---|
| `UIKIT_BLOCK_ACTION` | User clicks a button, selects an option, types in a text input (with `dispatchActionConfig`) |
| `UIKIT_VIEW_SUBMIT` | User clicks the "Submit" button on a modal or contextual bar |
| `UIKIT_VIEW_CLOSE` | User clicks "Cancel"/"X" or the modal is programmatically closed |
| `UIKIT_ACTION_BUTTON` | User clicks a registered UI action button (room, message, user dropdown, etc.) |

## Important Interfaces

### `IUIKitInteractionHandler`

```typescript
interface IUIKitInteractionHandler {
    [AppMethod.UIKIT_BLOCK_ACTION]?(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse>;

    [AppMethod.UIKIT_VIEW_SUBMIT]?(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse>;

    [AppMethod.UIKIT_VIEW_CLOSE]?(
        context: UIKitViewCloseInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse>;

    [AppMethod.UIKIT_ACTION_BUTTON]?(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse>;
}
```

### Context Classes

All context classes extend `UIKitInteractionContext` and provide:

| Method | Returns |
|---|---|
| `getInteractionData()` | The typed incoming interaction payload |
| `getInteractionResponder()` | `UIKitInteractionResponder` — factory for response objects |

### Context Data — What Each Type Provides

#### `UIKitBlockInteractionContext.getInteractionData(): IUIKitBlockIncomingInteraction`

```typescript
interface IUIKitBlockIncomingInteraction {
    appId: string;
    user: IUser;
    actionId: string;
    blockId: string;
    value?: string;          // The value of the clicked/changed element
    message?: IMessage;      // The message containing the block (if from a message)
    room: IRoom;
    triggerId: string;
    container: IUIKitIncomingInteractionModalContainer
        | IUIKitIncomingInteractionContextualBarContainer
        | IUIKitIncomingInteractionMessageContainer;
}
```

#### `UIKitViewSubmitInteractionContext.getInteractionData(): IUIKitViewSubmitIncomingInteraction`

```typescript
interface IUIKitViewSubmitIncomingInteraction {
    appId: string;
    user: IUser;
    view: IUIKitSurface;     // The full surface including state with form values
    triggerId: string;
}
```

#### `UIKitViewCloseInteractionContext.getInteractionData(): IUIKitViewCloseIncomingInteraction`

```typescript
interface IUIKitViewCloseIncomingInteraction {
    appId: string;
    user: IUser;
    view: IUIKitSurface;
    isCleared: boolean;      // true if clearOnClose was set
}
```

#### `UIKitActionButtonInteractionContext.getInteractionData(): IUIKitActionButtonIncomingInteraction`

```typescript
interface IUIKitActionButtonIncomingInteraction {
    appId: string;
    user: IUser;
    buttonContext: UIActionButtonContext;  // Where the button was clicked
    actionId: string;
    triggerId: string;
    room: IRoom;
    message?: IMessage;
    threadId?: string;
}
```

### `UIKitInteractionResponder` — Response Factory

Accessed via `context.getInteractionResponder()`. Provides:

| Method | Returns | Use |
|---|---|---|
| `successResponse()` | `IUIKitResponse` | Acknowledge successful processing |
| `errorResponse()` | `IUIKitResponse` | Generic error (no detail) |
| `openModalViewResponse(viewData)` | `IUIKitModalResponse` | Open a modal |
| `updateModalViewResponse(viewData)` | `IUIKitModalResponse` | Update existing modal |
| `openContextualBarViewResponse(viewData)` | `IUIKitContextualBarResponse` | Open a contextual bar |
| `updateContextualBarViewResponse(viewData)` | `IUIKitContextualBarResponse` | Update existing contextual bar |
| `viewErrorResponse(errorInteraction)` | `IUIKitErrorResponse` | Return field-level validation errors |

## Methods in Detail

### 1. `UIKIT_BLOCK_ACTION` — Block Element Interaction

**Triggered when:** User clicks a button, selects a dropdown option, or types in a text input with `dispatchActionConfig` set.

**How to identify the element:**
- `context.getInteractionData().actionId` — the `actionId` of the element that was interacted with
- `context.getInteractionData().value` — the element's `value` (for buttons, selects) or current text (for text inputs)

**Typical response:** `successResponse()` to dismiss any loading state. Optionally open a modal via `openModalViewResponse()`.

```typescript
async [AppMethod.UIKIT_BLOCK_ACTION](context, read, http, persistence, modify) {
    const { actionId, value, user, triggerId } = context.getInteractionData();
    const responder = context.getInteractionResponder();

    switch (actionId) {
        case 'approve-btn':
            // Process approval...
            return responder.successResponse();

        case 'open-details':
            // Open a modal in response to a button click
            const blocks = new BlockBuilder(this.getID());
            blocks.addSectionBlock({
                text: blocks.newPlainTextObject(`Details for item: ${value}`),
            });
            return responder.openModalViewResponse({
                title: blocks.newPlainTextObject('Item Details'),
                blocks: blocks.getBlocks(),
            });

        default:
            return responder.successResponse();
    }
}
```

### 2. `UIKIT_VIEW_SUBMIT` — Form Submission

**Triggered when:** User clicks the "Submit" button on a modal or contextual bar surface.

**What you get:**
- `context.getInteractionData().view` — the full surface, including `view.state` containing all form field values
- `context.getInteractionData().view.id` — unique view identifier (useful for routing logic)

**Typical response:** `successResponse()` on valid submission. `viewErrorResponse()` for validation failures.

```typescript
async [AppMethod.UIKIT_VIEW_SUBMIT](context, read, http, persistence, modify) {
    const { view, user } = context.getInteractionData();
    const responder = context.getInteractionResponder();
    const state = view.state as Record<string, any>;

    // Validate
    if (!state.title || state.title.trim() === '') {
        return responder.viewErrorResponse({
            viewId: view.id,
            errors: {
                'title-field': 'Title is required',
            },
        });
    }

    if (!state.assignee) {
        return responder.viewErrorResponse({
            viewId: view.id,
            errors: {
                'assignee-select': 'Please select an assignee',
            },
        });
    }

    // Save data
    // ...

    return responder.successResponse();
}
```

### 3. `UIKIT_VIEW_CLOSE` — View Dismissed

**Triggered when:** User closes a modal or contextual bar (clicking Cancel, X, or programmatic close).

**What you get:**
- `view` data (id, state, blocks, title)
- `isCleared` flag — `true` if `clearOnClose` was set on the surface

**Typical response:** `successResponse()`. May clean up state or log the cancellation.

```typescript
async [AppMethod.UIKIT_VIEW_CLOSE](context, read, http, persistence, modify) {
    const { view, user, isCleared } = context.getInteractionData();

    if (isCleared) {
        // Clean up any temporary state
        console.log(`User ${user.username} cancelled view ${view.id}`);
    }

    return context.getInteractionResponder().successResponse();
}
```

### 4. `UIKIT_ACTION_BUTTON` — UI Action Button Click

**Triggered when:** User clicks a registered action button (message action, room action, user dropdown, etc.).

**What you get:**
- `buttonContext` — where the button was clicked (`MESSAGE_ACTION`, `ROOM_ACTION`, etc.)
- `actionId` — which button was clicked
- `room`, `user`, `message?` — contextual data

**Typical response:** `successResponse()` or open a modal/surface.

```typescript
async [AppMethod.UIKIT_ACTION_BUTTON](context, read, http, persistence, modify) {
    const { actionId, buttonContext, room, user, triggerId } = context.getInteractionData();

    if (actionId === 'create-task') {
        const blocks = new BlockBuilder(this.getID());
        // ... build a task creation form
        return context.getInteractionResponder().openModalViewResponse({
            title: blocks.newPlainTextObject('Create Task'),
            blocks: blocks.getBlocks(),
            submit: blocks.newButtonElement({
                text: blocks.newPlainTextObject('Create'),
            }),
        });
    }

    return context.getInteractionResponder().successResponse();
}
```

## Complete Example: App with All 4 Handlers

```typescript
import {
    IAppAccessors,
    IConfigurationExtend,
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { UIKitBlockInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import {
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
    UIKitViewCloseInteractionContext,
    UIKitActionButtonInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { AppMethod } from '@rocket.chat/apps-engine/definition/metadata';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';

export class SurveyApp extends App implements IUIKitInteractionHandler {
    constructor(info: IAppInfo, logger: any, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend) {
        // Register action buttons, etc.
    }

    // Block action: button clicks, select changes, text input
    public async [AppMethod.UIKIT_BLOCK_ACTION](
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ) {
        const { actionId, value, user } = context.getInteractionData();
        const responder = context.getInteractionResponder();

        if (actionId === 'nps-score') {
            // Record NPS score from a button click
            await persistence.update(`nps:${user.id}`, { score: value });
            return responder.successResponse();
        }

        return responder.successResponse();
    }

    // View submit: form submitted
    public async [AppMethod.UIKIT_VIEW_SUBMIT](
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ) {
        const { view, user } = context.getInteractionData();
        const state = view.state as any;
        const responder = context.getInteractionResponder();

        const errors: Record<string, string> = {};
        if (!state.feedback || state.feedback.trim() === '') {
            errors['feedback-input'] = 'Feedback cannot be empty';
        }
        if (!state.rating) {
            errors['rating-select'] = 'Please select a rating';
        }
        if (Object.keys(errors).length > 0) {
            return responder.viewErrorResponse({ viewId: view.id, errors });
        }

        // Save survey response
        await persistence.update(`survey:${user.id}`, {
            feedback: state.feedback,
            rating: state.rating,
            submittedAt: new Date(),
        });

        return responder.successResponse();
    }

    // View close: modal dismissed
    public async [AppMethod.UIKIT_VIEW_CLOSE](
        context: UIKitViewCloseInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ) {
        const { user, view } = context.getInteractionData();
        // Optionally log cancellation
        return context.getInteractionResponder().successResponse();
    }

    // Action button: UI action button clicked
    public async [AppMethod.UIKIT_ACTION_BUTTON](
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ) {
        const { actionId, room, user, triggerId } = context.getInteractionData();

        if (actionId === 'open-survey') {
            const builder = new BlockBuilder(this.getID());
            builder.addInputBlock({
                label: builder.newPlainTextObject('Your Feedback'),
                element: builder.newPlainTextInputElement({
                    placeholder: builder.newPlainTextObject('Tell us what you think...'),
                    multiline: true,
                    actionId: 'feedback-input',
                }),
            });
            builder.addInputBlock({
                label: builder.newPlainTextObject('Rating'),
                element: builder.newStaticSelectElement({
                    placeholder: builder.newPlainTextObject('Select rating'),
                    actionId: 'rating-select',
                    options: [
                        { text: builder.newPlainTextObject('1 - Poor'), value: '1' },
                        { text: builder.newPlainTextObject('2 - Fair'), value: '2' },
                        { text: builder.newPlainTextObject('3 - Good'), value: '3' },
                        { text: builder.newPlainTextObject('4 - Very Good'), value: '4' },
                        { text: builder.newPlainTextObject('5 - Excellent'), value: '5' },
                    ],
                }),
            });

            return context.getInteractionResponder().openModalViewResponse({
                title: builder.newPlainTextObject('Feedback Survey'),
                blocks: builder.getBlocks(),
                submit: builder.newButtonElement({
                    text: builder.newPlainTextObject('Submit'),
                }),
                close: builder.newButtonElement({
                    text: builder.newPlainTextObject('Cancel'),
                }),
            });
        }

        return context.getInteractionResponder().successResponse();
    }
}
```

## How to Respond: Response Type Guide

| Scenario | Response Method |
|---|---|
| Action handled, nothing more needed | `successResponse()` |
| Action failed (no details) | `errorResponse()` |
| Open a modal | `openModalViewResponse(viewData)` |
| Update current modal | `updateModalViewResponse(viewData)` |
| Open contextual bar | `openContextualBarViewResponse(viewData)` |
| Validation errors on form fields | `viewErrorResponse({ viewId, errors })` |

Note: `openModalViewResponse()` and related UI responses **require a valid `triggerId`** — they only work when called from within an interaction handler, which provides the `triggerId` automatically via the context.

## Best Practices

1. **Always return a response** — the client waits for `successResponse()` to dismiss loading states. An unreturned promise leaves the UI in a loading state.
2. **Use `viewErrorResponse` for per-field validation** — the `errors` map uses `actionId` as keys, so the client can show inline errors next to the correct field.
3. **Match on `actionId` in block actions** — use a switch/case or if-else chain on `context.getInteractionData().actionId` to route to the right logic.
4. **Extract `view.state` safely** — state values may be `undefined` if the field wasn't interacted with. Use optional chaining or defaults.
5. **Handle `UIKIT_VIEW_CLOSE` to release resources** — if your view had temporary state, clean it up on close.

## Common Mistakes

- **Not importing the handler interface into the App class** — App must `implements IUIKitInteractionHandler` for the methods to be recognized by the framework.
- **Returning a modal response from `UIKIT_VIEW_CLOSE`** — The user just dismissed a modal; opening another immediately creates a poor UX. Use `successResponse()` instead.
- **Not providing `submit` button on modals** — A modal without a `submit` button has no way to trigger `UIKIT_VIEW_SUBMIT`.
- **Mismatching `errors` keys in `viewErrorResponse`** — The keys must match the `actionId` of the input elements. Mismatched keys silently fail.
- **Calling `openModalViewResponse` outside an interaction handler** — Requires a `triggerId`, which only exists within handler context.

## Related Topics
- [UI Kit Action Buttons](./uikit-action-buttons.md)
- [UI Kit Modals](./uikit-modals.md)
- [UI Kit Block Builder](./uikit-block-builder.md)
- [UI Kit Elements](./uikit-elements.md)
