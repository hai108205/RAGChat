# UI Kit Blocks

## Purpose

Blocks are the atomic building blocks of UI Kit interfaces. Seven block types are available — section, image, divider, actions, context, input, and conditional — each serving a distinct layout role. Blocks are composed into surfaces (modals, contextual bars) and messages to create rich interactive UIs.

---

## Overview

Blocks follow a composition model. Each block type has a specific purpose:

| Block Type | Purpose |
|------------|---------|
| `SECTION` | Rich text row with optional accessory element (button, image, overflow menu) |
| `DIVIDER` | Horizontal visual separator |
| `IMAGE` | Standalone image with alt text and optional title |
| `ACTIONS` | Row of interactive elements (buttons, selects) |
| `CONTEXT` | Compact row of text/images for metadata or captions |
| `INPUT` | Form input with label and input element |
| `CONDITIONAL` | Wraps child blocks with render conditions (engine filter) |

All block interfaces in the apps-engine package are **deprecated** in favor of the `@rocket.chat/ui-kit` package types, but remain fully functional. The deprecated interfaces mirror the `@rocket.chat/ui-kit` types exactly, so migration is a simple import change.

---

## When To Use

- Displaying text with an accompanying button → `ISectionBlock`
- Separating visual sections → `IDividerBlock`
- Showing an image in a surface → `IImageBlock`
- Adding interactive buttons or selects → `IActionsBlock`
- Showing metadata, timestamps, or author info → `IContextBlock`
- Collecting user text input, selections → `IInputBlock`
- Showing different blocks in Rocket.Chat vs. Livechat → `IConditionalBlock`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `BlockType` | Enum of all block types | `SECTION`, `DIVIDER`, `IMAGE`, `ACTIONS`, `CONTEXT`, `INPUT`, `CONDITIONAL` |
| `IBlock` | Base block interface | `type`, `appId?`, `blockId?` |
| `ISectionBlock` | Text block with optional accessory | `text: ITextObject`, `accessory?` |
| `IImageBlock` | Image block | `imageUrl`, `altText`, `title?` |
| `IDividerBlock` | Visual divider | (no additional properties) |
| `IActionsBlock` | Row of interactive elements | `elements: Array<IBlockElement>` |
| `IContextBlock` | Compact metadata row | `elements: Array<ITextObject \| IImageElement>` |
| `IInputBlock` | Form input | `label`, `element: IInputElement`, `optional?` |
| `IConditionalBlock` | Conditional rendering | `when?`, `render: Array<IBlock>` |
| `ConditionalBlockFiltersEngine` | Engine filter values | `ROCKETCHAT`, `LIVECHAT` |
| `IConditionalBlockFilters` | Filter criteria | `engine?` |

---

## BlockType Enum

```typescript
export enum BlockType {
    SECTION     = 'section',
    DIVIDER     = 'divider',
    IMAGE       = 'image',
    ACTIONS     = 'actions',
    CONTEXT     = 'context',
    INPUT       = 'input',
    CONDITIONAL = 'conditional',
}
```

---

## IBlock (Base)

All blocks extend the base `IBlock` interface:

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IBlock {
    type: BlockType;
    appId?: string;
    blockId?: string;
}
```

- `type` — discriminator for which block variant is in use
- `appId` — optional, auto-populated by BlockBuilder
- `blockId` — optional identifier, used to scope input values in `view.state`

---

## ISectionBlock

A rich text row with an optional accessory element on the right.

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface ISectionBlock extends IBlock {
    type: BlockType.SECTION;
    text: ITextObject;
    accessory?: AccessoryElements;  // IButtonElement | IImageElement | IOverflowMenuElement
}
```

The `text` field supports both `mrkdwn` and `plain_text` text objects. The `accessory` is a single interactive element positioned to the right of the text — typically a button, an image, or an overflow menu.

**Example**:

```typescript
// Text with a button accessory
blocks.addSectionBlock({
    text: blocks.newMarkdownTextObject('*Task:* Review the quarterly report'),
    accessory: blocks.newButtonElement({
        actionId: 'open-report',
        text: blocks.newPlainTextObject('Open'),
        style: ButtonStyle.PRIMARY,
    }),
});

// Text with an image accessory
blocks.addSectionBlock({
    text: blocks.newMarkdownTextObject('Status: *Online*'),
    accessory: blocks.newImageElement({
        imageUrl: 'https://example.com/status-green.png',
        altText: 'Online status indicator',
    }),
});

// Text with an overflow menu
blocks.addSectionBlock({
    text: blocks.newMarkdownTextObject('Document options'),
    accessory: blocks.newOverflowMenuElement({
        actionId: 'doc-options',
        options: [
            { text: blocks.newPlainTextObject('Edit'), value: 'edit' },
            { text: blocks.newPlainTextObject('Delete'), value: 'delete' },
        ],
    }),
});
```

---

## IDividerBlock

A horizontal line separator. No additional properties beyond `IBlock`.

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IDividerBlock extends IBlock {
    type: BlockType.DIVIDER;
}
```

**Example**:

```typescript
blocks.addDividerBlock();
// Equivalent to:
blocks.addBlock({ type: BlockType.DIVIDER } as IDividerBlock);
```

---

## IImageBlock

Displays a standalone image with alt text and optional title.

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IImageBlock extends IBlock {
    type: BlockType.IMAGE;
    imageUrl: string;
    altText: string;
    title?: ITextObject;
}
```

**Example**:

```typescript
blocks.addImageBlock({
    imageUrl: 'https://example.com/chart.png',
    altText: 'Quarterly sales chart',
    title: blocks.newPlainTextObject('Q3 Sales Overview'),
});
```

---

## IActionsBlock

A horizontal row of interactive elements. Use for button groups, select dropdowns, or mixed controls.

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IActionsBlock extends IBlock {
    type: BlockType.ACTIONS;
    elements: Array<IBlockElement>;
}
```

`IBlockElement` is the base for all interactive elements: `IButtonElement`, `IStaticSelectElement`, `IMultiStaticSelectElement`, etc.

**Example**:

```typescript
blocks.addActionsBlock({
    blockId: 'actions-row',
    elements: [
        blocks.newButtonElement({
            actionId: 'approve',
            text: blocks.newPlainTextObject('Approve'),
            style: ButtonStyle.PRIMARY,
        }),
        blocks.newButtonElement({
            actionId: 'reject',
            text: blocks.newPlainTextObject('Reject'),
            style: ButtonStyle.DANGER,
        }),
    ],
});
```

All elements in an actions block trigger `executeBlockActionHandler` when clicked/changed, with their `actionId` available via `context.getInteractionData().actionId`.

---

## IContextBlock

A compact row of text objects and/or image elements. Used for metadata, captions, author info, or secondary context.

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IContextBlock extends IBlock {
    type: BlockType.CONTEXT;
    elements: Array<ITextObject | IImageElement>;
}
```

**Example**:

```typescript
blocks.addContextBlock({
    elements: [
        blocks.newImageElement({
            imageUrl: 'https://example.com/avatar.png',
            altText: 'Author avatar',
        }),
        blocks.newMarkdownTextObject('*Jane Doe*'),
        blocks.newMarkdownTextObject(' | '),
        blocks.newMarkdownTextObject('Posted 2 hours ago'),
    ],
});
```

Unlike sections, context blocks cannot contain interactive elements — they are purely informational.

---

## IInputBlock

A labeled form input. The key block type for collecting user data in modals.

```typescript
/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IInputBlock extends IBlock {
    type: BlockType.INPUT;
    element: IInputElement;
    label: ITextObject;
    optional?: boolean;
}
```

`IInputElement` is the union of all input element types:
- `IPlainTextInputElement` — single or multiline text input
- `IStaticSelectElement` — static dropdown select
- `IMultiStaticSelectElement` — multi-select dropdown

The `optional` flag controls whether a "required" indicator is shown.

**State mapping**: When a form is submitted, input values are stored in `view.state` keyed as `state[blockId][actionId]`. The `blockId` comes from the block, and `actionId` comes from the `element`.

**Examples**:

```typescript
// Text input
blocks.addInputBlock({
    blockId: 'name-block',
    label: blocks.newPlainTextObject('Full Name'),
    element: blocks.newPlainTextInputElement({
        actionId: 'fullName',
        placeholder: blocks.newPlainTextObject('Enter your full name'),
    }),
    optional: false,
});

// Multiline text input
blocks.addInputBlock({
    blockId: 'desc-block',
    label: blocks.newPlainTextObject('Description'),
    element: blocks.newPlainTextInputElement({
        actionId: 'description',
        placeholder: blocks.newPlainTextObject('Describe the issue...'),
        multiline: true,
    }),
    optional: true,
});

// Static select dropdown
blocks.addInputBlock({
    blockId: 'priority-block',
    label: blocks.newPlainTextObject('Priority'),
    element: blocks.newStaticSelectElement({
        actionId: 'priority',
        placeholder: blocks.newPlainTextObject('Select priority'),
        options: [
            { text: blocks.newPlainTextObject('Low'), value: 'low' },
            { text: blocks.newPlainTextObject('Medium'), value: 'medium' },
            { text: blocks.newPlainTextObject('High'), value: 'high' },
            { text: blocks.newPlainTextObject('Critical'), value: 'critical' },
        ],
        initialValue: 'medium',
    }),
    optional: false,
});

// Multi-select
blocks.addInputBlock({
    blockId: 'tags-block',
    label: blocks.newPlainTextObject('Tags'),
    element: blocks.newMultiStaticSelectElement({
        actionId: 'tags',
        placeholder: blocks.newPlainTextObject('Select tags'),
        options: [
            { text: blocks.newPlainTextObject('Bug'), value: 'bug' },
            { text: blocks.newPlainTextObject('Feature'), value: 'feature' },
            { text: blocks.newPlainTextObject('Improvement'), value: 'improvement' },
        ],
    }),
});
```

---

## IConditionalBlock

Wraps a set of child blocks that render only when conditions are met.

```typescript
export enum ConditionalBlockFiltersEngine {
    ROCKETCHAT  = 'rocket.chat',
    LIVECHAT    = 'livechat',
}

export interface IConditionalBlockFilters {
    engine?: Array<ConditionalBlockFiltersEngine>;
}

/**
 * @deprecated please prefer the rocket.chat/ui-kit components
 */
export interface IConditionalBlock extends IBlock {
    type: BlockType.CONDITIONAL;
    when?: IConditionalBlockFilters;
    render: Array<IBlock>;
}
```

### How Conditions Work

The `when` filter is **optional**. When omitted, the block renders in all engines unconditionally. When specified:

- `engine: ['rocket.chat']` — renders only in the main Rocket.Chat client
- `engine: ['livechat']` — renders only in the Livechat/Omnichannel widget
- `engine: ['rocket.chat', 'livechat']` — renders in both (same as omitting)
- `engine: []` or omitted — renders in both

The `render` array contains the child blocks that are displayed when the condition passes.

**Example**:

```typescript
// Show different content in Rocket.Chat vs Livechat
blocks.addConditionalBlock({
    when: { engine: [ConditionalBlockFiltersEngine.ROCKETCHAT] },
    render: [
        blocks.newSectionBlock({
            text: blocks.newMarkdownTextObject('This text is only visible in Rocket.Chat.'),
        }),
    ],
});

blocks.addConditionalBlock({
    when: { engine: [ConditionalBlockFiltersEngine.LIVECHAT] },
    render: [
        blocks.newSectionBlock({
            text: blocks.newMarkdownTextObject('This text is only visible in the Livechat widget.'),
        }),
    ],
});
```

---

## Arranging Blocks Together

Blocks are rendered top-to-bottom in the order they appear in the array. A typical modal arrangement:

```typescript
const blocks = new BlockBuilder();

// 1. Header section with context
blocks.addSectionBlock({
    text: blocks.newMarkdownTextObject('*Please fill out the form below.*'),
});

// 2. Visual separator
blocks.addDividerBlock();

// 3. Input fields
blocks.addInputBlock({
    blockId: 'subject',
    label: blocks.newPlainTextObject('Subject'),
    element: blocks.newPlainTextInputElement({
        actionId: 'subjectText',
        placeholder: blocks.newPlainTextObject('Brief summary'),
    }),
});

blocks.addInputBlock({
    blockId: 'category',
    label: blocks.newPlainTextObject('Category'),
    element: blocks.newStaticSelectElement({
        actionId: 'categorySelect',
        placeholder: blocks.newPlainTextObject('Choose a category'),
        options: [
            { text: blocks.newPlainTextObject('General'), value: 'general' },
            { text: blocks.newPlainTextObject('Billing'), value: 'billing' },
            { text: blocks.newPlainTextObject('Technical'), value: 'technical' },
        ],
    }),
});

blocks.addInputBlock({
    blockId: 'details',
    label: blocks.newPlainTextObject('Details'),
    element: blocks.newPlainTextInputElement({
        actionId: 'detailsText',
        placeholder: blocks.newPlainTextObject('Describe the issue in detail...'),
        multiline: true,
    }),
});

// 4. Another divider
blocks.addDividerBlock();

// 5. Context with metadata
blocks.addContextBlock({
    elements: [
        blocks.newMarkdownTextObject(':information_source: Your ticket will be assigned to the support team.'),
    ],
});

// 6. Image
blocks.addImageBlock({
    imageUrl: 'https://example.com/support-banner.png',
    altText: 'Support banner',
});

// Return the blocks in a surface
return context.getInteractionResponder().openModalViewResponse({
    id: 'support-ticket',
    title: blocks.newPlainTextObject('Submit a Ticket'),
    submit: blocks.newButtonElement({
        actionId: 'create-ticket',
        text: blocks.newPlainTextObject('Submit'),
    }),
    blocks: blocks.getBlocks(),
});
```

Resulting layout:

```
+------------------------------------------+
|  Submit a Ticket                    [X]   |
+------------------------------------------+
| *Please fill out the form below.*         |
+------------------------------------------+
| Subject                                   |
| [________________________]                |
| Category                                  |
| [Choose a category        v]              |
| Details                                   |
| [________________________]                |
| [________________________]                |
+------------------------------------------+
| :information_source: Your ticket will be  |
| assigned to the support team.             |
+------------------------------------------+
| [Support Banner Image]                    |
+------------------------------------------+
|                              [Submit]     |
+------------------------------------------+
```

---

## Best Practices

- **Use `blockId` on input blocks** — it becomes the key in `view.state` for retrieving field values on submit.
- **Use `actionId` on every interactive element** — it identifies which element triggered `executeBlockActionHandler`.
- **Group related buttons in an `IActionsBlock`** — it renders them horizontally for compact layout.
- **Use `IContextBlock` for metadata** — it's more compact than `ISectionBlock` for secondary information like timestamps, author names, or help text.
- **Use `IDividerBlock` to create visual sections** — improves readability of complex forms.
- **Prefer `@rocket.chat/ui-kit` types** in new code — the deprecated app-engine types still work but the `@rocket.chat/ui-kit` package is the current standard.

---

## Common Mistakes

- **Forgetting `altText` on `IImageBlock`** — it's required for accessibility.
- **Mixing interactive and non-interactive elements in `IActionsBlock`** — all elements must extend `IBlockElement`.
- **Using `ISectionBlock` for input fields** — always use `IInputBlock` for forms; `ISectionBlock` is for display-only content.
- **Not setting `actionId` on input elements** — without it, the value cannot be retrieved from `view.state`.
- **Confusing `blockId` with `actionId`** — `blockId` belongs to the block, `actionId` belongs to the element inside it. In `view.state`, the path is `state[blockId][actionId]`.
- **Omitting `blockId` on input blocks** — the value in `view.state` will be stored under an auto-generated key, making it difficult to access.
- **Using `IConditionalBlock` without `when`** — it always renders, but adds unnecessary nesting. Only use it when conditional behavior is needed.

---

## Related Topics

- [UI Kit Overview](./uikit-overview.md) — Interaction types, contexts, and the interaction flow
- [UI Kit Surfaces](./uikit-surfaces.md) — Modals, contextual bars, and home surfaces
- [Block Builder](./uikit-block-builder.md) — Fluent API for constructing blocks
- [UI Kit Elements](./uikit-elements.md) — Button, image, overflow menu, text input, select elements
- [Text Objects](./uikit-text-objects.md) — Plain text and markdown text objects
- [Interaction Handler](./uikit-interaction-handler.md) — IUIKitInteractionHandler interface
