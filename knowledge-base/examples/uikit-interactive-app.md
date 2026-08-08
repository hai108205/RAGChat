# UI Kit Interactive App

## Architecture

A UI Kit interactive app that demonstrates the full interaction lifecycle: building blocks with `BlockBuilder`, sending messages with interactive buttons, implementing `IUIKitInteractionHandler` for block actions and view submissions, opening modals in response to button clicks, handling modal form submission with validation, and using `UIKitInteractionResponder` for typed responses.

The app registers a `/request-review` slash command that posts a review request message with Approve/Reject buttons. When a user clicks a button, a modal opens with a comment form. On submit, the result is posted back to the room and persisted.

**Key concept**: UI Kit follows a request/response model. The App defines blocks. User interactions dispatch incoming interaction data to registered handlers. Handlers inspect `actionId` to determine what happened, then return a response from the responder -- another surface, an error, or a success.

## Folder Structure

```
uikit-interactive-app/
  app.json
  app.ts
  commands/
    RequestReviewCommand.ts
  handlers/
    ReviewInteractionHandler.ts
```

## Flow

1. App registers the slash command and interaction handler in `extendConfiguration()`
2. User types `/request-review "Please review the deployment config"`
3. Executor builds a message with actions block containing Approve/Reject buttons
4. Another user clicks "Approve" -- engine dispatches `executeBlockActionHandler`
5. Handler inspects `actionId === 'approve'` or `actionId === 'reject'`
6. Handler builds an input block (comment text) and opens a modal via `openModalViewResponse()`
7. User fills in the comment and clicks "Submit" -- engine dispatches `executeViewSubmitHandler`
8. Handler reads `view.state`, validates the comment field
9. If validation fails, returns `viewErrorResponse()` with field-level errors
10. If valid, posts a message to the room with the review decision and comment
11. Returns `successResponse()` to close the modal

## Implementation

### app.json

```json
{
    "id": "d3c4e5f6-a7b8-9012-cdef-123456789012",
    "version": "1.0.0",
    "requiredApiVersion": "^2.4.0",
    "iconFile": "icon.png",
    "author": {
        "name": "Your Name",
        "homepage": "https://example.com",
        "support": "https://example.com/support"
    },
    "name": "Review Request",
    "nameSlug": "review-request",
    "classFile": "app.ts",
    "description": "Request and submit code reviews with interactive buttons.",
    "implements": []
}
```

### commands/RequestReviewCommand.ts

```typescript
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import {
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';

export class RequestReviewCommand implements ISlashCommand {
    public command = 'request-review';
    public i18nParamsExample = '"What needs review?"';
    public i18nDescription = 'Request a review with Approve/Reject buttons';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        const description = args.join(' ') || 'No description provided.';

        const appUser = await read.getUserReader().getAppUser();
        const blocks = new BlockBuilder();

        blocks.addSectionBlock({
            text: blocks.newMarkdownTextObject(
                `*Review Request from @${sender.username}*\n${description}`,
            ),
        });

        blocks.addDividerBlock();

        blocks.addContextBlock({
            elements: [
                blocks.newMarkdownTextObject(
                    `:bust_in_silhouette: Requested by *${sender.name || sender.username}* | :clock1: ${new Date().toLocaleString()}`,
                ),
            ],
        });

        blocks.addActionsBlock({
            blockId: 'review-actions',
            elements: [
                blocks.newButtonElement({
                    actionId: 'approve',
                    text: blocks.newPlainTextObject('Approve'),
                    style: ButtonStyle.PRIMARY,
                    value: JSON.stringify({
                        requesterId: sender.id,
                        description,
                        roomId: room.id,
                    }),
                }),
                blocks.newButtonElement({
                    actionId: 'reject',
                    text: blocks.newPlainTextObject('Reject'),
                    style: ButtonStyle.DANGER,
                    value: JSON.stringify({
                        requesterId: sender.id,
                        description,
                        roomId: room.id,
                    }),
                }),
            ],
        });

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setBlocks(blocks);

        await modify.getCreator().finish(builder);
    }
}
```

### handlers/ReviewInteractionHandler.ts

```typescript
import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    BlockBuilder,
    IUIKitInteractionHandler,
    IUIKitResponse,
    UIKitBlockInteractionContext,
    UIKitViewCloseInteractionContext,
    UIKitViewSubmitInteractionContext,
    UIKitActionButtonInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';

interface ReviewData {
    requesterId: string;
    description: string;
    roomId: string;
}

export class ReviewInteractionHandler implements IUIKitInteractionHandler {
    public async executeBlockActionHandler(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const { actionId, user, value } = data;

        if (actionId !== 'approve' && actionId !== 'reject') {
            return context.getInteractionResponder().successResponse();
        }

        let reviewData: ReviewData;
        try {
            reviewData = JSON.parse(value || '{}');
        } catch {
            reviewData = {
                requesterId: '',
                description: '',
                roomId: '',
            };
        }

        const decision = actionId === 'approve' ? 'Approve' : 'Reject';
        const blocks = new BlockBuilder();

        blocks.addSectionBlock({
            text: blocks.newMarkdownTextObject(
                `*${decision} Request*\n${reviewData.description}` +
                `\n\nReviewer: @${user.username}`,
            ),
        });

        blocks.addDividerBlock();

        blocks.addInputBlock({
            blockId: 'comment-block',
            label: blocks.newPlainTextObject('Comment'),
            element: blocks.newPlainTextInputElement({
                actionId: 'review-comment',
                placeholder: blocks.newPlainTextObject(
                    'Add your review comment...',
                ),
                multiline: true,
            }),
            optional: false,
        });

        // Store review context in the modal state for the submit handler
        return context.getInteractionResponder().openModalViewResponse({
            id: 'review-modal',
            title: blocks.newPlainTextObject(`${decision} Review`),
            submit: blocks.newButtonElement({
                actionId: 'submit-review',
                text: blocks.newPlainTextObject(`Submit ${decision}`),
                style:
                    actionId === 'approve'
                        ? ButtonStyle.PRIMARY
                        : ButtonStyle.DANGER,
            }),
            close: blocks.newButtonElement({
                actionId: 'cancel-review',
                text: blocks.newPlainTextObject('Cancel'),
            }),
            blocks: blocks.getBlocks(),
            notifyOnClose: true,
        });
    }

    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const { view, user } = data;

        // Extract the comment from view.state
        const state = view.state as Record<string, Record<string, string>>;
        const comment = state?.['comment-block']?.['review-comment'];

        // Validate
        if (!comment || comment.trim().length === 0) {
            return context.getInteractionResponder().viewErrorResponse({
                viewId: view.id,
                errors: {
                    'review-comment': 'Comment is required.',
                },
            });
        }

        if (comment.trim().length < 10) {
            return context.getInteractionResponder().viewErrorResponse({
                viewId: view.id,
                errors: {
                    'review-comment':
                        'Comment must be at least 10 characters.',
                },
            });
        }

        // Persist the review result
        const reviewRecord = {
            reviewId: `${user.id}-${Date.now()}`,
            submittedBy: user.username,
            submittedAt: new Date().toISOString(),
            comment: comment.trim(),
            decision: view.title?.text?.includes('Approve')
                ? 'approved'
                : 'rejected',
        };

        await persistence.updateByAssociation(
            { userId: user.id, roomId: data.room?.id || '' },
            reviewRecord,
            `review-${reviewRecord.reviewId}`,
            true,
        );

        // Post the result to the room
        const appUser = await read.getUserReader().getAppUser();
        const room = await read.getRoomReader().getById(
            data.room?.id || '',
        );

        if (room) {
            const decisionEmoji =
                reviewRecord.decision === 'approved'
                    ? ':white_check_mark:'
                    : ':x:';
            const builder = modify.getCreator().startMessage()
                .setRoom(room)
                .setSender(appUser)
                .setText(
                    `${decisionEmoji} *Review ${reviewRecord.decision}* by @${reviewRecord.submittedBy}\n` +
                    `> ${reviewRecord.comment}`,
                );

            await modify.getCreator().finish(builder);
        }

        return context.getInteractionResponder().successResponse();
    }

    public async executeViewClosedHandler(
        context: UIKitViewCloseInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();

        // Log that the review modal was dismissed without submitting
        if (data.isCleared) {
            // Clean up any temporary data if needed
        }

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

### app.ts

```typescript
import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { UIKitInteractionType } from '@rocket.chat/apps-engine/definition/uikit';

import { RequestReviewCommand } from './commands/RequestReviewCommand';
import { ReviewInteractionHandler } from './handlers/ReviewInteractionHandler';

export class ReviewRequestApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        // Register the slash command
        await configuration.slashCommands.provideSlashCommand(
            new RequestReviewCommand(),
        );

        // Register the interaction handler for block actions
        await configuration.ui.registerInteractionHandler(
            UIKitInteractionType.MODAL_OPEN,
            new ReviewInteractionHandler(),
        );
    }
}
```

## Best Practices

- **Register one handler per `UIKitInteractionType`**. Each handler class receives all interactions of that type. Use `actionId` to branch within the handler.
- **Use `value` on button elements to pass context**. The `value` string is available in `executeBlockActionHandler` via `data.value`. Serialize JSON to carry structured data like requester IDs, room IDs, and descriptions.
- **Always use `blockId` on input blocks**. Without it, `view.state` uses an auto-generated key, making value extraction fragile.
- **Set `actionId` on every element**. It is the primary discriminator in your handler. Naming convention: kebab-case describing the action (e.g., `approve`, `submit-review`).
- **Use `viewErrorResponse()` for validation failures**. It renders field-level error messages inline on the form. The `errors` object keys must match the element's `actionId`, not the block's `blockId`.
- **Set `notifyOnClose: true`** on modals when you need to react to dismissal. The `executeViewClosedHandler` fires, letting you clean up temporary state or log user behavior.
- **Use `context.getInteractionResponder()` for all responses**. The responder auto-fills `appId`, `triggerId`, `type`, and generates UUIDs. Never construct raw response objects.
- **The interaction handler implements four methods**. Implement all of them, even if only `executeBlockActionHandler` and `executeViewSubmitHandler` have real logic. Return `successResponse()` for unused methods.

## Related Topics

- [UI Kit Overview](../uikit/uikit-overview.md)
- [UI Kit Blocks](../uikit/uikit-blocks-overview.md)
- [UI Kit Surfaces](../uikit/uikit-surfaces.md)
- [Slash Command Definition](../commands/slash-command-definition.md)
- [IPersistence Accessor](../accessors/i-persistence-accessor.md)
- [App Configuration](../app/app-configuration.md)
