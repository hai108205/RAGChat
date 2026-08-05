# UI Kit Block Builder

## Purpose
`BlockBuilder` is a fluent API for constructing **UI Kit block layouts** (messages and surfaces) programmatically within a Rocket.Chat App. It auto-generates UUID-based `blockId` and `actionId` values, eliminating boilerplate ID management.

## Overview
The builder chains methods to add blocks (section, image, divider, actions, context, input, conditional) and provides factory methods for creating the elements and text objects that populate those blocks. The final `.getBlocks()` output can be passed to `IModify.getCreator().finish()` for messages or to `UIKitInteractionResponder.openModalViewResponse()` for modals.

## When to Use
- Sending a message with structured UI (buttons, selects, images)
- Building a modal or contextual bar surface
- Any scenario where you need programmatic block construction with automatic ID generation

## Important Interfaces

| Interface / Class | Role |
|---|---|
| `BlockBuilder` | Fluent builder — holds blocks, creates elements/text objects |
| `IBlock` | Base block type with `type`, `appId`, `blockId` |
| `IInteractiveElement` | Element with `actionId` (button, overflow, inputs, selects) |
| `ITextObject` | Text rendering object (plain_text or mrkdwn) |

## Constructor

```typescript
new BlockBuilder(appId: string)
```

- **`appId`** — the App's unique identifier (available in context or from `this.getID()` in your App class)
- Initializes an empty internal `blocks` array
- Every block added gets this `appId` stamped on it automatically

## Methods

### Block Addition Methods

Each returns `this` (fluent/chaining pattern).

| Method | Signature | Block Type |
|---|---|---|
| `addSectionBlock` | `(block: SectionBlockParam) => BlockBuilder` | `BlockType.SECTION` |
| `addImageBlock` | `(block: ImageBlockParam) => BlockBuilder` | `BlockType.IMAGE` |
| `addDividerBlock` | `() => BlockBuilder` | `BlockType.DIVIDER` |
| `addActionsBlock` | `(block: ActionsBlockParam) => BlockBuilder` | `BlockType.ACTIONS` |
| `addContextBlock` | `(block: ContextBlockParam) => BlockBuilder` | `BlockType.CONTEXT` |
| `addInputBlock` | `(block: InputBlockParam) => BlockBuilder` | `BlockType.INPUT` |
| `addConditionalBlock` | `(innerBlocks, condition?) => BlockBuilder` | `BlockType.CONDITIONAL` |

#### `addConditionalBlock` Details

```typescript
addConditionalBlock(
  innerBlocks: BlockBuilder | Array<IBlock>,
  condition?: IConditionalBlockFilters
): BlockBuilder
```

- Renders inner blocks only when condition is met
- `condition.engine`: `["rocket.chat"]` (regular client) | `["livechat"]` (Livechat widget) | omitted (both)
- You can pass another `BlockBuilder` instance or a raw block array

### Element Factory Methods

Each creates a fully typed element. `actionId` is auto-generated via UUID v1 if not provided — **except** `ImageElement` (non-interactive, no actionId).

| Method | Returns | Auto-generates actionId? |
|---|---|---|
| `newButtonElement(info)` | `IButtonElement` | Yes |
| `newImageElement(info)` | `IImageElement` | No |
| `newOverflowMenuElement(info)` | `IOverflowMenuElement` | Yes |
| `newPlainTextInputElement(info)` | `IPlainTextInputElement` | Yes |
| `newStaticSelectElement(info)` | `IStaticSelectElement` | Yes |
| `newMultiStaticElement(info)` | `IMultiStaticSelectElement` | Yes |

### Text Object Factory Methods

| Method | Returns | Description |
|---|---|---|
| `newPlainTextObject(text, emoji?)` | `ITextObject` | `emoji` defaults to `false`. Set `true` to render `:emoji:` shortcodes. |
| `newMarkdownTextObject(text)` | `ITextObject` | Supports mrkdwn formatting (`*bold*`, `_italic_`, etc.) |

### Output Method

| Method | Returns |
|---|---|
| `getBlocks()` | `Array<IBlock>` |

## Auto-Generated IDs

- **`blockId`**: Assigned to every block via `uuid.v1()` in the private `addBlock()` method (unless caller already set `blockId`)
- **`actionId`**: Assigned to interactive elements (buttons, selects, input, overflow) via `uuid.v1()` in the private helper methods: `newInteractiveElement()`, `newInputElement()`, `newSelectElement()`

If you provide an `actionId` in the `info` parameter, the builder **preserves your value** and skips auto-generation.

## Typical Workflow

1. Create `new BlockBuilder(appId)`
2. Use element/text factory methods to build components
3. Add blocks via `add*` methods, passing in the components
4. Call `getBlocks()` to get the final array
5. Pass blocks to `IModify.getCreator().finish()` or a surface view

## Example: Complete Flow (Build Blocks -> Add to Message -> Send)

```typescript
import { IAppAccessors, IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import {
    BlockBuilder,
    BlockElementType,
    BlockType,
    ButtonStyle,
    TextObjectType,
} from '@rocket.chat/apps-engine/definition/uikit';

async function sendInteractiveMessage(
    room: IRoom,
    user: IUser,
    read: IRead,
    modify: IModify,
) {
    const builder = new BlockBuilder('my-app-id');

    // Text objects
    const titleText = builder.newPlainTextObject('Task Manager', true); // emoji support

    const primaryBtn = builder.newButtonElement({
        text: builder.newPlainTextObject('Approve'),
        style: ButtonStyle.PRIMARY,
        value: 'approve',
    });

    const dangerBtn = builder.newButtonElement({
        text: builder.newPlainTextObject('Reject'),
        style: ButtonStyle.DANGER,
        value: 'reject',
    });

    const selectMenu = builder.newStaticSelectElement({
        placeholder: builder.newPlainTextObject('Priority'),
        options: [
            { text: builder.newPlainTextObject('High'), value: 'high' },
            { text: builder.newPlainTextObject('Medium'), value: 'medium' },
            { text: builder.newPlainTextObject('Low'), value: 'low' },
        ],
    });

    // Build blocks
    builder
        .addSectionBlock({ text: titleText })
        .addDividerBlock()
        .addInputBlock({
            label: builder.newPlainTextObject('Assign Priority'),
            element: selectMenu,
        })
        .addActionsBlock({
            elements: [primaryBtn, dangerBtn],
        });

    const message = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(user)
        .setBlocks(builder); // setBlocks accepts BlockBuilder directly

    await modify.getCreator().finish(message);
}
```

## Key Relationships

- `addSectionBlock({ text, accessory? })` — The `accessory` is one of `AccessoryElements` (button, image, or overflow). Created via the builder's element factories.
- `addActionsBlock({ elements })` — Accepts an array of `IBlockElement` (any interactive element type).
- `addContextBlock({ elements })` — Accepts `Array<ITextObject | IImageElement>`. Mixed content for small text/image display.
- `addInputBlock({ element, label, optional? })` — `element` must be an `IInputElement` (plain_text_input, static_select, multi_static_select). `label` is required.

## Best Practices

1. **Use a single `BlockBuilder`** per message/surface — don't split blocks across multiple builders unless you're composing conditional blocks.
2. **Provide explicit `actionId`** values for components that need identification in handlers (easier debugging). Otherwise the UUID auto-generation is fine.
3. **Chain fluently** — all `add*` methods return `this`.
4. **Pass builder directly to `setBlocks()`** — `IMessageBuilder.setBlocks()` accepts `BlockBuilder | Array<IBlock>`.
5. **Use `newMarkdownTextObject`** for formatted text in section blocks; `newPlainTextObject` with `emoji: true` for emoji rendering.

## Common Mistakes

- **Using `newPlainTextObject` for Mrkdwn content** — Mrkdwn formatting (`*bold*`, `_italic_`) won't render. Use `newMarkdownTextObject` instead.
- **Forgetting `placeholder` on selects** — Both `newStaticSelectElement` and `newMultiStaticElement` require a `placeholder` (`ITextObject`). Omitting it causes runtime errors.
- **Providing both `url` and `value` on a button** — If `url` is set, the button opens a link instead of firing an interaction. For interactive blocks, use `value` only.
- **Overwriting auto-generated `blockId`** — If you explicitly set `blockId`, the builder respects it. Ensure it's unique.
- **Using `addInputBlock` with a non-input element** — The `element` field must be `IPlainTextInputElement | IStaticSelectElement | IMultiStaticSelectElement`. A button won't work here.

## Related Topics
- [UI Kit Elements](./uikit-elements.md)
- [UI Kit Text Objects](./uikit-text-objects.md)
- [UI Kit Interaction Handler](./uikit-interaction-handler.md)
- [UI Kit Modals](./uikit-modals.md)
