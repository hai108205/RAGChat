# Accessor Quick Reference

How to obtain each accessor interface, the aggregator it lives under, and its return type.

---

## Top-Level Accessors (from `IAppAccessors`)

| Accessor | How to obtain | Purpose |
|---|---|---|
| `IRead` | `app.getAccessors().reader` | Read-only access to environment, users, rooms, messages, persistence, roles |
| `IHttp` | `app.getAccessors().http` | HTTP client for outbound requests |
| `IEnvironmentRead` | `app.getAccessors().environmentReader` | App settings, server settings, env variables (read) |
| `IEnvironmentWrite` | `app.getAccessors().environmentWriter` | Environment-level writes |

---

## From `IConfigurationExtend` (during `initialize()`)

| Accessor | How to obtain | Purpose |
|---|---|---|
| `IHttpExtend` | `configuration.http` | Default headers, pre-request/response handlers |
| `ISettingsExtend` | `configuration.settings` | Declare app settings |
| `ISlashCommandsExtend` | `configuration.slashCommands` | Register slash commands |
| `IApiExtend` | `configuration.api` | Register API endpoints |
| `IExternalComponentsExtend` | `configuration.externalComponents` | Register external components |
| `ISchedulerExtend` | `configuration.scheduler` | Register job processors |
| `IUIExtend` | `configuration.ui` | Register UI elements (buttons, etc.) |
| `IVideoConfProvidersExtend` | `configuration.videoConfProviders` | Register video conf providers |
| `IOutboundCommunicationProviderExtend` | `configuration.outboundCommunication` | Register outbound comms providers |

---

## From `IConfigurationModify` (during `onEnable()`)

| Accessor | How to obtain | Purpose |
|---|---|---|
| `IServerSettingsModify` | `configurationModify.serverSettings` | Modify Rocket.Chat server settings |
| `ISlashCommandsModify` | `configurationModify.slashCommands` | Modify slash commands |
| `ISchedulerModify` | `configurationModify.scheduler` | Schedule/cancel jobs |

---

## From `IRead` aggregator

| Accessor | How to obtain | Return type |
|---|---|---|
| `IEnvironmentRead` | `read.getEnvironmentReader()` | App settings, server settings, env vars |
| `IThreadRead` | `read.getThreadReader()` | Thread reading |
| `IMessageRead` | `read.getMessageReader()` | Message reading |
| `IPersistenceRead` | `read.getPersistenceReader()` | Read persistent storage (read-only) |
| `IRoomRead` | `read.getRoomReader()` | Room reading |
| `IUserRead` | `read.getUserReader()` | User reading |
| `INotifier` | `read.getNotifier()` | Send notifications, typing indicators |
| `ILivechatRead` | `read.getLivechatReader()` | Livechat/omnichannel reading |
| `IUploadRead` | `read.getUploadReader()` | Upload reading |
| `ICloudWorkspaceRead` | `read.getCloudWorkspaceReader()` | Cloud workspace info |
| `IVideoConferenceRead` | `read.getVideoConferenceReader()` | Video conference reading |
| `IOAuthAppsReader` | `read.getOAuthAppsReader()` | OAuth app reading |
| `IRoleRead` | `read.getRoleReader()` | Role reading |
| `IContactRead` | `read.getContactReader()` | Livechat contact reading |
| `IExperimentalRead` | `read.getExperimentalReader()` | Experimental features |

---

## From `IModify` aggregator

| Accessor | How to obtain | Return type | Purpose |
|---|---|---|---|
| `IModifyCreator` | `modify.getCreator()` | Creator | Build and create messages, rooms, users, discussions, uploads, emails, video conferences, contacts |
| `IModifyDeleter` | `modify.getDeleter()` | Deleter | Delete rooms, messages, users; remove users from rooms |
| `IModifyExtender` | `modify.getExtender()` | Extender | Non-destructive extension of messages, rooms, video conferences |
| `IModifyUpdater` | `modify.getUpdater()` | Updater | Destructive modification of messages, rooms, users, livechat |
| `INotifier` | `modify.getNotifier()` | Notifier | Send notifications, typing indicators |
| `IUIController` | `modify.getUiController()` | UI Controller | Open/update modal and contextual bar views |
| `ISchedulerModify` | `modify.getScheduler()` | Scheduler | Schedule and cancel jobs |
| `IOAuthAppsModify` | `modify.getOAuthAppsModifier()` | OAuth modifier | Modify OAuth apps |
| `IModerationModify` | `modify.getModerationModifier()` | Moderation | Report messages, dismiss reports |

---

## Directly Injected in Handler Methods

These are passed as parameters to handler `execute*` methods (not accessed via aggregators):

| Accessor parameter | Available in |
|---|---|
| `IRead` | All handler `execute*` methods |
| `IHttp` | All handler `execute*` methods |
| `IPersistence` | All handler `execute*` methods |
| `IModify` | Post-event handlers (`IPostMessageSent`, `IPostRoomCreate`, `IPostMessageDeleted`, etc.) |
| `IMessageBuilder` | `IPreMessageSentModify`, `IPreMessageUpdatedModify` |
| `IMessageExtender` | `IPreMessageSentExtend`, `IPreMessageUpdatedExtend` |
| `IRoomBuilder` | `IPreRoomCreateModify` |
| `IRoomExtender` | `IPreRoomCreateExtend` |
