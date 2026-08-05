# UI Kit Surfaces

## Purpose

Surfaces are the containers where blocks are rendered. UI Kit supports three surface types: **modals** (dialog overlays), **contextual bars** (side panels), and **home** (tab content). This document covers the surface interfaces, how to open and update them, and how to handle form submissions.

---

## Overview

A surface is defined by `IUIKitSurface`. Every surface has an ID, a type, a title, an array of blocks, and optional close/submit buttons and state. The `IUIKitView` type is a deprecated alias for `IUIKitSurface`, kept for backward compatibility.

Surfaces are opened in response to user interactions. The `UIKitInteractionResponder` provides factory methods that construct properly typed responses for opening, updating, and closing surfaces.

---

## When To Use

- Opening a modal dialog to collect user input
- Updating a currently open modal with new blocks (e.g., multi-step forms)
- Displaying contextual information in the contextual bar sidebar
- Tracking form state across interactions via the `state` property
- Knowing when a user closes a modal without submitting (`notifyOnClose`)
- Clearing temporary state when a modal is dismissed (`clearOnClose`)

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `UIKitSurfaceType` | Enum of surface types | `MODAL`, `HOME`, `CONTEXTUAL_BAR` |
| `IUIKitSurface` | A UI surface (modal, home, or contextual bar) | `appId`, `id`, `type`, `title`, `blocks`, `close`, `submit`, `state`, `clearOnClose`, `notifyOnClose` |
| `IUIKitView` | Deprecated alias for `IUIKitSurface` | Same as `IUIKitSurface` |
| `UIKitViewType` | Deprecated alias for `UIKitSurfaceType` | Same values |
| `IUIKitModalViewParam` | Param type for opening/updating modals | `Omit<IUIKitSurface, 'appId' \| 'id' \| 'type'> & Partial<Pick<IUIKitSurface, 'id'>>` |
| `IUIKitContextualBarViewParam` | Param type for opening/updating contextual bars | Same structure |
| `UIKitInteractionResponder` | Responder that surfaces are created through | `openModalViewResponse()`, `updateModalViewResponse()`, `openContextualBarViewResponse()`, `updateContextualBarViewResponse()` |
| `UIKitViewSubmitInteractionContext` | Context received when a form on a surface is submitted | `getInteractionData()` returns `IUIKitViewSubmitIncomingInteraction` with `.view` |
| `UIKitViewCloseInteractionContext` | Context received when a surface is closed | `getInteractionData()` returns `IUIKitViewCloseIncomingInteraction` with `.view` and `.isCleared` |

---

## UIKitSurfaceType Enum

```typescript
export enum UIKitSurfaceType {
    MODAL           = 'modal',
    HOME            = 'home',
    CONTEXTUAL_BAR  = 'contextualBar',
}
```

- **MODAL** — A dialog overlay that appears centered on screen. Has a title bar, body (blocks), and optional close/submit buttons.
- **HOME** — The home tab content. Used for persistent app dashboards.
- **CONTEXTUAL_BAR** — The right sidebar panel. Used for context-sensitive information.

---

## IUIKitSurface

```typescript
export interface IUIKitSurface {
    appId: string;
    id: string;
    type: UIKitSurfaceType;
    title: ITextObject | TextObject;
    blocks: Array<IBlock | LayoutBlock>;
    close?: IButtonElement | ButtonElement;
    submit?: IButtonElement | ButtonElement;
    state?: object;
    clearOnClose?: boolean;
    notifyOnClose?: boolean;
}
```

### Property Breakdown

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `appId` | Yes | `string` | The App's unique identifier. Auto-filled by the responder/formatter. |
| `id` | Yes | `string` | Unique surface identifier. Auto-generated (UUID v1) if not provided. |
| `type` | Yes | `UIKitSurfaceType` | `MODAL`, `HOME`, or `CONTEXTUAL_BAR`. Auto-set by the responder. |
| `title` | Yes | `ITextObject` | The surface title, displayed in the header bar. Accepts plain text or markdown. |
| `blocks` | Yes | `Array<IBlock \| LayoutBlock>` | The content blocks: sections, inputs, actions, images, dividers, context blocks. |
| `close` | No | `IButtonElement` | Custom close button configuration. If omitted, a default close button is shown. |
| `submit` | No | `IButtonElement` | Submit button configuration. If omitted on a modal, no submit button is rendered. **Required** if you want `executeViewSubmitHandler` to fire. |
| `state` | No | `object` | Arbitrary state object. Persisted across updates to the same surface. Useful for multi-step forms. |
| `clearOnClose` | No | `boolean` | If `true`, Rocket.Chat clears the surface state when the modal is closed. |
| `notifyOnClose` | No | `boolean` | If `true`, the `executeViewClosedHandler` is called when the user dismisses the modal. Defaults to `false`. |

---

## IUIKitView (Deprecated)

`IUIKitView` is a **type alias** for `IUIKitSurface`, kept for backward compatibility:

```typescript
export import UIKitViewType = UIKitSurfaceType;
export type IUIKitView = IUIKitSurface;
```

All code referencing `IUIKitView` will continue to work, but new code should use `IUIKitSurface`.

---

## IUIKitModalViewParam and IUIKitContextualBarViewParam

When calling responder methods to open or update a surface, you do not pass a full `IUIKitSurface`. Instead, you pass a parameter type that omits `appId`, `type`, and (optionally) `id` — those are auto-filled:

```typescript
export type IUIKitModalViewParam = Omit<IUIKitSurface, 'appId' | 'id' | 'type'> & Partial<Pick<IUIKitSurface, 'id'>>;
export type IUIKitContextualBarViewParam = Omit<IUIKitSurface, 'appId' | 'id' | 'type'> & Partial<Pick<IUIKitSurface, 'id'>>;
```

This means you provide:
- `title` (required)
- `blocks` (required)
- `close` (optional)
- `submit` (optional)
- `state` (optional)
- `clearOnClose` (optional)
- `notifyOnClose` (optional)
- `id` (optional — if omitted, a UUID v1 is generated)

The responder's formatter (`formatModalInteraction` / `formatContextualBarInteraction`) constructs the full `IUIKitSurface` by merging your view data with `appId`, `triggerId`, the correct `type`, and a generated `id`.

---

## Opening a Modal

Use `responder.openModalViewResponse(viewData)`:

```typescript
return context.getInteractionResponder().openModalViewResponse({
    id: 'contact-form',                       // optional — UUID generated if omitted
    title: blocks.newPlainTextObject('Contact Support'),
    submit: blocks.newButtonElement({
        actionId: 'submit-contact',
        text: blocks.newPlainTextObject('Send'),
    }),
    close: blocks.newButtonElement({
        actionId: 'close-contact',
        text: blocks.newPlainTextObject('Cancel'),
    }),
    blocks: blocks.getBlocks(),
});
```

Internally, the responder calls `formatModalInteraction()` with `UIKitInteractionType.MODAL_OPEN`, producing:

```typescript
{
    success: true,
    type: 'modal.open',
    triggerId: '...',
    appId: '...',
    view: {
        appId: '...',
        id: 'contact-form',        // or generated UUID
        type: 'modal',
        title: { type: 'plain_text', text: 'Contact Support' },
        blocks: [...],
        submit: { ... },
        close: { ... },
        showIcon: true,
    }
}
```

---

## Updating a Modal

Use `responder.updateModalViewResponse(viewData)`. This replaces the current modal's content:

```typescript
// Respond to a select change by showing a different set of blocks
return context.getInteractionResponder().updateModalViewResponse({
    id: 'contact-form',    // MUST match the open modal's ID
    title: blocks.newPlainTextObject('Contact Support — Step 2'),
    blocks: [
        blocks.newSectionBlock({ text: blocks.newMarkdownTextObject('Additional details needed.') }),
    ],
    submit: blocks.newButtonElement({
        actionId: 'submit-step2',
        text: blocks.newPlainTextObject('Finish'),
    }),
});
```

---

## Opening a Contextual Bar

Use `responder.openContextualBarViewResponse(viewData)`. The contextual bar slides out from the right side:

```typescript
return context.getInteractionResponder().openContextualBarViewResponse({
    title: blocks.newPlainTextObject('User Details'),
    blocks: [
        blocks.newSectionBlock({ text: blocks.newMarkdownTextObject(`**Name:** ${user.name}`) }),
        blocks.newSectionBlock({ text: blocks.newMarkdownTextObject(`**Email:** ${user.emails[0].address}`) }),
    ],
});
```

Updating uses `responder.updateContextualBarViewResponse(viewData)` with the same parameter structure.

---

## Handling Form Submission

When a user clicks the submit button on a modal, the modal's `.state` is populated with all input field values, keyed by `blockId` and `actionId`:

```
state: {
    "name-input": { "name": "John Doe" },
    "email-input": { "email": "john@example.com" },
    "category-select": { "category": "support" }
}
```

The handler receives a `UIKitViewSubmitInteractionContext`:

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

    // Access field values from view.state
    const state = view.state as Record<string, Record<string, string>>;
    const name = state?.['name-input']?.name;
    const email = state?.['email-input']?.email;

    // Validate
    const errors: Record<string, string> = {};
    if (!name) errors['name'] = 'Required';
    if (!email) errors['email'] = 'Required';

    if (Object.keys(errors).length > 0) {
        return context.getInteractionResponder().viewErrorResponse({
            viewId: view.id,
            errors,
        });
    }

    // Process the data...
    const messageBuilder = modify.getCreator().startMessage()
        .setRoom(data.room!)
        .setSender(data.user)
        .setText(`New contact: ${name} (${email})`);

    await modify.getCreator().finish(messageBuilder);

    return context.getInteractionResponder().successResponse();
}
```

---

## Handling Modal Close

If `notifyOnClose` is `true`, the `executeViewClosedHandler` fires when the user dismisses:

```typescript
public async executeViewClosedHandler(
    context: UIKitViewCloseInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const data = context.getInteractionData();
    const { isCleared } = data;

    // If clearOnClose was true, isCleared is true
    if (isCleared) {
        // State was cleared — clean up any temporary data
    }

    return context.getInteractionResponder().successResponse();
}
```

---

## Complete Example: Multi-Step Modal

**Step 1 — Define the interaction handler that opens a modal**:

```typescript
export class StepHandler implements IUIKitInteractionHandler {
    public async executeBlockActionHandler(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();

        if (data.actionId !== 'start-wizard') {
            return context.getInteractionResponder().successResponse();
        }

        const blocks = new BlockBuilder();

        blocks.addInputBlock({
            blockId: 'step1-name',
            label: blocks.newPlainTextObject('Project Name'),
            element: blocks.newPlainTextInputElement({
                actionId: 'projectName',
                placeholder: blocks.newPlainTextObject('Enter project name'),
            }),
        });

        return context.getInteractionResponder().openModalViewResponse({
            id: 'project-wizard',
            title: blocks.newPlainTextObject('New Project — Step 1 of 2'),
            submit: blocks.newButtonElement({
                actionId: 'wizard-next',
                text: blocks.newPlainTextObject('Next'),
            }),
            blocks: blocks.getBlocks(),
            notifyOnClose: true,
            clearOnClose: true,
        });
    }

    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const { view } = context.getInteractionData();
        const state = view.state as any;
        const step1Name = state?.['step1-name']?.projectName;

        // If step 2 fields exist, this is the final submit
        if (state?.['step2-desc']) {
            const description = state['step2-desc'].projectDesc;
            // Persist the project...
            return context.getInteractionResponder().successResponse();
        }

        // Otherwise, move to step 2
        const blocks = new BlockBuilder();
        blocks.addSectionBlock({
            text: blocks.newMarkdownTextObject(`**Project:** ${step1Name}`),
        });
        blocks.addInputBlock({
            blockId: 'step2-desc',
            label: blocks.newPlainTextObject('Description'),
            element: blocks.newPlainTextInputElement({
                actionId: 'projectDesc',
                placeholder: blocks.newPlainTextObject('Describe the project'),
                multiline: true,
            }),
        });

        return context.getInteractionResponder().updateModalViewResponse({
            id: 'project-wizard',
            title: blocks.newPlainTextObject('New Project — Step 2 of 2'),
            submit: blocks.newButtonElement({
                actionId: 'wizard-finish',
                text: blocks.newPlainTextObject('Create'),
            }),
            blocks: blocks.getBlocks(),
        });
    }

    public async executeViewClosedHandler(
        context: UIKitViewCloseInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        // User cancelled the wizard — clean up
        return context.getInteractionResponder().successResponse();
    }

    public async executeActionButtonHandler(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        return context.getInteractionResponder().successResponse();
    }
}
```

---

## Best Practices

- **Always provide `submit`** on modals if you expect form submission — without it, no submit button renders and `executeViewSubmitHandler` never fires.
- **Use `state` for multi-step forms** — state persists across `updateModalViewResponse()` calls for the same `id`.
- **Match `id`** when updating — the `id` you pass to `updateModalViewResponse()` must match the currently open modal's `id`.
- **Set `notifyOnClose: true`** when you need to react to modal dismissal (clean up temp data, log user behavior).
- **Set `clearOnClose: true`** to reset state when the modal closes — prevents stale data on reopen.
- **Use the responder** — it handles `appId`, `triggerId`, type, and UUID generation automatically.
- **Validate in `executeViewSubmitHandler`** and return `viewErrorResponse()` for field-level errors.

---

## Common Mistakes

- **Omitting `submit` on a modal with input blocks** → User cannot submit; form is effectively view-only.
- **Forgetting the `id` on update** → If omitted, a new UUID is generated, which won't match the current modal — the update is silently ignored.
- **Returning `successResponse()` after validation failure** → Modal closes without telling the user what went wrong. Use `viewErrorResponse()` instead.
- **Closing the modal in `executeViewSubmitHandler` without explicit action** → Success/error response from the responder does not auto-close. Use `MODAL_CLOSE` type via the IUIController for programmatic close.
- **Treating `state` values as always present** → `state` is `undefined` until the first input interaction is recorded. Always use optional chaining.

---

## Related Topics

- [UI Kit Overview](./uikit-overview.md) — Interaction types, contexts, and the interaction flow
- [UI Kit Blocks](./uikit-blocks-overview.md) — Section, Input, Actions, Context, Divider, Image, Conditional blocks
- [Block Builder](./uikit-block-builder.md) — Fluent API for constructing blocks
- [UI Kit Elements](./uikit-elements.md) — Buttons, text inputs, selects
- [Text Objects](./uikit-text-objects.md) — Plain text and markdown objects
- [Interaction Handler](./uikit-interaction-handler.md) — IUIKitInteractionHandler interface
- [UI Kit Errors](./uikit-errors.md) — Validation error display
