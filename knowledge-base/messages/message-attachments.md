# Message Attachments

## Purpose

`IMessageAttachment` defines rich structured content — cards, colored alerts, images, tables — that Rocket.Chat displays inline alongside message text. Attachments are the primary mechanism for apps to present formatted information beyond plain text.

---

## Overview

An attachment renders as a bordered card with an optional left color stripe, title, author line, body text, inline image, fields table, timestamp, and action buttons. Multiple attachments on one message stack vertically. Attachments support audio/video URLs, file references, and collapsible sections.

Rocket.Chat's attachment system mirrors Slack's attachment format, making it familiar to developers who have built Slack integrations.

---

## When To Use

- Displaying structured data (tables, key-value pairs) → `fields`
- Showing a colored alert or notification → `color`
- Presenting a card with title and body text → `title`, `text`
- Attributing content to an author → `author`
- Embedding images inline → `imageUrl` or `thumbnailUrl`
- Adding action buttons below the card → `actions`
- Playing audio or video → `audioUrl`, `videoUrl`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IMessageAttachment` | The attachment card itself | `title`, `text`, `color`, `imageUrl`, `fields`, `actions`, `author` |
| `IMessageAttachmentField` | A single field (key-value pair) | `title`, `value`, `short` |
| `IMessageAttachmentAuthor` | Attribution line at top | `name`, `link`, `icon` |
| `IMessageAttachmentTitle` | Title block with optional link | `value`, `link`, `displayDownloadLink` |

---

## IMessageAttachment Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `color` | `string` | No | CSS color value for the left border stripe. Supports any valid CSS background-css value (`#ff0000`, `rgb(255,0,0)`, `rebeccapurple`). |
| `title` | `IMessageAttachmentTitle` | No | Title block displayed below the author line. |
| `text` | `string` | No | Body text of the attachment. Supports markdown. |
| `author` | `IMessageAttachmentAuthor` | No | Author attribution line at the top of the card. |
| `imageUrl` | `string` | No | Large inline image URL. Displays prominently in the card. |
| `thumbnailUrl` | `string` | No | Small image to the left of the text. Best with relatively small images. |
| `audioUrl` | `string` | No | Audio URL. Rendered via HTML `<audio>` element — only formats the browser supports will play. |
| `videoUrl` | `string` | No | Video URL. Rendered via HTML `<video>` element. |
| `fields` | `Array<IMessageAttachmentField>` | No | Array of key-value field pairs displayed as a table/columns below the text. |
| `actions` | `Array<IMessageAction>` | No | Action buttons or select menus displayed below the attachment. |
| `actionButtonsAlignment` | `MessageActionButtonsAlignment` | No | Controls action button layout: `'vertical'` or `'horizontal'`. |
| `timestamp` | `Date` | No | Time displayed next to the text. |
| `timestampLink` | `string` | No | Makes the timestamp clickable, linking to this URL. Only applies when `timestamp` is set. |
| `collapsed` | `boolean` | No | When `true`, hides the image, audio, and video sections. |
| `type` | `string` | No | Attachment type. Rarely used; primarily for `'file'` attachments. |
| `description` | `string` | No | Descriptive text for accessibility / alt text. |
| `fileId` | `string` | No | Links this attachment to a specific file (by file `_id`) already in Rocket.Chat. |

---

## IMessageAttachmentField

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | **Yes** | Field label. Bold text shown above the value. |
| `value` | `string` | **Yes** | Field content. Displayed below the title. |
| `short` | `boolean` | No | When `true`, fields render side-by-side in two columns. When `false` or omitted, fields stack vertically. |

---

## IMessageAttachmentAuthor

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Author name displayed at the top of the attachment. |
| `link` | `string` | No | URL — makes the author name clickable. |
| `icon` | `string` | No | URL to a small icon displayed to the left of the author's name (typically 16x16 or 32x32). |

---

## IMessageAttachmentTitle

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | `string` | No | Title text displayed below the author line, above the body text. |
| `link` | `string` | No | URL — makes the title clickable. |
| `displayDownloadLink` | `boolean` | No | When `true`, shows a download icon next to the title; clicking it triggers a download. |

---

## Typical Workflow

### 1. Adding Attachments via IMessageBuilder

```typescript
import { IModify } from '@rocket.chat/apps-engine/definition/accessors';

const builder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(appUser)
    .setText('Here is the report:')
    .addAttachment({
        color: '#00ff00',
        title: { value: 'Monthly Report', link: 'https://example.com/report' },
        text: 'All metrics are within expected ranges.',
    });

// Add a second attachment
builder.addAttachment({
    text: 'A secondary note without a title or color.',
});

await modify.getCreator().finish(builder);
```

`addAttachment()` appends to the existing attachments list. Use `setAttachments()` to **replace** all attachments.

### 2. Reading Attachments from Incoming Messages

```typescript
const attachments = message.attachments;
if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
        console.log(`Title: ${attachment.title?.value}`);
        console.log(`Text: ${attachment.text}`);
        console.log(`Color: ${attachment.color}`);
    }
}
```

---

## Examples

### Simple Card

```typescript
builder.addAttachment({
    title: { value: 'Hello from the App' },
    text: 'This is a simple card with a title and body text.',
});
```

### Colored Alert

```typescript
builder.addAttachment({
    color: '#ff0000',          // Red left border
    title: { value: ':warning: Critical Alert' },
    text: 'The server disk usage has exceeded 90%. Immediate action required.',
});
```

### Author Attribution

```typescript
builder.addAttachment({
    author: {
        name: 'John Doe',
        link: 'https://example.com/profile/john',
        icon: 'https://example.com/avatars/john.png',
    },
    title: { value: 'New Feature Announcement' },
    text: 'We are excited to announce the release of v2.0 with improved performance.',
});
```

### Fields Table (Key-Value Pairs)

```typescript
builder.addAttachment({
    title: { value: 'Deploy Summary' },
    text: 'Deployment completed successfully.',
    color: '#36a64f',
    fields: [
        { title: 'Environment', value: 'Production', short: true },
        { title: 'Version', value: '2.4.1', short: true },
        { title: 'Duration', value: '2m 34s', short: true },
        { title: 'Status', value: 'Success', short: true },
        { title: 'Triggered by', value: 'CI/CD Pipeline', short: false },
    ],
});
```

`short: true` fields render two per row. `short: false` (or omitted) fields span the full width.

### Image Thumbnail with Text

```typescript
builder.addAttachment({
    author: { name: 'Image Bot' },
    title: { value: 'Screenshot', link: 'https://example.com/full-size.png' },
    thumbnailUrl: 'https://example.com/thumb.png',
    text: 'Here is the screenshot you requested.',
});
```

### Action Buttons

```typescript
import { MessageActionType, MessageProcessingType } from '@rocket.chat/apps-engine/definition/messages';

builder.addAttachment({
    title: { value: 'Confirm Action' },
    text: 'Do you want to proceed?',
    actionButtonsAlignment: 'horizontal',
    actions: [
        {
            type: MessageActionType.BUTTON,
            text: 'Yes',
            msg: '/confirm-action yes',
            msg_in_chat_window: true,
            msg_processing_type: MessageProcessingType.SendMessage,
        },
        {
            type: MessageActionType.BUTTON,
            text: 'No',
            msg: '/confirm-action no',
            msg_in_chat_window: true,
            msg_processing_type: MessageProcessingType.SendMessage,
        },
        {
            type: MessageActionType.BUTTON,
            text: 'View Details',
            url: 'https://example.com/details',
        },
    ],
});
```

---

## Best Practices

- **Use `color` sparingly** — reserved for alerts and important notifications. Common choices: `#ff0000` (red/error), `#36a64f` (green/success), `#ffcc00` (yellow/warning).
- **Keep `title.value` short** (one line). Long titles get truncated.
- **Use `fields` for structured data** rather than cramming it into `text`. Fields render cleaner and are more scannable.
- **Mark `short: true` only when two fields fit on one row**. Long values should use `short: false`.
- **Provide `timestampLink`** when using `timestamp` to make the time a useful reference.
- **Set `actionButtonsAlignment`** explicitly — `'vertical'` stacks buttons, `'horizontal'` places them side by side.
- **Use `imageUrl` for content images**, `thumbnailUrl` for small decorative/icon images alongside text.

---

## Common Mistakes

- **Forgetting to wrap title in an object** — `title: 'My Title'` is wrong; must be `title: { value: 'My Title' }`.
- **Using `titleLink` instead of `title.link`** — the title link goes on the `IMessageAttachmentTitle` object: `title: { value: 'Text', link: 'https://...' }`.
- **Using `author_name`, `author_icon`, `author_link`** — these are Slack field names, not Rocket.Chat app engine names. Use `author: { name: '...', icon: '...', link: '...' }`.
- **Multiple `short: true` fields with long content** — if values are too long for a two-column layout, use `short: false`.
- **Not providing `msg_processing_type` on actions** — when `msg` is set on an action, always specify `msg_processing_type` to control how the message is processed.

---

## Related Topics

- [Message Structure](./message-structure.md)
- [Message Actions](./message-actions.md)
- [Message Files](./message-files.md)
- [Message Reactions](./message-reactions.md)
