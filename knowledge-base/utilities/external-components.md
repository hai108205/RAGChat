# External Components

## Purpose

External components allow Rocket.Chat apps to register iframe-based UI panels that appear in the Rocket.Chat client. Components render in the contextual bar (right sidebar) or as modals. The component's state (current user, current room) is populated automatically when opened.

---

## Overview

An app declares external components in `extendConfiguration` via `configuration.externalComponents.register(...)`. Each component specifies its name, description, icon, URL to load, location (CONTEXTUAL_BAR or MODAL), and optional dimensions. When a user opens the component, Rocket.Chat injects the current user and room information into the component's state and renders the iframe.

---

## When To Use

- Adding a custom sidebar panel (e.g., a todo list, project board, external CRM view)
- Showing a modal with external content (e.g., a form, a report)
- Embedding any external web app inside Rocket.Chat's UI with context about the current user/room

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IExternalComponent` | Component descriptor | `appId`, `name`, `description`, `icon`, `location`, `url`, `options?`, `state?` |
| `IExternalComponentOptions` | Display options | `width?`, `height?` |
| `IExternalComponentState` | Runtime state (populated on open) | `currentUser`, `currentRoom` |
| `IExternalComponentUserInfo` | User info in state | `id`, `username`, `avatarUrl` |
| `IExternalComponentRoomInfo` | Room info in state | `id`, `slugifiedName`, `members` |
| `ExternalComponentLocation` | Enum of display locations | `CONTEXTUAL_BAR`, `MODAL` |
| `IExternalComponentsExtend` | Registration accessor | `register(component)` |

---

## IExternalComponent

```typescript
export interface IExternalComponent {
    appId: string;
    name: string;
    description: string;
    icon: string;
    location: ExternalComponentLocation;
    url: string;
    options?: IExternalComponentOptions;
    state?: IExternalComponentState;
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `appId` | Yes | The ID of the app that owns this component. Auto-set by the platform. |
| `name` | Yes | Unique name for this component. Must be unique across all registered components. Registering a second component with the same name overwrites the first. |
| `description` | Yes | Human-readable description shown in UI. |
| `icon` | Yes | URL or base64-encoded string for the component's icon. |
| `location` | Yes | Where the component appears. |
| `url` | Yes | The URL of the iframe content. Can be relative to the app's deployed URL or an absolute external URL. |
| `options` | No | Display dimensions for the component. |
| `state` | No | **Runtime only.** `null` until the component is opened. After the `ExternalComponentOpened` event fires, populated with `currentUser` and `currentRoom`. |

---

## ExternalComponentLocation

```typescript
export enum ExternalComponentLocation {
    CONTEXTUAL_BAR = 'CONTEXTUAL_BAR',
    MODAL = 'MODAL',
}
```

| Value | Description |
|-------|-------------|
| `CONTEXTUAL_BAR` | Renders in the right-side contextual bar (same area as room info, member list, etc.) |
| `MODAL` | Renders as a modal dialog overlay |

---

## IExternalComponentOptions

```typescript
export interface IExternalComponentOptions {
    width?: number;
    height?: number;
}
```

Optional dimensions. If not provided, the platform uses default sizes.

---

## IExternalComponentState

```typescript
export interface IExternalComponentState {
    currentUser: IExternalComponentUserInfo;
    currentRoom: IExternalComponentRoomInfo;
}
```

| Field | Description |
|-------|-------------|
| `currentUser` | The user who opened the component |
| `currentRoom` | The room where the component was opened |

**State is `null` until the component is opened.** It does not make sense to read `state` in `PreExternalComponentOpenedPrevent`, `PreExternalComponentOpenedModify`, or `PreExternalComponentOpenedExtend` handlers -- the component hasn't been opened yet.

---

## IExternalComponentUserInfo

```typescript
export interface IExternalComponentUserInfo {
    id: string;
    username: string;
    avatarUrl: string;
}
```

A minimal subset of `IUser` fields exposed to the external component's iframe.

---

## IExternalComponentRoomInfo

```typescript
export interface IExternalComponentRoomInfo {
    id: string;
    slugifiedName: string;
    members: Array<IExternalComponentUserInfo>;
}
```

| Field | Description |
|-------|-------------|
| `id` | Room ID |
| `slugifiedName` | URL-safe version of the room name |
| `members` | List of users in the room (each with `id`, `username`, `avatarUrl`) |

---

## Registration

Register components in `extendConfiguration`:

```typescript
import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { ExternalComponentLocation } from '@rocket.chat/apps-engine/definition/externalComponent';

export async function extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
    await configuration.externalComponents.register({
        appId: 'your-app-id',  // Usually provided by the platform
        name: 'my-sidebar',
        description: 'My custom sidebar panel',
        icon: 'https://example.com/icon.png',
        location: ExternalComponentLocation.CONTEXTUAL_BAR,
        url: '/sidebar',  // Relative to app's deployed URL
        options: {
            width: 400,
            height: 600,
        },
    });
}
```

---

## Complete Example: Modal Component

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ExternalComponentLocation,
    IExternalComponent,
} from '@rocket.chat/apps-engine/definition/externalComponent';

export class MyApp extends App {
    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        // Contextual bar component
        await configuration.externalComponents.register({
            appId: this.getID(),
            name: 'project-board',
            description: 'View and manage project tasks',
            icon: 'data:image/svg+xml;base64,...',
            location: ExternalComponentLocation.CONTEXTUAL_BAR,
            url: '/project-board',
        });

        // Modal component
        await configuration.externalComponents.register({
            appId: this.getID(),
            name: 'report-generator',
            description: 'Generate custom reports',
            icon: 'https://myapp.example.com/report-icon.png',
            location: ExternalComponentLocation.MODAL,
            url: '/report-modal',
            options: {
                width: 800,
                height: 600,
            },
        });
    }
}
```

---

## How State is Populated

1. Component is registered during `extendConfiguration` -- `state` is `undefined`/`null`.
2. User clicks the component button in the UI.
3. The `IPostExternalComponentOpened` event fires (if the app handles it).
4. Rocket.Chat populates `IExternalComponentState` with the current user and room.
5. The iframe loads the component's `url` and receives the state via postMessage or query parameters (depending on the platform implementation).

The iframe content (your web app at `url`) can access `currentUser` and `currentRoom` to personalize the experience per user/room context.
