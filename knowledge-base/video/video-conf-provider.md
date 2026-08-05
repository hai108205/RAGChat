# Video Conference Provider (IVideoConfProvider)

## Purpose

`IVideoConfProvider` defines the contract for third-party video conferencing integrations in Rocket.Chat apps. Implement this interface to add a custom video conference provider (Jitsi, Zoom, Google Meet, etc.) that Rocket.Chat can use when users start calls.

---

## Overview

When a user clicks the video call button in a Rocket.Chat room, the platform delegates to a registered video conf provider. The provider's `generateUrl` creates the meeting link, and `customizeUrl` tailors the URL per participant (e.g., adding display name, mute settings). Optional hooks cover lifecycle events: configuration check, new conference, conference changes, user join, and info panel.

---

## When To Use

- Integrating a self-hosted video solution (Jitsi Meet, BigBlueButton)
- Integrating a SaaS video platform (Zoom, Google Meet, Microsoft Teams)
- Customizing meeting URLs per user (name, role, mute state)
- Adding an info panel with meeting details

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IVideoConfProvider` | Provider contract | `name`, `capabilities`, `generateUrl`, `customizeUrl`, optional lifecycle hooks |
| `IVideoConferenceOptions` | User preferences for joining | `mic?: boolean`, `cam?: boolean` |
| `VideoConfData` | Minimal call data on creation | `_id`, `type`, `rid`, `createdBy`, `providerData`, `discussionRid`, `title?` |
| `VideoConfDataExtended` | Call data with URL | `VideoConfData` + `url` (required) |
| `IVideoConfProvidersExtend` | Registration accessor | `provideVideoConfProvider(provider)` |

---

## IVideoConfProvider

```typescript
export interface IVideoConfProvider {
    name: string;

    capabilities?: {
        mic?: boolean;
        cam?: boolean;
        title?: boolean;
        persistentChat?: boolean;
    };

    isFullyConfigured?(read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<boolean>;
    onNewVideoConference?(call: VideoConference, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void>;
    onVideoConferenceChanged?(call: VideoConference, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void>;
    onUserJoin?(call: VideoConference, user: IVideoConferenceUser | undefined, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void>;
    getVideoConferenceInfo?(call: VideoConference, user: IVideoConferenceUser | undefined, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<Array<IBlock>>;

    generateUrl(call: VideoConfData, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<string>;
    customizeUrl(call: VideoConfDataExtended, user: IVideoConferenceUser | undefined, options: IVideoConferenceOptions | undefined, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<string>;
}
```

### Fields and Methods

| Member | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Unique provider name. Identifies this provider in the system. |
| `capabilities.mic` | No | If `true`, Rocket.Chat can control whether the user's microphone starts muted. |
| `capabilities.cam` | No | If `true`, Rocket.Chat can control whether the user's camera starts on. |
| `capabilities.title` | No | If `true`, Rocket.Chat can set a custom title on the video conference. |
| `capabilities.persistentChat` | No | If `true`, the provider supports Rocket.Chat's Persistent Chat inside the conference. |
| `isFullyConfigured` | No | Check if the provider is ready (e.g., API keys are set). Return `false` to prevent usage until configured. |
| `onNewVideoConference` | No | Called when a new video conference is created with this provider. |
| `onVideoConferenceChanged` | No | Called when Rocket.Chat modifies a video conference (status change, user added, etc.). |
| `onUserJoin` | No | Called when a user joins an existing video conference. |
| `getVideoConferenceInfo` | No | Called when the info button is clicked. Must return an array of UiKit blocks for a modal. |
| `generateUrl` | **Yes** | Called when a new video conference URL is requested. Receives `VideoConfData` and must return a URL string. |
| `customizeUrl` | **Yes** | Called when a user-specific join URL is needed. Receives the conference URL plus user and options. Must return a personalized URL. |

---

## VideoConfData

```typescript
export type VideoConfData = Pick<IVideoConference, '_id' | 'type' | 'rid' | 'createdBy' | 'providerData' | 'discussionRid'> & {
    title?: IGroupVideoConference['title'];
};
```

Represents the video conference at creation time -- before the URL is assigned. Contains the room ID, creator, type, and any `providerData` set by `IVideoConferenceBuilder.setProviderData()`.

---

## VideoConfDataExtended

```typescript
export type VideoConfDataExtended = VideoConfData & Required<Pick<IVideoConference, 'url'>>;
```

Same as `VideoConfData` but with `url` guaranteed to be present. Passed to `customizeUrl` -- the URL is whatever `generateUrl` returned.

---

## IVideoConferenceOptions

```typescript
export interface IVideoConferenceOptions {
    mic?: boolean;  // Mic on (true) or muted (false)
    cam?: boolean;  // Camera on (true) or off (false)
}
```

User preferences when joining a call. Passed to `customizeUrl` so the provider can apply these settings to the join URL.

---

## IVideoConferenceUser

```typescript
export interface IVideoConferenceUser {
    _id: string;
    username: string;
    name: string;
}
```

Minimal user representation for video conference participants. Passed to `customizeUrl` and lifecycle hooks.

---

## Registration

Register the provider in `extendConfiguration`:

```typescript
public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
    await configuration.videoConfProviders.provideVideoConfProvider(new MyVideoProvider());
}
```

The `IVideoConfProvidersExtend` accessor is available via `configuration.videoConfProviders`.

---

## Complete Example: Custom Jitsi Provider

```typescript
import { IConfigurationExtend, IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IVideoConfProvider } from '@rocket.chat/apps-engine/definition/videoConfProviders';
import { IVideoConferenceOptions } from '@rocket.chat/apps-engine/definition/videoConfProviders/IVideoConferenceOptions';
import { VideoConfData, VideoConfDataExtended } from '@rocket.chat/apps-engine/definition/videoConfProviders/VideoConfData';
import { VideoConference } from '@rocket.chat/apps-engine/definition/videoConferences/IVideoConference';
import { IVideoConferenceUser } from '@rocket.chat/apps-engine/definition/videoConferences/IVideoConferenceUser';
import { App } from '@rocket.chat/apps-engine/definition/App';

class JitsiMeetProvider implements IVideoConfProvider {
    public name = 'jitsi';

    public capabilities = {
        mic: true,
        cam: true,
        title: true,
        persistentChat: false,
    };

    public async isFullyConfigured(
        read: IRead, modify: IModify, http: IHttp, persis: IPersistence,
    ): Promise<boolean> {
        const domain = await read.getEnvironmentReader()
            .getSettings().getValueById('jitsi-domain');
        return Boolean(domain);
    }

    public async generateUrl(
        call: VideoConfData,
        read: IRead, modify: IModify, http: IHttp, persis: IPersistence,
    ): Promise<string> {
        const domain = await read.getEnvironmentReader()
            .getSettings().getValueById('jitsi-domain');
        const roomName = call._id; // Use the conference ID as room name
        return `https://${domain}/${roomName}`;
    }

    public async customizeUrl(
        call: VideoConfDataExtended,
        user: IVideoConferenceUser | undefined,
        options: IVideoConferenceOptions | undefined,
        read: IRead, modify: IModify, http: IHttp, persis: IPersistence,
    ): Promise<string> {
        let url = call.url;

        if (user) {
            url += `#userInfo.displayName="${encodeURIComponent(user.name)}"`;
        }

        if (options?.mic === false) {
            url += '&config.startWithAudioMuted=true';
        }
        if (options?.cam === false) {
            url += '&config.startWithVideoMuted=true';
        }

        return url;
    }

    public async getVideoConferenceInfo(
        call: VideoConference,
        user: IVideoConferenceUser | undefined,
        read: IRead, modify: IModify, http: IHttp, persis: IPersistence,
    ): Promise<Array<any>> {
        // Return UiKit blocks for an info modal
        return [
            {
                type: 'section',
                text: { type: 'plain_text', text: `Meeting URL: ${call.url}` },
            },
        ];
    }
}

export class MyApp extends App {
    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await configuration.videoConfProviders.provideVideoConfProvider(
            new JitsiMeetProvider(),
        );
    }
}
```
