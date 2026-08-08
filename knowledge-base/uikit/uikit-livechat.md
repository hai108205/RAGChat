# UI Kit Livechat Interactions

## Purpose

`IUIKitLivechatInteractionHandler` is the interface your App implements to handle UI Kit block interactions originating from the **livechat widget**. It mirrors `IUIKitInteractionHandler` but operates in the livechat context where the actor is an `IVisitor` (not an `IUser`).

---

## Overview

The livechat widget can render UI Kit blocks (buttons, select menus, overflow menus, date pickers). When a visitor interacts with a block, the Apps Engine routes the event to `IUIKitLivechatInteractionHandler` instead of the regular `IUIKitInteractionHandler`.

Key difference: **`visitor` instead of `user`**. Every incoming interaction carries `visitor: IVisitor` rather than `user: IUser`.

---

## When To Use

| Handler | Trigger |
|---------|---------|
| `UIKIT_LIVECHAT_BLOCK_ACTION` | Visitor clicks a button, selects an option, or interacts with a block in the livechat widget |

Note: Only `BLOCK_ACTION` is supported for livechat. There is no livechat equivalent for `VIEW_SUBMIT`, `VIEW_CLOSE`, or `ACTION_BUTTON` -- those are agent-side only.

---

## Important Interfaces

### IUIKitLivechatInteractionHandler

```typescript
interface IUIKitLivechatInteractionHandler {
    [AppMethod.UIKIT_LIVECHAT_BLOCK_ACTION]?(
        context: UIKitLivechatBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse>;
}
```

### IUIKitLivechatBaseIncomingInteraction

```typescript
interface IUIKitLivechatBaseIncomingInteraction {
    appId: string;
    visitor: IVisitor;       // ← visitor, not user
    actionId?: string;
    room?: IRoom;
    triggerId?: string;
}
```

### IUIKitLivechatBlockIncomingInteraction

```typescript
interface IUIKitLivechatBlockIncomingInteraction extends IUIKitLivechatBaseIncomingInteraction {
    value?: string;
    message?: IMessage;
    triggerId: string;
    actionId: string;
    blockId: string;
    room: IUIKitLivechatBaseIncomingInteraction['room'];
    container: IUIKitIncomingInteractionModalContainer | IUIKitIncomingInteractionMessageContainer;
}
```

### UIKitLivechatBlockInteractionContext

```typescript
class UIKitLivechatBlockInteractionContext extends UIKitLivechatInteractionContext {
    constructor(interactionData: IUIKitLivechatBlockIncomingInteraction);

    getInteractionData(): IUIKitLivechatBlockIncomingInteraction;
    getInteractionResponder(): UIKitInteractionResponder;   // inherited
}
```

---

## Livechat vs Regular UI Kit

| Feature | Regular (`IUIKitInteractionHandler`) | Livechat (`IUIKitLivechatInteractionHandler`) |
|---------|--------------------------------------|-----------------------------------------------|
| Actor | `user: IUser` | `visitor: IVisitor` |
| Block actions | `UIKitBlockInteractionContext` | `UIKitLivechatBlockInteractionContext` |
| View submit | Supported | **Not supported** |
| View close | Supported | **Not supported** |
| Action buttons | Supported | **Not supported** |
| Container types | Modal + ContextualBar + Message | Modal + Message only |
| Responder | `UIKitInteractionResponder` | `UIKitInteractionResponder` (same) |

The responder works identically in both contexts -- it extracts `appId`, `triggerId`, `actionId`, and `room` from the base context, which the livechat variant provides via constructor.

---

## How to Access

```typescript
// Your App class implements the interface:
class MyApp extends App implements IUIKitLivechatInteractionHandler {
    public async [AppMethod.UIKIT_LIVECHAT_BLOCK_ACTION](
        context: UIKitLivechatBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        // Handle the livechat block interaction
    }
}
```

---

## Typical Workflow

### Handling a Livechat Block Action

```typescript
public async [AppMethod.UIKIT_LIVECHAT_BLOCK_ACTION](
    context: UIKitLivechatBlockInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const interactionData = context.getInteractionData();

    // Access the visitor (not user!)
    const visitor = interactionData.visitor;
    console.log(`Visitor ${visitor.name} (${visitor.token}) clicked action: ${interactionData.actionId}`);

    // Access block info
    const blockId = interactionData.blockId;
    const value = interactionData.value;

    // Access the room
    const room = interactionData.room;
    if (room) {
        console.log(`In room: ${room.id}`);
    }

    // Respond based on the action
    switch (interactionData.actionId) {
        case 'open-ticket':
            return context.getInteractionResponder().successResponse();

        case 'request-callback':
            // Store the request
            const livechatCreator = modify.getCreator().getLivechatCreator();
            // ... create room or take action
            return context.getInteractionResponder().successResponse();

        default:
            return context.getInteractionResponder().errorResponse();
    }
}
```

### Sending a Message with Blocks to the Livechat Widget

```typescript
const messageBuilder = modify.getCreator().startMessage()
    .setRoom(room)
    .setSender(agentUser)
    .addBlocks(
        blockBuilder.createSectionBlock({
            text: blockBuilder.createMarkdownTextObject('How can we help you today?'),
        }),
        blockBuilder.createActionsBlock({
            elements: [
                blockBuilder.createButtonElement({
                    text: blockBuilder.createPlainTextObject('Open a Ticket'),
                    actionId: 'open-ticket',
                    value: 'support',
                }),
                blockBuilder.createButtonElement({
                    text: blockBuilder.createPlainTextObject('Request Callback'),
                    actionId: 'request-callback',
                    value: 'callback',
                }),
            ],
        }),
    );

await modify.getCreator().finish(messageBuilder);
```

---

## Anti-Patterns

- **Do not access `context.getInteractionData().user`** -- use `visitor`, not `user`.
- **Do not implement livechat handlers expecting view submit/close** -- only `BLOCK_ACTION` is supported.
- **Do not confuse container types** -- livechat supports Modal and Message containers only; ContextualBar is not available.
- **Always check `room`** -- `interactionData.room` is optional and may be undefined.
- **The responder is the same class** -- `UIKitInteractionResponder` works for both livechat and regular contexts.
