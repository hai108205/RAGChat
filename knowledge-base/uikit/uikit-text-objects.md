# UI Kit Text Objects

## Purpose
Text objects define **how text is rendered** in UI Kit blocks, surfaces, and element labels. Unlike raw strings, text objects carry rendering instructions: the text format (plain text or mrkdwn) and whether to parse emoji shortcodes.

## Overview
Three main interfaces form the text system:

| Interface | Role |
|---|---|
| `ITextObject` | A formatted text wrapper (plain text with optional emoji, or mrkdwn) |
| `TextObjectType` | Enum: `PLAINTEXT` or `MARKDOWN` |
| `IOptionObject` | A selectable option (used in select menus, overflow menus) |

## When to Use

| Context | Text Object Type |
|---|---|
| Block text (section, context) | Both — use `MARKDOWN` for formatted, `PLAINTEXT` for unformatted |
| Button labels | `PLAINTEXT` (mrkdwn not supported on buttons) |
| Element placeholders | `PLAINTEXT` |
| Input labels | `PLAINTEXT` |
| Surface titles | Both |
| Select/overflow options | `IOptionObject` wrapping a text object |

## Important Interfaces

### `TextObjectType` Enum

```typescript
enum TextObjectType {
    MARKDOWN = 'mrkdwn',
    PLAINTEXT = 'plain_text',
}
```

### `ITextObject`

```typescript
interface ITextObject {
    type: TextObjectType;
    text: string;
    emoji?: boolean;  // Only meaningful when type is PLAINTEXT
}
```

**Properties:**
- `type` — `'mrkdwn'` or `'plain_text'`
- `text` — The display text. For `mrkdwn`, supports `*bold*`, `_italic_`, `~strikethrough~`, links, and line breaks
- `emoji` — When `true` and `type` is `PLAINTEXT`, client renders `:emoji:` shortcodes as emoji glyphs. Only valid for `plain_text` type.

### `IOptionObject`

```typescript
interface IOptionObject {
    text: ITextObject;   // Display label
    value: string;       // Machine-readable identifier
    url?: string;        // For overflow menus: opens URL instead of firing action
}
```

Used in:
- `IStaticSelectElement.options`
- `IMultiStaticSelectElement.options`
- `IOverflowMenuElement.options`

## PLAINTEXT vs MARKDOWN — When To Use Each

### Use `PLAINTEXT` For:

- Button labels (`IButtonElement.text`)
- Input placeholders (`IPlainTextInputElement.placeholder`)
- Input labels (`IInputBlock.label`)
- Select option labels (`IOptionObject.text`)
- Any text where formatting is not expected

PLAINTEXT renders exactly as provided. The `emoji: true` flag enables `:smile:` shortcode parsing — the Rocket.Chat client will render `:rocket:` as the rocket emoji glyph.

```typescript
// Renders: "Hello :rocket:" with rocket emoji
const text = builder.newPlainTextObject('Hello :rocket:', true);
```

### Use `MARKDOWN` For:

- Section block body text (`ISectionBlock.text`)
- Context block text (`IContextBlock.elements[].text`)
- Any text requiring bold, italic, strikethrough, links, or line breaks

MARKDOWN supports the **mrkdwn** subset (Slack-style mrkdwn, not full Markdown):
- `*bold*` → **bold**
- `_italic_` → _italic_
- `~strikethrough~` → ~~strikethrough~~
- `<https://example.com|Link Text>` → hyperlink
- `\n` → line break

```typescript
// Renders formatted text with bold and italics
const text = builder.newMarkdownTextObject(
    '*Important:* Please review the _quarterly report_ by EOD.\n\n<https://example.com|View Report>'
);
```

**`emoji` is NOT supported on mrkdwn text objects.** The `emoji` property is only meaningful for `PLAINTEXT`. Emoji in mrkdwn text must be literal Unicode characters or the client won't render them.

## Comparison Table

| Feature | PLAINTEXT | MARKDOWN |
|---|---|---|
| Bold `*text*` | No | Yes |
| Italic `_text_` | No | Yes |
| Strikethrough `~text~` | No | Yes |
| Hyperlinks `<url\|label>` | No | Yes |
| Line breaks `\n` | No (literal) | Yes (rendered) |
| `:emoji:` rendering | Yes (with `emoji: true`) | No |
| Use on buttons | Yes | Not supported |
| Use on placeholders | Yes | Not supported |

## Emoji Rendering Detail

When `type` is `PLAINTEXT` and `emoji` is `true`, the Rocket.Chat client parses the text for emoji shortcodes (`:smile:`, `:rocket:`, `:thumbsup:`) and replaces them with Unicode emoji glyphs. Standard Slack-style emoji naming applies.

When `emoji` is `false` (default), `:rocket:` renders as literal text `:rocket:`.

```typescript
// Renders: "Hello 🚀" with rocket emoji
const withEmoji = {
    type: TextObjectType.PLAINTEXT,
    text: 'Hello :rocket:',
    emoji: true,
};

// Renders: "Hello :rocket:" as literal text
const withoutEmoji = {
    type: TextObjectType.PLAINTEXT,
    text: 'Hello :rocket:',
    emoji: false,
};
```

## IOptionObject Usage Patterns

### In Static Select or Multi Static Select

```typescript
const statusSelect = builder.newStaticSelectElement({
    placeholder: builder.newPlainTextObject('Select status'),
    options: [
        {
            text: builder.newPlainTextObject('Todo'),
            value: 'todo',
        },
        {
            text: builder.newPlainTextObject('In Progress'),
            value: 'in_progress',
        },
        {
            text: builder.newPlainTextObject('Done'),
            value: 'done',
        },
    ],
});
```

### In Overflow Menu

```typescript
const menu = builder.newOverflowMenuElement({
    options: [
        {
            text: builder.newPlainTextObject('Edit'),
            value: 'edit',
        },
        {
            text: builder.newPlainTextObject('View Documentation'),
            value: 'docs',
            url: 'https://docs.example.com',  // Opens URL, no interaction fired
        },
        {
            text: builder.newPlainTextObject('Delete'),
            value: 'delete',
        },
    ],
});
```

When `url` is set on an `IOptionObject` inside an overflow menu, selecting it opens the URL directly — no interaction is fired to the App.

## Typical Workflow

1. Use `builder.newPlainTextObject()` for labels, buttons, placeholders, option text
2. Use `builder.newMarkdownTextObject()` for rich body text in section and context blocks
3. Set `emoji: true` on plain text objects that contain emoji shortcodes
4. Wrap option labels in plain text objects inside `IOptionObject`

## Best Practices

1. **Always use `PLAINTEXT` for option labels** — mrkdwn formatting in dropdown options is not supported and may render incorrectly.
2. **Keep `text` concise for buttons** — long button labels are truncated. Use the section `text` for context.
3. **Use emoji shortcodes sparingly** — 1-2 emoji per text block enhances readability; overuse creates visual noise.
4. **Prefer `newMarkdownTextObject` for message bodies** — mrkdwn gives you formatting for emphasis and structure.
5. **Validate `options[].value` uniqueness** — duplicate values in select or overflow menus cause ambiguous behavior.

## Common Mistakes

- **Setting `emoji: true` on a `MARKDOWN` text object** — the property is silently ignored. Use literal Unicode emoji in mrkdwn text instead.
- **Using `*` for bold in `PLAINTEXT`** — asterisks render as literal asterisks without mrkdwn type.
- **Forgetting `emoji: true` when using `:shortcodes:`** — the shortcode renders as text, not the emoji glyph.
- **Using `newMarkdownTextObject` for a button label** — buttons only support `PLAINTEXT`. The builder won't error, but the client may strip formatting.
- **Using `newMarkdownTextObject` for an input placeholder** — placeholders only support `PLAINTEXT`.

## Related Topics
- [UI Kit Elements](./uikit-elements.md) — where text objects are consumed
- [UI Kit Block Builder](./uikit-block-builder.md) — factory methods `newPlainTextObject`, `newMarkdownTextObject`
- [UI Kit Interaction Handler](./uikit-interaction-handler.md)
