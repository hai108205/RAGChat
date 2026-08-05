# Message Actions

## Purpose

`IMessageAction` defines interactive buttons and select menus rendered on message attachments. Actions turn a static attachment card into an interactive element — users click buttons to trigger slash commands, open URLs, or send messages in the chat.

---

## Overview

Actions are attached to an `IMessageAttachment` via the `actions` array. Each action specifies a `type` (currently only `BUTTON`), a display `text`, and a behavior — either navigating to a `url` or sending a `msg` (slash command) back to the chat. Buttons can be aligned vertically (stacked) or horizontally (side by side) via `actionButtonsAlignment` on the parent attachment.

The action system provides a lightweight alternative to UI Kit blocks for simple confirmations, quick replies, and navigation links.

---

## When To Use

- Adding a confirmation button to a card → `type: BUTTON`, `msg: '/confirm'`
- Linking to an external URL → `type: BUTTON`, `url: 'https://...'`
- Opening a URL in a webview → `type: BUTTON`, `url`, `is_webview: true`
- Sending a slash command silently (not in chat window) → `msg_in_chat_window: false`
- Responding with a message (not sending a command) → `msg_processing_type: 'respondWithMessage'`

---

## Important Interfaces & Enums

| Name | Role | Key Members |
|------|------|-------------|
| `IMessageAction` | A single action button/select | `type`, `text`, `url`, `msg` |
| `MessageActionType` | Enum of action types | `BUTTON = 'button'` |
| `MessageActionButtonsAlignment` | Layout direction for buttons | `VERTICAL = 'vertical'`, `HORIZONTAL = 'horizontal'` |
| `MessageProcessingType` | How `msg` is processed | `SendMessage = 'sendMessage'`, `RespondWithMessage = 'respondWithMessage'` |

---

## IMessageAction Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `MessageActionType` | **Yes** | Action type. Currently only `MessageActionType.BUTTON` (`'button'`) is supported. |
| `text` | `string` | No | Display text on the button. |
| `url` | `string` | No | URL to open when clicked. Mutually exclusive with `msg` — use one or the other. |
| `image_url` | `string` | No | URL of an image to display on the button (instead of text). |
| `is_webview` | `boolean` | No | When `true` and `url` is set, opens the URL in a webview overlay instead of a new tab. |
| `webview_height_ratio` | `string` | No | Height ratio for the webview. Values like `'compact'`, `'tall'`, `'full'`. |
| `msg` | `string` | No | Slash command or message text sent when clicked. Mutually exclusive with `url`. |
| `msg_in_chat_window` | `boolean` | No | When `true`, the `msg` is displayed in the chat input (user can edit before sending). When `false`, sent directly. Defaults to `false`. |
| `msg_processing_type` | `MessageProcessingType` | No | Controls how the `msg` is processed: `'sendMessage'` sends as a new message; `'respondWithMessage'` sends as a response. |

---

## MessageActionType Enum

```typescript
export enum MessageActionType {
    BUTTON = 'button',
}
```

Only `BUTTON` is currently defined. The `select` type from Slack's attachment actions is not yet implemented.

---

## MessageProcessingType Enum

```typescript
export enum MessageProcessingType {
    SendMessage = 'sendMessage',
    RespondWithMessage = 'respondWithMessage',
}
```

| Value | Behavior |
|-------|----------|
| `'sendMessage'` | The `msg` is sent to the chat as a new message (like typing it in the input box). |
| `'respondWithMessage'` | The `msg` is sent as a response to the original message. |

---

## MessageActionButtonsAlignment Enum

```typescript
export enum MessageActionButtonsAlignment {
    VERTICAL = 'vertical',
    HORIZONTAL = 'horizontal',
}
```

Configured on the parent `IMessageAttachment.actionButtonsAlignment`, not per-action. Controls layout of all actions in the attachment.

---

## Typical Workflow

### 1. Defining Actions on an Attachment

```typescript
import {
    MessageActionType,
    MessageProcessingType,
    MessageActionButtonsAlignment,
} from '@rocket.chat/apps-engine/definition/messages';

const attachment = {
    title: { value: 'Approval Required' },
    text: 'Please approve or reject this request.',
    actionButtonsAlignment: MessageActionButtonsAlignment.HORIZONTAL,
    actions: [
        {
            type: MessageActionType.BUTTON,
            text: 'Approve',
            msg: '/approve-request 42',
            msg_in_chat_window: true,
            msg_processing_type: MessageProcessingType.SendMessage,
        },
        {
            type: MessageActionType.BUTTON,
            text: 'Reject',
            msg: '/reject-request 42',
            msg_in_chat_window: true,
            msg_processing_type: MessageProcessingType.SendMessage,
        },
    ],
};

builder.addAttachment(attachment);
```

### 2. URL Action (External Link)

```typescript
const attachment = {
    title: { value: 'View Dashboard' },
    text: 'Click below to open the dashboard.',
    actions: [
        {
            type: MessageActionType.BUTTON,
            text: 'Open Dashboard',
            url: 'https://dashboard.example.com',
        },
    ],
};

builder.addAttachment(attachment);
```

### 3. Webview Action

```typescript
const attachment = {
    title: { value: 'Quick Survey' },
    text: 'Fill out the survey without leaving Rocket.Chat.',
    actions: [
        {
            type: MessageActionType.BUTTON,
            text: 'Open Survey',
            url: 'https://example.com/survey',
            is_webview: true,
            webview_height_ratio: 'tall',
        },
    ],
};

builder.addAttachment(attachment);
```

---

## Example

### Complete Approval Message

```typescript
import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import {
    MessageActionType,
    MessageProcessingType,
} from '@rocket.chat/apps-engine/definition/messages';

async function sendApprovalRequest(
    read: IRead,
    modify: IModify,
    room: any,
    requestId: string,
    details: string,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();

    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText('A new request requires your approval.')
        .addAttachment({
            color: '#ffcc00',
            title: { value: `Request #${requestId}` },
            text: details,
            fields: [
                { title: 'Status', value: 'Pending Approval', short: true },
                { title: 'Request ID', value: requestId, short: true },
            ],
            actions: [
                {
                    type: MessageActionType.BUTTON,
                    text: 'Approve',
                    msg: `/approve ${requestId}`,
                    msg_in_chat_window: true,
                    msg_processing_type: MessageProcessingType.SendMessage,
                },
                {
                    type: MessageActionType.BUTTON,
                    text: 'Reject',
                    msg: `/reject ${requestId}`,
                    msg_in_chat_window: true,
                    msg_processing_type: MessageProcessingType.SendMessage,
                },
                {
                    type: MessageActionType.BUTTON,
                    text: 'View Details',
                    url: `https://example.com/requests/${requestId}`,
                },
            ],
        });

    await modify.getCreator().finish(builder);
}
```

---

## Best Practices

- **Use `msg_in_chat_window: true` for destructive or important actions** — lets the user review the command before it sends.
- **Use `msg_in_chat_window: false` for quick, safe actions** — sends immediately without user review.
- **Always set `msg_processing_type` when using `msg`** — inconsistent behavior can result if omitted.
- **Use horizontal alignment for 2-3 buttons**; **vertical for 4+** or long button text.
- **Provide both `url` for web access and `msg` for slash commands** where applicable — users may prefer different interaction modes.
- **Handle slash commands in your app** — actions that send a `msg` (`/approve 42`) require a corresponding slash command handler in your app to process them.

---

## Common Mistakes

- **Setting both `url` and `msg` on the same action** — mutually exclusive. Pick one behavior per action.
- **Not setting `msg_processing_type`** — when `msg` is set, always specify `msg_processing_type` to control whether it is sent as a new message or a response.
- **Forgetting to register the slash command** — if your action sends `/approve 42`, your app must register and handle the `approve` slash command.
- **Using an unsupported action type** — only `MessageActionType.BUTTON` exists. `select` menus are not yet implemented.
- **Setting `actionButtonsAlignment` on the action** — it goes on the parent attachment, not on individual actions.

---

## Related Topics

- [Message Structure](./message-structure.md)
- [Message Attachments](./message-attachments.md)
- [Message Reactions](./message-reactions.md)
- [Slash Commands](../commands/slash-commands.md)
