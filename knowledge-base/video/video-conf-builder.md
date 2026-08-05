# Video Conference Builder & Extender

## Purpose

`IVideoConferenceBuilder` and `IVideoConferenceExtender` are the two accessors for creating and extending video conference objects in Rocket.Chat apps. The builder creates new conference objects (from scratch or from partial data). The extender modifies existing conferences.

---

## Overview

Rocket.Chat apps create video conferences programmatically through `IModifyCreator.startVideoConference()`, which returns an `IVideoConferenceBuilder`. The builder collects data via chained setters and is finalized with `IModifyCreator.finish()`.

Existing conferences are extended via `IModifyExtender.extendVideoConference(id)`, which returns an `IVideoConferenceExtender`. Changes are finalized with `IModifyExtender.finish()`.

---

## When To Use

- Creating a video conference from a slash command or event handler
- Programmatically setting provider-specific data on a conference
- Changing conference status (e.g., marking as ended)
- Adding users to an ongoing conference
- Setting a discussion room for conference chat

---

## IVideoConferenceBuilder

```typescript
export interface IVideoConferenceBuilder {
    kind: RocketChatAssociationModel.VIDEO_CONFERENCE;

    setData(call: Partial<AppVideoConference>): IVideoConferenceBuilder;
    setRoomId(rid: string): IVideoConferenceBuilder;
    getRoomId(): string;
    setCreatedBy(userId: string): IVideoConferenceBuilder;
    getCreatedBy(): string;
    setProviderName(name: string): IVideoConferenceBuilder;
    getProviderName(): string;
    setProviderData(data: Record<string, any>): IVideoConferenceBuilder;
    getProviderData(): Record<string, any>;
    setTitle(name: string): IVideoConferenceBuilder;
    getTitle(): string;
    setDiscussionRid(rid: string | undefined): IVideoConferenceBuilder;
    getDiscussionRid(): string | undefined;
    getVideoConference(): AppVideoConference;
}
```

### Methods

| Method | Description |
|--------|-------------|
| `setData(call)` | Set multiple fields at once from a partial `AppVideoConference` |
| `setRoomId(rid)` | Set the room where the call takes place |
| `getRoomId()` | Get the current room ID |
| `setCreatedBy(userId)` | Set the user who created the call |
| `getCreatedBy()` | Get the creator user ID |
| `setProviderName(name)` | Set the video conf provider name (must match a registered provider) |
| `getProviderName()` | Get the provider name |
| `setProviderData(data)` | Set arbitrary provider-specific data (passed to `generateUrl` and `customizeUrl`) |
| `getProviderData()` | Get the provider data |
| `setTitle(name)` | Set the conference title |
| `getTitle()` | Get the title |
| `setDiscussionRid(rid)` | Set (or clear) the discussion room ID linked to this conference |
| `getDiscussionRid()` | Get the discussion room ID |
| `getVideoConference()` | Get the built `AppVideoConference` object (immutable snapshot) |

### AppVideoConference

```typescript
export type AppVideoConference = Pick<IGroupVideoConference, 'rid' | 'providerName' | 'providerData' | 'title' | 'discussionRid'> & {
    createdBy: IGroupVideoConference['createdBy']['_id'];
};
```

The type produced by the builder. Note that `createdBy` is a user ID string (not the full `IVideoConferenceUser` object) -- the platform resolves it.

---

## IVideoConferenceExtender

```typescript
export interface IVideoConferenceExtender {
    kind: RocketChatAssociationModel.VIDEO_CONFERENCE;

    setProviderData(value: Record<string, any>): IVideoConferenceExtender;
    setStatus(value: VideoConference['status']): IVideoConferenceExtender;
    setEndedBy(value: IVideoConferenceUser['_id']): IVideoConferenceExtender;
    setEndedAt(value: VideoConference['endedAt']): IVideoConferenceExtender;
    addUser(userId: VideoConferenceMember['_id'], ts?: VideoConferenceMember['ts']): IVideoConferenceExtender;
    setDiscussionRid(rid: VideoConference['discussionRid']): IVideoConferenceExtender;
    getVideoConference(): VideoConference;
}
```

### Methods

| Method | Description |
|--------|-------------|
| `setProviderData(data)` | Replace or set provider-specific data |
| `setStatus(value)` | Set the conference status (use `VideoConferenceStatus` enum) |
| `setEndedBy(userId)` | Set which user ended the conference |
| `setEndedAt(date)` | Set the end timestamp |
| `addUser(userId, ts?)` | Add a user to the conference (optionally with a join timestamp) |
| `setDiscussionRid(rid)` | Set or change the discussion room ID |
| `getVideoConference()` | Get the current state of the extended conference |

### VideoConferenceStatus Enum

```typescript
export enum VideoConferenceStatus {
    CALLING = 0,
    STARTED = 1,
    EXPIRED = 2,
    ENDED = 3,
    DECLINED = 4,
}
```

---

## Creating a Video Conference

```typescript
import { IModifyCreator } from '@rocket.chat/apps-engine/definition/accessors';

async function createCall(
    creator: IModifyCreator,
    roomId: string,
    userId: string,
): Promise<string> {
    const builder = creator.startVideoConference();

    builder
        .setRoomId(roomId)
        .setCreatedBy(userId)
        .setProviderName('jitsi')
        .setProviderData({ customField: 'value' })
        .setTitle('Team Standup');

    // builder.getVideoConference() -- inspect before finishing
    return creator.finish(builder);
}
```

The `finish` call saves the conference and returns its `_id`. After creation, the platform calls `generateUrl` on the registered provider whose name matches.

---

## Extending a Video Conference

```typescript
import { IModifyExtender } from '@rocket.chat/apps-engine/definition/accessors';
import { VideoConferenceStatus } from '@rocket.chat/apps-engine/definition/videoConferences/IVideoConference';

async function endCall(
    extender: IModifyExtender,
    conferenceId: string,
    endedByUserId: string,
): Promise<void> {
    const vidExtender = await extender.extendVideoConference(conferenceId);

    vidExtender
        .setStatus(VideoConferenceStatus.ENDED)
        .setEndedBy(endedByUserId)
        .setEndedAt(new Date());

    await extender.finish(vidExtender);
}
```

---

## Full Example: Auto-Create and End Conference

```typescript
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { VideoConferenceStatus } from '@rocket.chat/apps-engine/definition/videoConferences/IVideoConference';

export async function executor(
    context: SlashCommandContext,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persis: IPersistence,
): Promise<void> {
    const [action] = context.getArguments();
    const roomId = context.getRoom().id;
    const userId = context.getSender().id;
    const creator = modify.getCreator();
    const extender = modify.getExtender();

    if (action === 'start') {
        const builder = creator.startVideoConference();
        builder
            .setRoomId(roomId)
            .setCreatedBy(userId)
            .setProviderName('jitsi')
            .setTitle('Quick Call');

        const callId = await creator.finish(builder);
        // callId is the conference _id
    }

    if (action === 'end' && context.getArguments().length >= 2) {
        const conferenceId = context.getArguments()[1];
        const vidExtender = await extender.extendVideoConference(conferenceId);
        vidExtender
            .setStatus(VideoConferenceStatus.ENDED)
            .setEndedBy(userId)
            .setEndedAt(new Date());

        await extender.finish(vidExtender);
    }
}
```
