# UI Kit Elements

## Purpose
Block elements are the **interactive and display components** placed inside UI Kit blocks. Buttons trigger actions, images display media, selects capture user choices, and inputs collect free-form text.

## Overview
Six element types, each with its own interface:
- **`IButtonElement`** — clickable button (primary/danger style, URL or action)
- **`IImageElement`** — static image display
- **`IOverflowMenuElement`** — popover menu with selectable options
- **`IPlainTextInputElement`** — single-line or multiline text field
- **`IStaticSelectElement`** — single-select dropdown
- **`IMultiStaticSelectElement`** — multi-select dropdown

## When to Use

| Element | Use When |
|---|---|
| `BUTTON` | Triggering actions, opening URLs, confirming operations |
| `IMAGE` | Displaying an image as a block accessory or context element |
| `OVERFLOW_MENU` | Compact multiple-option selector (e.g., "More actions") |
| `PLAIN_TEXT_INPUT` | Collecting user text (titles, descriptions, remarks) |
| `STATIC_SELECT` | Single-choice from a predefined option list |
| `MULTI_STATIC_SELECT` | Multiple-choice from a predefined option list |

## Important Interfaces

### `BlockElementType` Enum

```typescript
enum BlockElementType {
    BUTTON = 'button',
    IMAGE = 'image',
    OVERFLOW_MENU = 'overflow',
    PLAIN_TEXT_INPUT = 'plain_text_input',
    STATIC_SELECT = 'static_select',
    MULTI_STATIC_SELECT = 'multi_static_select',
}
```

### `IBlockElement` (Base)

```typescript
interface IBlockElement {
    type: BlockElementType;
}
```

### `IInteractiveElement extends IBlockElement`

```typescript
interface IInteractiveElement extends IBlockElement {
    actionId: string; // Used to identify this element in interaction handlers
}
```

### `IInputElement extends IBlockElement`

```typescript
interface IInputElement extends IBlockElement {
    actionId: string;
    placeholder: ITextObject;
    initialValue?: string | Array<string>;
    dispatchActionConfig?: Array<InputElementDispatchAction>;
}
```

### `ButtonStyle` Enum

```typescript
enum ButtonStyle {
    PRIMARY = 'primary',   // Green/blue emphasis
    DANGER = 'danger',     // Red emphasis
}
```

### `InputElementDispatchAction` Enum

```typescript
enum InputElementDispatchAction {
    ON_CHARACTER_ENTERED = 'on_character_entered', // Fire block action on each keystroke
    ON_ITEM_SELECTED = 'on_item_selected',         // Fire block action on select change
}
```

### `AccessoryElements` (Union Type)

```typescript
type AccessoryElements = IButtonElement | IImageElement | IOverflowMenuElement;
```

This union is used in `ISectionBlock`'s `accessory` field — a section block can have zero or one accessory.

## Element Details

### 1. IButtonElement

```typescript
interface IButtonElement extends IInteractiveElement {
    type: BlockElementType.BUTTON;
    text: ITextObject;        // Button label
    value?: string;           // Payload sent to interaction handler
    url?: string;             // If set, opens this URL instead of firing interaction
    style?: ButtonStyle;      // PRIMARY | DANGER (default: no style / secondary)
}
```

**Key behaviors:**
- If `url` is set, the button becomes a link — no interaction handler triggered
- If `value` is set, that string is delivered to the handler on click
- `style` colors the button visually; omit for a neutral appearance

**Example:**

```typescript
const approveBtn = builder.newButtonElement({
    text: builder.newPlainTextObject('Approve'),
    value: 'action:approve',
    style: ButtonStyle.PRIMARY,
});

const docsLink = builder.newButtonElement({
    text: builder.newPlainTextObject('View Docs'),
    url: 'https://docs.rocket.chat',
});
```

### 2. IImageElement

```typescript
interface IImageElement extends IBlockElement {
    type: BlockElementType.IMAGE;
    imageUrl: string;   // Fully qualified URL to the image
    altText: string;    // Accessibility text
}
```

**Not interactive** — no `actionId`, no interaction handler. Used as:
- A standalone `addImageBlock()` block
- An accessory in a section block
- An element in a context block

**Example:**

```typescript
const logo = builder.newImageElement({
    imageUrl: 'https://example.com/logo.png',
    altText: 'Company Logo',
});

builder.addImageBlock({
    imageUrl: logo.imageUrl,
    altText: logo.altText,
    title: builder.newPlainTextObject('Our Logo'),
});

// Or as a section accessory:
builder.addSectionBlock({
    text: builder.newMarkdownTextObject('*Company* information'),
    accessory: logo,
});
```

### 3. IOverflowMenuElement

```typescript
interface IOverflowMenuElement extends IInteractiveElement {
    type: BlockElementType.OVERFLOW_MENU;
    options: Array<IOptionObject>; // Each option has text, value, and optional url
}
```

**Key behaviors:**
- Displays a "..." button; click expands a popover with the `options` list
- Each `IOptionObject` can have a `url` (open link) or plain `value` (fire interaction)
- The selected option's `value` is delivered to the `UIKIT_BLOCK_ACTION` handler

**Example:**

```typescript
const overflow = builder.newOverflowMenuElement({
    options: [
        { text: builder.newPlainTextObject('Edit'), value: 'edit' },
        { text: builder.newPlainTextObject('Delete'), value: 'delete' },
        { text: builder.newPlainTextObject('Share'), value: 'share' },
    ],
});
```

### 4. IPlainTextInputElement

```typescript
interface IPlainTextInputElement extends IInputElement {
    type: BlockElementType.PLAIN_TEXT_INPUT;
    initialValue?: string;     // Pre-filled text
    multiline?: boolean;       // Default: false (single-line). true = textarea
    placeholder: ITextObject;
    dispatchActionConfig?: Array<InputElementDispatchAction>;
}
```

**Key behaviors:**
- `multiline: false` — single-line input field
- `multiline: true` — expandable textarea
- `dispatchActionConfig` with `ON_CHARACTER_ENTERED` fires block action on every keystroke
- `initialValue` prepopulates the field

**Example:**

```typescript
const descriptionInput = builder.newPlainTextInputElement({
    placeholder: builder.newPlainTextObject('Describe the issue...'),
    initialValue: '',
    multiline: true,
});

const searchInput = builder.newPlainTextInputElement({
    placeholder: builder.newPlainTextObject('Search...'),
    dispatchActionConfig: [InputElementDispatchAction.ON_CHARACTER_ENTERED],
});
```

### 5. IStaticSelectElement

```typescript
interface IStaticSelectElement extends ISelectElement {
    type: BlockElementType.STATIC_SELECT;
    placeholder: ITextObject;
    options: Array<IOptionObject>;
    initialValue?: string;      // Preselected option value
}
```

**Key behaviors:**
- Single-choice dropdown
- `initialValue` must match one of the `options[].value`
- The selected value is delivered in the form submission or block action context

**Example:**

```typescript
const priority = builder.newStaticSelectElement({
    placeholder: builder.newPlainTextObject('Select priority'),
    options: [
        { text: builder.newPlainTextObject('P0 - Critical'), value: 'p0' },
        { text: builder.newPlainTextObject('P1 - High'), value: 'p1' },
        { text: builder.newPlainTextObject('P2 - Normal'), value: 'p2' },
        { text: builder.newPlainTextObject('P3 - Low'), value: 'p3' },
    ],
    initialValue: 'p2',
});
```

### 6. IMultiStaticSelectElement

```typescript
interface IMultiStaticSelectElement extends ISelectElement {
    type: BlockElementType.MULTI_STATIC_SELECT;
    placeholder: ITextObject;
    options: Array<IOptionObject>;
    initialValue?: Array<string>; // Array of preselected option values
}
```

**Key behaviors:**
- Multi-choice dropdown (checkboxes)
- `initialValue` is an array of strings, each matching an `options[].value`
- The selected values are delivered as an array in the interaction context

**Example:**

```typescript
const tags = builder.newMultiStaticElement({
    placeholder: builder.newPlainTextObject('Select tags'),
    options: [
        { text: builder.newPlainTextObject('Bug'), value: 'bug' },
        { text: builder.newPlainTextObject('Feature'), value: 'feature' },
        { text: builder.newPlainTextObject('Docs'), value: 'docs' },
        { text: builder.newPlainTextObject('Enhancement'), value: 'enhancement' },
    ],
    initialValue: ['bug'],
});
```

## Element Placement — Which Elements Go Where

| Element | Section Accessory | Actions Block | Input Block | Context Block |
|---|---|---|---|---|
| `IButtonElement` | Yes | Yes | No | No |
| `IImageElement` | Yes | No | No | Yes (as element) |
| `IOverflowMenuElement` | Yes | Yes | No | No |
| `IPlainTextInputElement` | No | No | Yes (as `element`) | No |
| `IStaticSelectElement` | No | No | Yes (as `element`) | No |
| `IMultiStaticSelectElement` | No | No | Yes (as `element`) | No |

## Typical Workflow

1. Create a `BlockBuilder` instance
2. Use element factory methods (`newButtonElement`, `newStaticSelectElement`, etc.) to create elements
3. Place elements into blocks (`addSectionBlock({ accessory })`, `addActionsBlock({ elements })`, `addInputBlock({ element })`)
4. Call `getBlocks()` on the builder
5. Handle interactions by reading `context.getInteractionData().value` in your handler

## Example: Complete Form Block

```typescript
import {
    BlockBuilder,
    BlockElementType,
    InputElementDispatchAction,
} from '@rocket.chat/apps-engine/definition/uikit';

const builder = new BlockBuilder(appId);

builder.addInputBlock({
    label: builder.newPlainTextObject('Full Name'),
    element: builder.newPlainTextInputElement({
        placeholder: builder.newPlainTextObject('Enter your name'),
    }),
});

builder.addInputBlock({
    label: builder.newPlainTextObject('Description'),
    element: builder.newPlainTextInputElement({
        placeholder: builder.newPlainTextObject('Write your description...'),
        multiline: true,
    }),
});

builder.addInputBlock({
    label: builder.newPlainTextObject('Department'),
    element: builder.newStaticSelectElement({
        placeholder: builder.newPlainTextObject('Choose department'),
        options: [
            { text: builder.newPlainTextObject('Engineering'), value: 'eng' },
            { text: builder.newPlainTextObject('Marketing'), value: 'mktg' },
            { text: builder.newPlainTextObject('Sales'), value: 'sales' },
        ],
    }),
});

builder.addActionsBlock({
    elements: [
        builder.newButtonElement({
            text: builder.newPlainTextObject('Submit'),
            style: ButtonStyle.PRIMARY,
            value: 'submit',
        }),
    ],
});
```

## Best Practices

1. **Always set `altText` on images** — required for accessibility.
2. **Use `value` for machine-readable payloads** — the user-visible text (in `text` or `options[].text`) is for display; `value` is what the handler receives.
3. **Prefer `ON_ITEM_SELECTED` over `ON_CHARACTER_ENTERED`** for selects — avoid unnecessary interaction firings.
4. **Keep `overflow` menu to a manageable number of options** — 3-7 options is ideal.
5. **Provide `placeholder` for all input elements** — it's required by the `IInputElement` interface.
6. **Do not set both `url` and `value` on one button** — if `url` is present, no interaction fires.

## Common Mistakes

- **Placing an `IButtonElement` in an `addInputBlock`** — Input blocks only accept `IPlainTextInputElement`, `IStaticSelectElement`, or `IMultiStaticSelectElement` as the `element`. Use `addActionsBlock` for buttons.
- **Forgetting to add a `label` on `addInputBlock`** — The `label` (ITextObject) is required.
- **Using `newImageElement` without the image being accessible** — The `imageUrl` must be a publicly reachable URL.
- **Confusing `newMultiStaticElement` with `newStaticSelectElement`** — The multi variant accepts `initialValue: Array<string>`; the single variant accepts `initialValue: string`.
- **Setting `dispatchActionConfig` on selects without handling the rapid events** — Each selection change fires a block action; ensure your handler is idempotent.

## Related Topics
- [UI Kit Block Builder](./uikit-block-builder.md)
- [UI Kit Text Objects](./uikit-text-objects.md) — `ITextObject`, `IOptionObject`
- [UI Kit Interaction Handler](./uikit-interaction-handler.md)
- [UI Kit Modals](./uikit-modals.md)
