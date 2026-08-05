# AppMethod Enum Reference

Complete `AppMethod` enum from `@rocket.chat/apps-engine/definition/metadata/AppMethod.ts`.

---

## Lifecycle Methods

| Enum Value | String | Description |
|---|---|---|
| `INITIALIZE` | `'initialize'` | App startup, register extensions |
| `ONENABLE` | `'onEnable'` | App enabled |
| `ONDISABLE` | `'onDisable'` | App disabled |
| `ONINSTALL` | `'onInstall'` | App installed |
| `ONUNINSTALL` | `'onUninstall'` | App uninstalled |
| `ONUPDATE` | `'onUpdate'` | App updated |
| `ON_PRE_SETTING_UPDATE` | `'onPreSettingUpdate'` | Before setting update |
| `ONSETTINGUPDATED` | `'onSettingUpdated'` | After setting updated |
| `SETSTATUS` | `'setStatus'` | App status changes |

---

## Message Methods

| Enum Value | String | Handler Category |
|---|---|---|
| `CHECKPREMESSAGESENTPREVENT` | `'checkPreMessageSentPrevent'` | Pre-send prevent |
| `EXECUTEPREMESSAGESENTPREVENT` | `'executePreMessageSentPrevent'` | Pre-send prevent |
| `CHECKPREMESSAGESENTEXTEND` | `'checkPreMessageSentExtend'` | Pre-send extend |
| `EXECUTEPREMESSAGESENTEXTEND` | `'executePreMessageSentExtend'` | Pre-send extend |
| `CHECKPREMESSAGESENTMODIFY` | `'checkPreMessageSentModify'` | Pre-send modify |
| `EXECUTEPREMESSAGESENTMODIFY` | `'executePreMessageSentModify'` | Pre-send modify |
| `CHECKPOSTMESSAGESENT` | `'checkPostMessageSent'` | Post-send |
| `EXECUTEPOSTMESSAGESENT` | `'executePostMessageSent'` | Post-send |
| `EXECUTEPOSTSYSTEMMESSAGESENT` | `'executePostSystemMessageSent'` | Post-system message |
| `EXECUTEPOSTMESSAGESENTTOBOT` | `'executePostMessageSentToBot'` | Post-DM to bot |
| `CHECKPREMESSAGEDELETEPREVENT` | `'checkPreMessageDeletePrevent'` | Pre-delete prevent |
| `EXECUTEPREMESSAGEDELETEPREVENT` | `'executePreMessageDeletePrevent'` | Pre-delete prevent |
| `CHECKPOSTMESSAGEDELETED` | `'checkPostMessageDeleted'` | Post-delete |
| `EXECUTEPOSTMESSAGEDELETED` | `'executePostMessageDeleted'` | Post-delete |
| `CHECKPREMESSAGEUPDATEDPREVENT` | `'checkPreMessageUpdatedPrevent'` | Pre-update prevent |
| `EXECUTEPREMESSAGEUPDATEDPREVENT` | `'executePreMessageUpdatedPrevent'` | Pre-update prevent |
| `CHECKPREMESSAGEUPDATEDEXTEND` | `'checkPreMessageUpdatedExtend'` | Pre-update extend |
| `EXECUTEPREMESSAGEUPDATEDEXTEND` | `'executePreMessageUpdatedExtend'` | Pre-update extend |
| `CHECKPREMESSAGEUPDATEDMODIFY` | `'checkPreMessageUpdatedModify'` | Pre-update modify |
| `EXECUTEPREMESSAGEUPDATEDMODIFY` | `'executePreMessageUpdatedModify'` | Pre-update modify |
| `CHECKPOSTMESSAGEUPDATED` | `'checkPostMessageUpdated'` | Post-update |
| `EXECUTEPOSTMESSAGEUPDATED` | `'executePostMessageUpdated'` | Post-update |
| `EXECUTE_POST_MESSAGE_REACTED` | `'executePostMessageReacted'` | Post-reaction |
| `EXECUTE_POST_MESSAGE_FOLLOWED` | `'executePostMessageFollowed'` | Post-follow |
| `EXECUTE_POST_MESSAGE_PINNED` | `'executePostMessagePinned'` | Post-pin |
| `EXECUTE_POST_MESSAGE_STARRED` | `'executePostMessageStarred'` | Post-star |
| `EXECUTE_POST_MESSAGE_REPORTED` | `'executePostMessageReported'` | Post-report |

---

## Room Methods

| Enum Value | String | Handler Category |
|---|---|---|
| `CHECKPREROOMCREATEPREVENT` | `'checkPreRoomCreatePrevent'` | Pre-create prevent |
| `EXECUTEPREROOMCREATEPREVENT` | `'executePreRoomCreatePrevent'` | Pre-create prevent |
| `CHECKPREROOMCREATEEXTEND` | `'checkPreRoomCreateExtend'` | Pre-create extend |
| `EXECUTEPREROOMCREATEEXTEND` | `'executePreRoomCreateExtend'` | Pre-create extend |
| `CHECKPREROOMCREATEMODIFY` | `'checkPreRoomCreateModify'` | Pre-create modify |
| `EXECUTEPREROOMCREATEMODIFY` | `'executePreRoomCreateModify'` | Pre-create modify |
| `CHECKPOSTROOMCREATE` | `'checkPostRoomCreate'` | Post-create |
| `EXECUTEPOSTROOMCREATE` | `'executePostRoomCreate'` | Post-create |
| `CHECKPREROOMDELETEPREVENT` | `'checkPreRoomDeletePrevent'` | Pre-delete prevent |
| `EXECUTEPREROOMDELETEPREVENT` | `'executePreRoomDeletePrevent'` | Pre-delete prevent |
| `CHECKPOSTROOMDELETED` | `'checkPostRoomDeleted'` | Post-delete |
| `EXECUTEPOSTROOMDELETED` | `'executePostRoomDeleted'` | Post-delete |
| `EXECUTE_PRE_ROOM_USER_JOINED` | `'executePreRoomUserJoined'` | Pre-user-joined |
| `EXECUTE_POST_ROOM_USER_JOINED` | `'executePostRoomUserJoined'` | Post-user-joined |
| `EXECUTE_PRE_ROOM_USER_LEAVE` | `'executePreRoomUserLeave'` | Pre-user-leave |
| `EXECUTE_POST_ROOM_USER_LEAVE` | `'executePostRoomUserLeave'` | Post-user-leave |

---

## Livechat Methods

| Enum Value | String | Description |
|---|---|---|
| `EXECUTE_POST_LIVECHAT_ROOM_STARTED` | `'executePostLivechatRoomStarted'` | After livechat room starts |
| `EXECUTE_PRE_LIVECHAT_ROOM_CREATE_PREVENT` | `'executeLivechatRoomCreatePrevent'` | Before livechat room created |
| `EXECUTE_POST_LIVECHAT_ROOM_CLOSED` | `'executePostLivechatRoomClosed'` | After livechat room closes |
| `EXECUTE_LIVECHAT_ROOM_CLOSED_HANDLER` | `'executeLivechatRoomClosedHandler'` | **Deprecated** -- use `EXECUTE_POST_LIVECHAT_ROOM_CLOSED` |
| `EXECUTE_POST_LIVECHAT_AGENT_ASSIGNED` | `'executePostLivechatAgentAssigned'` | After agent assigned |
| `EXECUTE_POST_LIVECHAT_AGENT_UNASSIGNED` | `'executePostLivechatAgentUnassigned'` | After agent unassigned |
| `EXECUTE_POST_LIVECHAT_ROOM_TRANSFERRED` | `'executePostLivechatRoomTransferred'` | After room transferred |
| `EXECUTE_POST_LIVECHAT_GUEST_SAVED` | `'executePostLivechatGuestSaved'` | After guest saved |
| `EXECUTE_POST_LIVECHAT_ROOM_SAVED` | `'executePostLivechatRoomSaved'` | After room saved |
| `EXECUTE_POST_LIVECHAT_DEPARTMENT_DISABLED` | `'executePostLivechatDepartmentDisabled'` | After department disabled |
| `EXECUTE_POST_LIVECHAT_DEPARTMENT_REMOVED` | `'executePostLivechatDepartmentRemoved'` | After department removed |

---

## User Methods

| Enum Value | String | Description |
|---|---|---|
| `EXECUTE_POST_USER_CREATED` | `'executePostUserCreated'` | After user created |
| `EXECUTE_POST_USER_UPDATED` | `'executePostUserUpdated'` | After user updated |
| `EXECUTE_POST_USER_DELETED` | `'executePostUserDeleted'` | After user deleted |
| `EXECUTE_POST_USER_LOGGED_IN` | `'executePostUserLoggedIn'` | After user logs in |
| `EXECUTE_POST_USER_LOGGED_OUT` | `'executePostUserLoggedOut'` | After user logs out |
| `EXECUTE_POST_USER_STATUS_CHANGED` | `'executePostUserStatusChanged'` | After user status changed |

---

## Other Methods

| Enum Value | String | Description |
|---|---|---|
| `EXECUTE_PRE_FILE_UPLOAD` | `'executePreFileUpload'` | Before file upload |
| `EXECUTE_PRE_EMAIL_SENT` | `'executePreEmailSent'` | Before email sent |
| `EXECUTEPOSTEXTERNALCOMPONENTOPENED` | `'executePostExternalComponentOpened'` | After ext component opened |
| `EXECUTEPOSTEXTERNALCOMPONENTCLOSED` | `'executePostExternalComponentClosed'` | After ext component closed |

---

## UI Kit Methods

| Enum Value | String | Description |
|---|---|---|
| `UIKIT_BLOCK_ACTION` | `'executeBlockActionHandler'` | Block action handler |
| `UIKIT_VIEW_SUBMIT` | `'executeViewSubmitHandler'` | View submit handler |
| `UIKIT_VIEW_CLOSE` | `'executeViewClosedHandler'` | View close handler |
| `UIKIT_ACTION_BUTTON` | `'executeActionButtonHandler'` | Action button handler |
| `UIKIT_LIVECHAT_BLOCK_ACTION` | `'executeLivechatBlockActionHandler'` | Livechat block action |

---

## Video Conference Methods

| Enum Value | String | Description |
|---|---|---|
| `_VIDEOCONF_GENERATE_URL` | `'generateUrl'` | Generate video conf URL |
| `_VIDEOCONF_CUSTOMIZE_URL` | `'customizeUrl'` | Customize video conf URL |
| `_VIDEOCONF_IS_CONFIGURED` | `'isFullyConfigured'` | Check if provider configured |
| `_VIDEOCONF_NEW` | `'onNewVideoConference'` | New video conference created |
| `_VIDEOCONF_CHANGED` | `'onVideoConferenceChanged'` | Video conference changed |
| `_VIDEOCONF_USER_JOINED` | `'onUserJoin'` | User joined video conference |
| `_VIDEOCONF_GET_INFO` | `'getVideoConferenceInfo'` | Get video conference info |

---

## Outbound Communication Methods

| Enum Value | String | Description |
|---|---|---|
| `_OUTBOUND_GET_PROVIDER_METADATA` | `'getProviderMetadata'` | Get outbound provider metadata |
| `_OUTBOUND_SEND_MESSAGE` | `'sendOutboundMessage'` | Send outbound message |

---

## Internal Methods

| Enum Value | String | Description |
|---|---|---|
| `_API_EXECUTOR` | `'apiExecutor'` | API endpoint executor |
| `_CONSTRUCTOR` | `'constructor'` | App constructor |
| `_COMMAND_EXECUTOR` | `'executor'` | Slash command executor |
| `_COMMAND_PREVIEWER` | `'previewer'` | Slash command previewer |
| `_COMMAND_PREVIEW_EXECUTOR` | `'executePreviewItem'` | Slash command preview item executor |
| `_JOB_PROCESSOR` | `'jobProcessor'` | Scheduled job processor |
| `RUNTIME_RESTART` | `'runtime:restart'` | Runtime restart signal |
| `RUNTIME_UNCAUGHT_EXCEPTION` | `'runtime:uncaughtException'` | Uncaught exception handler |
| `RUNTIME_UNHANDLED_REJECTION` | `'runtime:unhandledRejection'` | Unhandled rejection handler |
