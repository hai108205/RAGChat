# Handler Interfaces Reference

All event handler interfaces available in the Apps Engine, their `AppMethod` value, trigger event, and handler type categories.

---

## Lifecycle Handlers

| Interface | AppMethod | Trigger |
|---|---|---|
| App `initialize()` | `INITIALIZE` | App startup, configure extensions |
| App `onEnable()` | `ONENABLE` | App enabled by admin |
| App `onDisable()` | `ONDISABLE` | App disabled by admin |
| App `onInstall()` | `ONINSTALL` | App installed |
| App `onUninstall()` | `ONUNINSTALL` | App uninstalled |
| App `onUpdate()` | `ONUPDATE` | App updated to new version |
| App `onPreSettingUpdate()` | `ON_PRE_SETTING_UPDATE` | Before a setting is updated |
| App `onSettingUpdated()` | `ONSETTINGUPDATED` | After a setting is updated |
| App `setStatus()` | `SETSTATUS` | App status changes |

---

## Message Handlers

### Pre-Send (before message sent)

| Interface | AppMethod | Handler Type |
|---|---|---|
| `IPreMessageSentPrevent` | `CHECKPREMESSAGESENTPREVENT` / `EXECUTEPREMESSAGESENTPREVENT` | Prevent -- return `true` to block |
| `IPreMessageSentExtend` | `CHECKPREMESSAGESENTEXTEND` / `EXECUTEPREMESSAGESENTEXTEND` | Extend -- non-destructive enrichment |
| `IPreMessageSentModify` | `CHECKPREMESSAGESENTMODIFY` / `EXECUTEPREMESSAGESENTMODIFY` | Modify -- destructive change |

### Post-Send (after message sent)

| Interface | AppMethod | Description |
|---|---|---|
| `IPostMessageSent` | `CHECKPOSTMESSAGESENT` / `EXECUTEPOSTMESSAGESENT` | After a message is sent to other clients |
| `IPostSystemMessageSent` | `EXECUTEPOSTSYSTEMMESSAGESENT` | After a system message is sent |
| `IPostMessageSentToBot` | `EXECUTEPOSTMESSAGESENTTOBOT` | After a DM is sent to a bot |

### Pre-Delete (before message deleted)

| Interface | AppMethod | Handler Type |
|---|---|---|
| `IPreMessageDeletePrevent` | `CHECKPREMESSAGEDELETEPREVENT` / `EXECUTEPREMESSAGEDELETEPREVENT` | Prevent -- return `true` to block |

### Post-Delete (after message deleted)

| Interface | AppMethod | Description |
|---|---|---|
| `IPostMessageDeleted` | `CHECKPOSTMESSAGEDELETED` / `EXECUTEPOSTMESSAGEDELETED` | After a message is deleted |

### Pre-Update (before message updated)

| Interface | AppMethod | Handler Type |
|---|---|---|
| `IPreMessageUpdatedPrevent` | `CHECKPREMESSAGEUPDATEDPREVENT` / `EXECUTEPREMESSAGEUPDATEDPREVENT` | Prevent -- return `true` to block |
| `IPreMessageUpdatedExtend` | `CHECKPREMESSAGEUPDATEDEXTEND` / `EXECUTEPREMESSAGEUPDATEDEXTEND` | Extend -- non-destructive enrichment |
| `IPreMessageUpdatedModify` | `CHECKPREMESSAGEUPDATEDMODIFY` / `EXECUTEPREMESSAGEUPDATEDMODIFY` | Modify -- destructive change |

### Post-Update (after message updated)

| Interface | AppMethod | Description |
|---|---|---|
| `IPostMessageUpdated` | `CHECKPOSTMESSAGEUPDATED` / `EXECUTEPOSTMESSAGEUPDATED` | After a message is updated |

### Other Message Events

| Interface | AppMethod | Description |
|---|---|---|
| `IPostMessageReacted` | `EXECUTE_POST_MESSAGE_REACTED` | After a message reaction is added/removed |
| `IPostMessageFollowed` | `EXECUTE_POST_MESSAGE_FOLLOWED` | After a message is followed/unfollowed |
| `IPostMessagePinned` | `EXECUTE_POST_MESSAGE_PINNED` | After a message is pinned/unpinned |
| `IPostMessageStarred` | `EXECUTE_POST_MESSAGE_STARRED` | After a message is starred/unstarred |
| `IPostMessageReported` | `EXECUTE_POST_MESSAGE_REPORTED` | After a message is reported |

---

## Room Handlers

### Pre-Create

| Interface | AppMethod | Handler Type |
|---|---|---|
| `IPreRoomCreatePrevent` | `CHECKPREROOMCREATEPREVENT` / `EXECUTEPREROOMCREATEPREVENT` | Prevent -- return `true` to block |
| `IPreRoomCreateExtend` | `CHECKPREROOMCREATEEXTEND` / `EXECUTEPREROOMCREATEEXTEND` | Extend -- non-destructive enrichment |
| `IPreRoomCreateModify` | `CHECKPREROOMCREATEMODIFY` / `EXECUTEPREROOMCREATEMODIFY` | Modify -- destructive change |

### Post-Create

| Interface | AppMethod | Description |
|---|---|---|
| `IPostRoomCreate` | `CHECKPOSTROOMCREATE` / `EXECUTEPOSTROOMCREATE` | After a room is created |

### Pre-Delete

| Interface | AppMethod | Handler Type |
|---|---|---|
| `IPreRoomDeletePrevent` | `CHECKPREROOMDELETEPREVENT` / `EXECUTEPREROOMDELETEPREVENT` | Prevent -- return `true` to block |

### Post-Delete

| Interface | AppMethod | Description |
|---|---|---|
| `IPostRoomDeleted` | `CHECKPOSTROOMDELETED` / `EXECUTEPOSTROOMDELETED` | After a room is deleted |

### Room User Events

| Interface | AppMethod | Description |
|---|---|---|
| `IPreRoomUserJoined` | `EXECUTE_PRE_ROOM_USER_JOINED` | Before a user joins a room. Throw `UserNotAllowedException` to prevent. |
| `IPostRoomUserJoined` | `EXECUTE_POST_ROOM_USER_JOINED` | After a user joins a room |
| `IPreRoomUserLeave` | `EXECUTE_PRE_ROOM_USER_LEAVE` | Before a user leaves a room. Throw `UserNotAllowedException` to prevent. |
| `IPostRoomUserLeave` | `EXECUTE_POST_ROOM_USER_LEAVE` | After a user leaves a room |

---

## User Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IPostUserCreated` | `EXECUTE_POST_USER_CREATED` | After a user is created |
| `IPostUserUpdated` | `EXECUTE_POST_USER_UPDATED` | After a user is updated |
| `IPostUserDeleted` | `EXECUTE_POST_USER_DELETED` | After a user is deleted |
| `IPostUserLoggedIn` | `EXECUTE_POST_USER_LOGGED_IN` | After a user logs in |
| `IPostUserLoggedOut` | `EXECUTE_POST_USER_LOGGED_OUT` | After a user logs out |
| `IPostUserStatusChanged` | `EXECUTE_POST_USER_STATUS_CHANGED` | After user status changes (online, away, busy, offline). Does NOT trigger for custom status changes. |

---

## File Upload Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IPreFileUpload` | `EXECUTE_PRE_FILE_UPLOAD` | Before a file upload completes. Throw `FileUploadNotAllowedException` to prevent. |

---

## Email Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IPreEmailSent` | `EXECUTE_PRE_EMAIL_SENT` | Before an email is sent. Throw an error to prevent sending. Return modified `IEmailDescriptor`. |

---

## External Component Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IPostExternalComponentOpened` | `EXECUTEPOSTEXTERNALCOMPONENTOPENED` | After an external component is opened |
| `IPostExternalComponentClosed` | `EXECUTEPOSTEXTERNALCOMPONENTCLOSED` | After an external component is closed |

---

## Livechat Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IPostLivechatRoomStarted` | `EXECUTE_POST_LIVECHAT_ROOM_STARTED` | After a livechat room starts |
| `IPostLivechatRoomClosed` | `EXECUTE_POST_LIVECHAT_ROOM_CLOSED` | After a livechat room closes |
| `IPreLivechatRoomCreatePrevent` | `EXECUTE_PRE_LIVECHAT_ROOM_CREATE_PREVENT` | Before a livechat room is created (prevent) |
| `IPostLivechatAgentAssigned` | `EXECUTE_POST_LIVECHAT_AGENT_ASSIGNED` | After an agent is assigned |
| `IPostLivechatAgentUnassigned` | `EXECUTE_POST_LIVECHAT_AGENT_UNASSIGNED` | After an agent is unassigned |
| `IPostLivechatRoomTransferred` | `EXECUTE_POST_LIVECHAT_ROOM_TRANSFERRED` | After a room is transferred |
| `IPostLivechatGuestSaved` | `EXECUTE_POST_LIVECHAT_GUEST_SAVED` | After a guest is saved |
| `IPostLivechatRoomSaved` | `EXECUTE_POST_LIVECHAT_ROOM_SAVED` | After a room is saved |
| `IPostLivechatDepartmentDisabled` | `EXECUTE_POST_LIVECHAT_DEPARTMENT_DISABLED` | After a department is disabled |
| `IPostLivechatDepartmentRemoved` | `EXECUTE_POST_LIVECHAT_DEPARTMENT_REMOVED` | After a department is removed |

---

## UI Kit Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IUIKitActionHandler` | `UIKIT_BLOCK_ACTION` | Handle UI Kit block actions |
| `IUIKitViewSubmitHandler` (via `executeViewSubmitHandler`) | `UIKIT_VIEW_SUBMIT` | Handle UI Kit view submissions |
| `IUIKitViewClosedHandler` (via `executeViewClosedHandler`) | `UIKIT_VIEW_CLOSE` | Handle UI Kit view close |
| `IUIKitActionButtonHandler` (via `executeActionButtonHandler`) | `UIKIT_ACTION_BUTTON` | Handle action button clicks |
| `IUIKitLivechatActionHandler` | `UIKIT_LIVECHAT_BLOCK_ACTION` | Handle livechat UI Kit actions |

---

## Video Conference Handlers

| Interface | AppMethod | Description |
|---|---|---|
| `IVideoConfProvider` | `_VIDEOCONF_GENERATE_URL`, `_VIDEOCONF_CUSTOMIZE_URL`, `_VIDEOCONF_IS_CONFIGURED`, `_VIDEOCONF_NEW`, `_VIDEOCONF_CHANGED`, `_VIDEOCONF_USER_JOINED`, `_VIDEOCONF_GET_INFO` | Video conference provider |

---

## Handler Type Categories

| Category | Pattern | Can prevent? | Signature |
|---|---|---|---|
| **Prevent** | `IPre*Prevent` | Yes -- return `true` from execute, or throw exception | `check*` + `execute*` methods |
| **Extend** | `IPre*Extend` | No | `check*` + `execute*` (non-destructive add props) |
| **Modify** | `IPre*Modify` | No | `check*` + `execute*` (destructive change props) |
| **Post** | `IPost*` | No | `check*` + `execute*` (read-only after event) |

Each `IPre*` handler has a `check*` method (optional filter) and an `execute*` method (the actual logic). Each `IPost*` handler follows the same pattern with `checkPost*` and `executePost*`.
