# Topic Index

## Purpose

This index provides a structured overview of every document in the Rocket.Chat App-Engine SDK Knowledge Base. Use it to quickly find the topic you need.

---

## App

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [App Lifecycle](./app/app-lifecycle.md) | Constructor, initialize, enable/disable, install/uninstall/update | `App`, `AppStatus`, `AppStatusUtils` |
| [App Information & Metadata](./app/app-info-metadata.md) | IAppInfo, IAppAuthorInfo, App identity and manifest | `IApp`, `IAppInfo`, `IAppAuthorInfo` |
| [App Permissions](./app/app-permissions.md) | Permission system, declaring required permissions | `AppPermissions`, `IPermission` |
| [App Configuration](./app/app-configuration.md) | IConfigurationExtend, IConfigurationModify, feature registration | `IConfigurationExtend`, `IConfigurationModify` |
| [App Accessors](./app/app-accessors.md) | IAppAccessors, how accessors are injected | `IAppAccessors` |
| [App Logging](./app/app-logging.md) | ILogger, structured logging | `ILogger`, `ILogEntry` |

---

## Accessors

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [IRead Accessor](./accessors/i-read-accessor.md) | Gateway to all read-only operations (15 sub-readers) | `IRead` |
| [IModify Accessor](./accessors/i-modify-accessor.md) | Gateway to all write operations (10 sub-modifiers) | `IModify` |
| [IHttp Accessor](./accessors/i-http-accessor.md) | HTTP client for external API calls | `IHttp`, `IHttpRequest`, `IHttpResponse`, `HttpStatusCode` |
| [IPersistence Accessor](./accessors/i-persistence-accessor.md) | CRUD data storage with association support | `IPersistence` |
| [IPersistenceRead Accessor](./accessors/i-persistence-read.md) | Reading stored persistent data | `IPersistenceRead`, `IPersistenceItem` |
| [IEnvironmentRead Accessor](./accessors/i-environment-read.md) | Reading app settings, server settings, environment variables | `IEnvironmentRead`, `ISettingRead`, `IServerSettingRead` |
| [Message Reader](./accessors/message-reader.md) | Reading messages from rooms | `IMessageRead` |
| [Message Builder](./accessors/message-builder.md) | Constructing and sending messages | `IMessageBuilder` |
| [Room Reader](./accessors/room-reader.md) | Reading room metadata and membership | `IRoomRead` |
| [Room Builder](./accessors/room-builder.md) | Creating rooms and discussions | `IRoomBuilder`, `IDiscussionBuilder` |
| [User Reader](./accessors/user-reader.md) | Reading user profiles | `IUserRead` |
| [User Builder](./accessors/user-builder.md) | Constructing user creation payloads | `IUserBuilder` |
| [Modify Creator](./accessors/modify-creator.md) | Creating messages, rooms, users, livechat | `IModifyCreator` |
| [Modify Updater](./accessors/modify-updater.md) | Updating messages, users, rooms | `IModifyUpdater` |
| [Modify Deleter](./accessors/modify-deleter.md) | Deleting messages, users | `IModifyDeleter` |
| [Modify Extender](./accessors/modify-extender.md) | Extending/transforming messages and rooms | `IModifyExtender` |

---

## Messages

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Message Structure](./messages/message-structure.md) | IMessage interface, MessageType enum | `IMessage`, `MessageType` |
| [Message Attachments](./messages/message-attachments.md) | Rich attachments: cards, images, fields | `IMessageAttachment`, `IMessageAttachmentField` |
| [Message Files](./messages/message-files.md) | File uploads in messages | `IMessageFile` |
| [Message Reactions](./messages/message-reactions.md) | Emoji reaction handling | `IMessageReactions` |
| [Message Actions](./messages/message-actions.md) | Message action buttons | `IMessageAction` |
| [Message Event Handlers](./messages/message-handlers.md) | Pre/Post message sent, updated, deleted, reacted, pinned, starred, reported | `IPreMessageSentPrevent`, `IPostMessageSent`, etc. |

---

## Rooms

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Room Structure](./rooms/room-structure.md) | IRoom interface, RoomType enum | `IRoom`, `RoomType` |
| [Room Event Handlers](./rooms/room-handlers.md) | Pre/Post room create, delete, user join/leave | `IPreRoomCreatePrevent`, `IPostRoomCreate`, etc. |
| [Room Queries](./rooms/room-queries.md) | Querying messages and members in rooms | `IGetMessagesOptions` |

---

## Users

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [User Structure](./users/user-structure.md) | IUser interface, UserType, UserStatusConnection | `IUser`, `UserType`, `UserStatusConnection` |
| [User Emails & Settings](./users/user-emails-settings.md) | IUserEmail, IUserSettings | `IUserEmail`, `IUserSettings` |
| [User Event Handlers](./users/user-handlers.md) | Post user created, updated, deleted, login, logout, status | `IPostUserCreated`, `IPostUserUpdated`, etc. |

---

## Settings

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Setting Definition](./settings/setting-definition.md) | ISetting, SettingType enum, select values | `ISetting`, `SettingType`, `ISettingSelectValue` |
| [Setting Updates](./settings/setting-updates.md) | onSettingUpdated, onPreSettingUpdate | `ISettingUpdateContext` |

---

## Slash Commands

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Slash Command Definition](./commands/slash-command-definition.md) | ISlashCommand interface, registration | `ISlashCommand` |
| [Slash Command Preview](./commands/slash-command-preview.md) | ISlashCommandPreview, preview items | `ISlashCommandPreview`, `ISlashCommandPreviewItem` |
| [Slash Command Context](./commands/slash-command-context.md) | SlashCommandContext class | `SlashCommandContext` |

---

## API Endpoints

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [API Definition](./api/api-definition.md) | IApi, ApiVisibility, ApiSecurity | `IApi`, `ApiVisibility`, `ApiSecurity` |
| [API Endpoint](./api/api-endpoint.md) | IApiEndpoint, IApiEndpointInfo | `IApiEndpoint`, `IApiEndpointInfo` |
| [API Request & Response](./api/api-request-response.md) | IApiRequest, IApiResponse | `IApiRequest`, `IApiResponse` |
| [API Examples](./api/api-examples.md) | IApiExample, example decorator | `IApiExample` |

---

## UI Kit

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [UI Kit Overview](./uikit/uikit-overview.md) | UI Kit concepts, interaction types, incoming interactions | `UIKitInteractionContext`, interaction types |
| [UI Kit Surfaces](./uikit/uikit-surfaces.md) | Modal, Home, Contextual Bar surfaces | `IUIKitSurface`, `UIKitSurfaceType` |
| [UI Kit Blocks](./uikit/uikit-blocks-overview.md) | Block types: section, image, divider, actions, context, input, conditional | `IBlock`, `ISectionBlock`, `IActionsBlock`, etc. |
| [Block Builder](./uikit/uikit-block-builder.md) | BlockBuilder fluent API | `BlockBuilder` |
| [UI Kit Elements](./uikit/uikit-elements.md) | Button, image, overflow menu, text input, select, multi-select | `IButtonElement`, `ISelectElement`, etc. |
| [Text Objects](./uikit/uikit-text-objects.md) | Plain text and markdown text objects | `ITextObject`, `TextObjectType` |
| [Interaction Handler](./uikit/uikit-interaction-handler.md) | Block action, view submit/close, action button handlers | `IUIKitInteractionHandler` |
| [Action Buttons](./uikit/uikit-action-buttons.md) | UIActionButtonContext, registering action buttons | `UIActionButtonContext`, `IUIActionButtonDescriptor` |
| [Modals](./uikit/uikit-modals.md) | Opening, updating, closing modals | `UIKitInteractionResponder` |
| [UI Kit Errors](./uikit/uikit-errors.md) | Form validation errors | `IUIKitErrorInteraction` |
| [UI Kit Livechat](./uikit/uikit-livechat.md) | Livechat-specific UI Kit interactions | `IUIKitLivechatInteractionHandler`, `UIKitLivechatBlockInteractionContext` |

---

## Scheduler

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Scheduler Processors](./scheduler/scheduler-processors.md) | IProcessor, startup settings, job context | `IProcessor`, `IJobContext`, `StartupSetting` |
| [Scheduler Jobs](./scheduler/scheduler-jobs.md) | One-time and recurring job scheduling | `IOnetimeSchedule`, `IRecurringSchedule`, `ISchedulerModify` |

---

## Persistence

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Persistence Guide](./persistence/persistence-guide.md) | Data storage with associations, CRUD patterns | `IPersistence`, `RocketChatAssociationRecord`, `RocketChatAssociationModel` |

---

## HTTP

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [HTTP Requests](./http/http-requests.md) | Making external API calls, security, error handling | `IHttp`, `IHttpRequest`, `IHttpResponse` |

---

## OAuth2

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [OAuth2 Client](./oauth/oauth2-client.md) | IOAuth2Client, createOAuth2Client factory | `IOAuth2Client`, `OAuth2Client` |
| [OAuth2 Setup Guide](./oauth/oauth2-setup-guide.md) | OAuth2 setup workflow, IAuthData, token lifecycle | `IOAuth2ClientOptions`, `IAuthData` |

---

## Uploads

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Upload Structure](./uploads/upload-structure.md) | IUpload, IUploadDescriptor, StoreType | `IUpload`, `IUploadDescriptor`, `StoreType` |
| [Upload Handlers](./uploads/upload-handlers.md) | Pre-file-upload interception | `IPreFileUpload`, `IFileUploadContext` |

---

## Livechat

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Livechat Visitor](./livechat/livechat-visitor.md) | IVisitor, visitor identification | `IVisitor`, `IVisitorExternalIdentifier` |
| [Livechat Room](./livechat/livechat-room.md) | ILivechatRoom, OmnichannelSource | `ILivechatRoom`, `OmnichannelSourceType` |
| [Livechat Message](./livechat/livechat-message.md) | ILivechatMessage | `ILivechatMessage` |
| [Livechat Department](./livechat/livechat-department.md) | IDepartment | `IDepartment` |
| [Livechat Event Handlers](./livechat/livechat-event-handlers.md) | Post livechat event handlers | `IPostLivechatRoomStarted`, `IPostLivechatRoomClosed`, etc. |
| [Livechat Contacts](./livechat/livechat-contacts.md) | ILivechatContact, IContactRead, IContactCreator | `ILivechatContact`, `IContactRead` |
| [Livechat Reader & Creator](./livechat/livechat-reader-creator.md) | ILivechatRead, ILivechatCreator | `ILivechatRead`, `ILivechatCreator` |
| [Livechat Updater](./livechat/livechat-updater.md) | ILivechatUpdater, transfer data | `ILivechatUpdater`, `ILivechatTransferData` |

---

## Video Conference

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Video Conference Provider](./video/video-conf-provider.md) | IVideoConfProvider, VideoConfData | `IVideoConfProvider`, `VideoConfData` |
| [Video Conference Builder](./video/video-conf-builder.md) | IVideoConferenceBuilder | `IVideoConferenceBuilder` |

---

## Federation

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Federation](./federation/federation.md) | FederationLookup type | `FederationLookup` |

---

## Utilities

| Document | Description | Key Interfaces |
|----------|-------------|----------------|
| [Email Sending](./utilities/email-sending.md) | IEmail, IEmailDescriptor, pre-email-sent handler | `IEmail`, `IEmailDescriptor` |
| [External Components](./utilities/external-components.md) | IExternalComponent, registration, state | `IExternalComponent`, `ExternalComponentLocation` |
| [Outbound Communication](./utilities/outbound-communication.md) | IOutboundCommsProvider | `IOutboundCommsProvider` |
| [Cloud Workspace](./utilities/cloud-workspace.md) | ICloudWorkspaceRead, workspace tokens | `ICloudWorkspaceRead` |
| [Assets](./utilities/assets.md) | IAsset, IAssetProvider | `IAsset`, `IAssetProvider` |
| [Exception Handling](./utilities/exception-handling.md) | All exception classes | `AppsEngineException`, `FileUploadNotAllowedException`, etc. |
| [Roles](./utilities/roles.md) | IRole, IRoleRead | `IRole`, `IRoleRead` |
| [Moderation](./utilities/moderation.md) | IModerationModify | `IModerationModify` |
| [Notifications](./utilities/notifications.md) | INotifier, sending notifications | `INotifier` |

---

## Examples

| Document | Description | Demonstrates |
|----------|-------------|-------------|
| [Hello World App](./examples/hello-world-app.md) | Minimal App skeleton | constructor, initialize, logging |
| [Slash Command App](./examples/slash-command-app.md) | Full slash command example | ISlashCommand, message sending, IRead/IModify |
| [API Endpoint App](./examples/api-endpoint-app.md) | REST API endpoint example | IApi, IApiEndpoint, GET/POST, JSON responses |
| [UI Kit Interactive App](./examples/uikit-interactive-app.md) | Modal with block actions | BlockBuilder, IUIKitInteractionHandler, UIKitInteractionResponder |
| [Scheduled Task App](./examples/scheduled-task-app.md) | Scheduled job processor | IProcessor, IOnetimeSchedule, IRecurringSchedule |

---

## Reference

| Document | Description |
|----------|-------------|
| [Accessor Quick Reference](./reference/accessor-quick-ref.md) | All accessor interfaces at a glance |
| [Handler Interfaces](./reference/handler-interfaces.md) | All event handler interfaces |
| [Setting Types](./reference/setting-types.md) | SettingType reference table |
| [AppMethod Map](./reference/app-method-map.md) | AppMethod enum full reference |

---

## Related Topics

- [README](./README.md) — Knowledge Base overview and learning roadmap
- [App Lifecycle](./app/app-lifecycle.md) — Start here if you're new to the SDK
