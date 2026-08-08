# UI Kit Modals

## Purpose
Modals are **dialog surfaces** that overlay the Rocket.Chat UI, enabling Apps to collect structured input from users. They combine layout blocks with optional submit/close buttons and support field-level validation errors.

## Overview
A modal is defined by an `IUIKitSurface` with `type: UIKitSurfaceType.MODAL`:
- **`title`** — header text
- **`blocks`** — the body content (same block structure as messages)
- **`submit`** — optional button; clicking it triggers `UIKIT_VIEW_SUBMIT`
- **`close`** — optional button; clicking or pressing Escape triggers `UIKIT_VIEW_CLOSE`
- **`state`** — carries form field values (populated by the framework on submit)
- **`clearOnClose`** — if `true`, `isCleared` is `true` in the close context

## When to Use

- Collecting structured form data (surveys, task creation, settings)
- Displaying detailed information that doesn't belong in a message
- Confirmation dialogs with custom fields
- Multi-step workflows that require user input between steps

## The TriggerId Requirement

**Modals can only be opened in response to a user interaction.** Every interaction context provides a `triggerId`. The `UIKitInteractionResponder.openModalViewResponse()` method reads this `triggerId` from the base context automatically.

Valid triggers:
- User clicks a block action button (block builder button)
- User clicks a registered action button (message action, room action, etc.)
- User runs a slash command (the slash command context provides `triggerId`)

**Invalid triggers:**
- App startup / `onEnable()`
- Scheduled jobs / cron
- External webhooks (no user interaction)
- Direct API calls with no UI context

## Important Interfaces

### `IUIKitSurface`

```typescript
interface IUIKitSurface {
    appId: string;
    id: string;                  // Unique view ID (auto-generated if not provided)
    type: UIKitSurfaceType;      // UIKitSurfaceType.MODAL or .HOME or .CONTEXTUAL_BAR
    title: ITextObject;          // Modal title bar text
    blocks: Array<IBlock>;       // Body content blocks
    close?: IButtonElement;      // Close/cancel button
    submit?: IButtonElement;     // Submit/confirm button
    state?: object;              // Form state (populated on submit)
    clearOnClose?: boolean;      // If true, clears state when closing
    notifyOnClose?: boolean;     // If true, fires UIKIT_VIEW_CLOSE even without state changes
}
```

### `UIKitSurfaceType` Enum

```typescript
enum UIKitSurfaceType {
    MODAL = 'modal',
    HOME = 'home',
    CONTEXTUAL_BAR = 'contextualBar',
}
```

### `UIKitInteractionType` Enum

```typescript
enum UIKitInteractionType {
    MODAL_OPEN = 'modal.open',
    MODAL_CLOSE = 'modal.close',
    MODAL_UPDATE = 'modal.update',
    CONTEXTUAL_BAR_OPEN = 'contextual_bar.open',
    CONTEXTUAL_BAR_CLOSE = 'contextual_bar.close',
    CONTEXTUAL_BAR_UPDATE = 'contextual_bar.update',
    ERRORS = 'errors',
}
```

### `IUIKitErrorInteraction`

```typescript
interface IUIKitErrorInteraction extends IUIKitInteraction {
    type: UIKitInteractionType.ERRORS;
    viewId: string;                          // ID of the modal to show errors on
    errors: { [field: string]: string };     // actionId -> error message map
}
```

### `IUIKitErrorResponse`

```typescript
interface IUIKitErrorResponse extends IUIKitErrorInteraction, IUIKitResponse {}
```

### `IUIKitModalViewParam` (used when opening/updating)

```typescript
type IUIKitModalViewParam = Omit<IUIKitSurface, 'appId' | 'id' | 'type'> & Partial<Pick<IUIKitSurface, 'id'>>;
```

When creating a modal response, omit `appId`, `id`, and `type` — the framework fills them. Optionally provide `id` if you need to reference the modal later.

## Methods

### Opening a Modal (from Interaction Responder)

```typescript
// Inside any interaction handler:
const responder = context.getInteractionResponder();

return responder.openModalViewResponse({
    title: blocks.newPlainTextObject('My Modal'),
    blocks: blocks.getBlocks(),
    submit: blocks.newButtonElement({
        text: blocks.newPlainTextObject('Submit'),
    }),
    close: blocks.newButtonElement({
        text: blocks.newPlainTextObject('Cancel'),
    }),
    clearOnClose: true,
    notifyOnClose: true,
});
```

### Updating a Modal

```typescript
return responder.updateModalViewResponse({
    id: existingViewId,  // Required: the ID of the modal to update
    title: blocks.newPlainTextObject('Updated Title'),
    blocks: updatedBlocks,
});
```

### Closing a Modal

There is no direct "close modal" response. To close a modal:
1. User clicks the `close` button (triggers `UIKIT_VIEW_CLOSE`)
2. Return `successResponse()` from the submit handler (the client closes the modal on success)
3. Use `IUIController.openModalView()` with a `type: MODAL_CLOSE` — however, this is less common

### Returning Field-Level Errors

```typescript
return responder.viewErrorResponse({
    viewId: view.id,
    errors: {
        'email-field': 'Please enter a valid email address',
        'name-field': 'Name cannot be empty',
        'department-select': 'You must select a department',
    },
});
```

The `errors` keys must match the `actionId` of the input elements in the modal. The Rocket.Chat client highlights the corresponding fields with error messages.

## Handling Form Submission and Validation

The `UIKIT_VIEW_SUBMIT` handler receives `view.state` containing all form field values, keyed by `actionId`:

```typescript
async [AppMethod.UIKIT_VIEW_SUBMIT](context, read, http, persistence, modify) {
    const { view } = context.getInteractionData();
    const state = view.state as Record<string, any>;
    const responder = context.getInteractionResponder();

    // state contains: { 'email-field': 'user@example.com', 'name-field': 'Jane Doe', ... }

    const errors: Record<string, string> = {};

    // Validate each field
    if (!state['name-field'] || state['name-field'].trim() === '') {
        errors['name-field'] = 'Name is required';
    }
    if (!state['email-field'] || !state['email-field'].includes('@')) {
        errors['email-field'] = 'Invalid email address';
    }
    if (!state['department-select']) {
        errors['department-select'] = 'Please select a department';
    }

    if (Object.keys(errors).length > 0) {
        return responder.viewErrorResponse({
            viewId: view.id,
            errors,
        });
    }

    // All valid — persist data
    await persistence.create({
        id: `survey:${new Date().getTime()}`,
        name: state['name-field'],
        email: state['email-field'],
        department: state['department-select'],
    });

    return responder.successResponse();
}
```

## Typical Workflow

1. User triggers an action (clicks a button, runs a slash command)
2. Handler receives the interaction context (with `triggerId`)
3. Handler builds blocks and returns `openModalViewResponse()`
4. Client renders the modal
5. User fills in fields and clicks Submit
6. `UIKIT_VIEW_SUBMIT` handler validates `view.state`
7. On validation errors: return `viewErrorResponse()` (modal stays open, errors shown)
8. On success: return `successResponse()` (modal closes)
9. If user clicks Cancel/X: `UIKIT_VIEW_CLOSE` fires

## Complete Example: Survey Modal

This example shows a complete flow: slash command triggers the modal, form collects feedback with validation, and handles submission.

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
import { IAppInfo, AppMethod } from '@rocket.chat/apps-engine/definition/metadata';
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import {
    BlockBuilder,
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
    UIKitViewCloseInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';

export class SurveyModalApp extends App implements IUIKitInteractionHandler {
    constructor(info: IAppInfo, logger: any, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend) {
        // Register a slash command to open the survey modal
        configuration.slashCommands.provideSlashCommand(
            new SurveySlashCommand(this),
        );
    }

    // Handle form submission
    public async [AppMethod.UIKIT_VIEW_SUBMIT](
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ) {
        const { view, user } = context.getInteractionData();
        const state = view.state as Record<string, any>;
        const responder = context.getInteractionResponder();

        // --- Validation ---
        const errors: Record<string, string> = {};

        if (!state['feedback-input'] || state['feedback-input'].trim().length < 10) {
            errors['feedback-input'] = 'Feedback must be at least 10 characters';
        }

        if (!state['satisfaction-select']) {
            errors['satisfaction-select'] = 'Please select your satisfaction level';
        }

        if (!state['recommend-select']) {
            errors['recommend-select'] = 'Please tell us if you would recommend us';
        }

        if (Object.keys(errors).length > 0) {
            return responder.viewErrorResponse({
                viewId: view.id,
                errors,
            });
        }

        // --- Save ---
        await persistence.create({
            id: `survey-response:${user.id}:${Date.now()}`,
            userId: user.id,
            feedback: state['feedback-input'],
            satisfaction: state['satisfaction-select'],
            recommend: state['recommend-select'],
            submittedAt: new Date().toISOString(),
        });

        // --- Success: modal closes ---
        return responder.successResponse();
    }

    // Handle modal dismissal
    public async [AppMethod.UIKIT_VIEW_CLOSE](
        context: UIKitViewCloseInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ) {
        const { user, view } = context.getInteractionData();
        // Log that user cancelled
        this.getLogger().log(`User ${user.username} cancelled survey ${view.id}`);
        return context.getInteractionResponder().successResponse();
    }
}

// Slash command: /survey opens the modal
class SurveySlashCommand implements ISlashCommand {
    public command = 'survey';
    public i18nDescription = 'Open a feedback survey';
    public providesPreview = false;

    constructor(private readonly app: SurveyModalApp) {}

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const builder = new BlockBuilder(this.app.getID());
        const { sender, room, triggerId } = context;

        // Intro text
        builder.addSectionBlock({
            text: builder.newMarkdownTextObject(
                '*We value your feedback!*\nPlease take a moment to fill out this short survey.',
            ),
        });

        builder.addDividerBlock();

        // Text input: open-ended feedback
        builder.addInputBlock({
            label: builder.newPlainTextObject('Your Feedback'),
            element: builder.newPlainTextInputElement({
                placeholder: builder.newPlainTextObject('Tell us what you think...'),
                multiline: true,
                actionId: 'feedback-input',
            }),
            optional: false,
        });

        // Static select: satisfaction level
        builder.addInputBlock({
            label: builder.newPlainTextObject('How satisfied are you?'),
            element: builder.newStaticSelectElement({
                placeholder: builder.newPlainTextObject('Choose satisfaction level'),
                actionId: 'satisfaction-select',
                options: [
                    { text: builder.newPlainTextObject('Very Satisfied'), value: 'very_satisfied' },
                    { text: builder.newPlainTextObject('Satisfied'), value: 'satisfied' },
                    { text: builder.newPlainTextObject('Neutral'), value: 'neutral' },
                    { text: builder.newPlainTextObject('Dissatisfied'), value: 'dissatisfied' },
                    { text: builder.newPlainTextObject('Very Dissatisfied'), value: 'very_dissatisfied' },
                ],
            }),
            optional: false,
        });

        // Static select: Net Promoter Score (Would you recommend?)
        builder.addInputBlock({
            label: builder.newPlainTextObject('Would you recommend us to others?'),
            element: builder.newStaticSelectElement({
                placeholder: builder.newPlainTextObject('Choose your likelihood'),
                actionId: 'recommend-select',
                options: [
                    { text: builder.newPlainTextObject('Definitely'), value: 'definitely' },
                    { text: builder.newPlainTextObject('Probably'), value: 'probably' },
                    { text: builder.newPlainTextObject('Maybe'), value: 'maybe' },
                    { text: builder.newPlainTextObject('Probably Not'), value: 'probably_not' },
                    { text: builder.newPlainTextObject('Definitely Not'), value: 'definitely_not' },
                ],
            }),
            optional: false,
        });

        // Open the modal using IUIController (slash command doesn't use interaction responder)
        const uiController = modify.getUiController();
        await uiController.openSurfaceView(
            {
                title: builder.newPlainTextObject('Feedback Survey'),
                blocks: builder.getBlocks(),
                submit: builder.newButtonElement({
                    text: builder.newPlainTextObject('Submit Feedback'),
                }),
                close: builder.newButtonElement({
                    text: builder.newPlainTextObject('Cancel'),
                }),
                clearOnClose: true,
                notifyOnClose: true,
            },
            { triggerId },
            sender,
        );
    }
}
```

## Using IUIController vs UIKitInteractionResponder

| Method | When to Use |
|---|---|
| `context.getInteractionResponder().openModalViewResponse()` | Inside an interaction handler (block action, action button) — returns a response the framework sends |
| `modify.getUiController().openSurfaceView()` | Outside interaction handlers (slash commands) — directly opens the modal via the UI controller |

Both require a `triggerId`. The interaction responder extracts it from the context automatically; the UI controller requires it explicitly.

**For slash commands**, the `triggerId` comes from `SlashCommandContext.triggerId`:

```typescript
const { triggerId } = context; // from SlashCommandContext
await modify.getUiController().openSurfaceView(viewData, { triggerId }, user);
```

## Best Practices

1. **Always validate on submit** — don't trust `view.state` values; validate server-side before persisting.
2. **Use descriptive actionId values** — `feedback-input` is clearer than `input1`. Use the same IDs in `viewErrorResponse`.
3. **Match `errors` keys to `actionId` values** — the client maps errors to fields by `actionId`. Mismatched keys silently fail.
4. **Set `clearOnClose: true`** for forms — prevents stale data if the user reopens the modal.
5. **Set `notifyOnClose: true`** if you need to track cancellations — otherwise `UIKIT_VIEW_CLOSE` may not fire.
6. **Keep modals concise** — 3-5 input fields max. If you need more, consider a multi-step flow or a contextual bar.
7. **Use `submit` and `close` buttons** — provide both for a clear UX. The client may add a default close button, but explicit is better.

## Common Mistakes

- **Trying to open a modal without a `triggerId`** — modals require a user interaction. Check that your trigger provides `triggerId`.
- **Not providing a `submit` button** — without it, `UIKIT_VIEW_SUBMIT` never fires. The user has no way to submit the form.
- **Not handling `UIKIT_VIEW_CLOSE`** — if `clearOnClose` is `true`, any unsaved state is lost. Handle this explicitly.
- **Returning `successResponse()` before client renders** — the success response closes the modal. If you need to show a follow-up, open a new modal instead.
- **Using `IUIKitSurface` fields in `IUIKitModalViewParam`** — drop `appId`, `id` (optional), and `type` when passing to `openModalViewResponse`. The framework stamps these.
- **Not casting `view.state`** — `state` is typed as `object | undefined`. Cast it: `view.state as Record<string, any>`.
- **Forgetting to handle the slash command case** — slash commands use `IUIController`, not `UIKitInteractionResponder`. The API differs.

## Related Topics
- [UI Kit Interaction Handler](./uikit-interaction-handler.md)
- [UI Kit Block Builder](./uikit-block-builder.md)
- [UI Kit Elements](./uikit-elements.md)
- [UI Kit Text Objects](./uikit-text-objects.md)
- [UI Kit Action Buttons](./uikit-action-buttons.md)
