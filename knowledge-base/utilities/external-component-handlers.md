# External Component Handlers

## Purpose

External component handlers let your App react when an external component (iframe) is opened or closed in the Rocket.Chat UI. External components are App-provided iframe views that render in the contextual bar or as a modal.

---

## Overview

An **external component** is an iframe hosted by your App that Rocket.Chat renders at specific locations -- the contextual bar (right sidebar) or as a modal overlay. When a user opens or closes your component, Rocket.Chat fires the corresponding event so your App can track usage, initialize state, or clean up resources.

The handlers receive `IExternalComponent` which carries the component's identity (`appId`, `name`, `location`, `url`) and -- when opened -- the runtime state (`IExternalComponentState`) with the current user and room context.

**Note**: These handlers do **not** receive a `modify` accessor. They are notification-only.

---

## When To Use

- Logging when users open or close your App's external components
- Tracking component usage for analytics
- Initializing server-side state when a component is opened
- Cleaning up resources when a component is closed
- Recording which rooms and users interact with your component

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IPostExternalComponentOpened` | After component opened | `executePostExternalComponentOpened(component, read, http, persistence)` |
| `IPostExternalComponentClosed` | After component closed | `executePostExternalComponentClosed(component, read, http, persistence)` |
| `IExternalComponent` | Component descriptor | `appId`, `name`, `description`, `icon`, `location`, `url`, `options`, `state` |
| `IExternalComponentState` | Runtime state (after open) | `currentUser`, `currentRoom` |
| `ExternalComponentLocation` | Enum | `CONTEXTUAL_BAR`, `MODAL` |
| `IExternalComponentUserInfo` | User context | `id`, `username`, `avatarUrl` |
| `IExternalComponentRoomInfo` | Room context | `id`, `slugifiedName`, `members` |

---

## IExternalComponent

```typescript
export enum ExternalComponentLocation {
    CONTEXTUAL_BAR = 'CONTEXTUAL_BAR',
    MODAL = 'MODAL',
}

export interface IExternalComponent {
    /** The App ID that owns this component */
    appId: string;
    /** Unique name of the component within the App */
    name: string;
    /** Human-readable description */
    description: string;
    /** Icon URL or base64 string */
    icon: string;
    /** Where the component renders */
    location: ExternalComponentLocation;
    /** The URL loaded in the iframe */
    url: string;
    /** Width/height options */
    options?: IExternalComponentOptions;
    /**
     * Current runtime state. Null until the component is opened.
     * Only meaningful in PostExternalComponentOpened handler context.
     */
    state?: IExternalComponentState;
}
```

---

## IExternalComponentState

```typescript
export interface IExternalComponentState {
    /** The user who opened this component */
    currentUser: IExternalComponentUserInfo;
    /** The room where the component is rendered */
    currentRoom: IExternalComponentRoomInfo;
}
```

---

## IExternalComponentUserInfo

```typescript
export interface IExternalComponentUserInfo {
    id: string;
    username: string;
    /** The avatar URL of the Rocket.Chat user */
    avatarUrl: string;
}
```

---

## IExternalComponentRoomInfo

```typescript
export interface IExternalComponentRoomInfo {
    id: string;
    slugifiedName: string;
    /** All users belonging to this room */
    members: Array<IExternalComponentUserInfo>;
}
```

---

## IExternalComponentOptions

```typescript
export interface IExternalComponentOptions {
    /** Width of the external component in pixels */
    width?: number;
    /** Height of the external component in pixels */
    height?: number;
}
```

---

## IPostExternalComponentOpened

**Fires**: After an external component (iframe) is opened by a user in the Rocket.Chat UI.

**Context**: `IExternalComponent` -- the component descriptor with `state` populated (contains `currentUser` and `currentRoom`).

**Can modify?** No. Notification-only. This handler does not receive a `modify` accessor.

**Note**: The `state` property on `IExternalComponent` is `null` until the component is opened. In the `IPostExternalComponentOpened` handler, `state` is guaranteed to be populated.

**Example**:

```typescript
import {
    IPostExternalComponentOpened,
    IExternalComponent,
    ExternalComponentLocation,
    IRead,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/externalComponent';

export class ComponentUsageTracker implements IPostExternalComponentOpened {
    public async executePostExternalComponentOpened(
        externalComponent: IExternalComponent,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const state = externalComponent.state;
        if (!state) return;

        const location = externalComponent.location === ExternalComponentLocation.CONTEXTUAL_BAR
            ? 'Contextual Bar'
            : 'Modal';

        console.log(`Component opened: ${externalComponent.name}`);
        console.log(`Location: ${location}`);
        console.log(`User: ${state.currentUser.username}`);
        console.log(`Room: ${state.currentRoom.id}`);

        // Track usage for analytics
        await http.post('https://analytics.example.com/component-opened', {
            data: {
                appId: externalComponent.appId,
                componentName: externalComponent.name,
                location: externalComponent.location,
                userId: state.currentUser.id,
                username: state.currentUser.username,
                roomId: state.currentRoom.id,
                timestamp: new Date().toISOString(),
            },
        });

        // Store usage record in persistence
        const usageKey = `usage-${externalComponent.name}-${new Date().toISOString()}`;
        await persistence.update(usageKey, {
            event: 'opened',
            component: externalComponent.name,
            user: state.currentUser.username,
            room: state.currentRoom.id,
            timestamp: new Date(),
        });
    }
}
```

---

## IPostExternalComponentClosed

**Fires**: After an external component (iframe) is closed by the user in the Rocket.Chat UI.

**Context**: `IExternalComponent` -- the component descriptor. The `state` may or may not be populated; its value depends on whether the component was opened at the time of closing.

**Can modify?** No. Notification-only. This handler does not receive a `modify` accessor.

**Example**:

```typescript
import {
    IPostExternalComponentClosed,
    IExternalComponent,
    IRead,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/externalComponent';

export class ComponentCleanupHandler implements IPostExternalComponentClosed {
    public async executePostExternalComponentClosed(
        externalComponent: IExternalComponent,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const state = externalComponent.state;

        console.log(`Component closed: ${externalComponent.name}`);

        if (state) {
            console.log(`Was in room: ${state.currentRoom.id}`);
            console.log(`Was opened by: ${state.currentUser.username}`);

            // Clean up any server-side resources allocated for this session
            const sessionKey = `session-${state.currentUser.id}-${state.currentRoom.id}`;
            await persistence.remove(sessionKey);
        }

        // Track close event
        await http.post('https://analytics.example.com/component-closed', {
            data: {
                appId: externalComponent.appId,
                componentName: externalComponent.name,
                location: externalComponent.location,
                userId: state?.currentUser.id,
                roomId: state?.currentRoom.id,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
```

---

## Complete Example: Track Open/Close Sessions

A combined handler that tracks when users open and close a component, maintaining a session log.

```typescript
import {
    IPostExternalComponentOpened,
    IPostExternalComponentClosed,
    IExternalComponent,
    IRead,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/externalComponent';

interface SessionRecord {
    componentName: string;
    userId: string;
    username: string;
    roomId: string;
    openedAt: string;
    closedAt?: string;
}

export class SessionTracker implements IPostExternalComponentOpened, IPostExternalComponentClosed {
    public async executePostExternalComponentOpened(
        externalComponent: IExternalComponent,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const state = externalComponent.state;
        if (!state) return;

        const sessionId = `${state.currentUser.id}-${externalComponent.name}-${Date.now()}`;
        const record: SessionRecord = {
            componentName: externalComponent.name,
            userId: state.currentUser.id,
            username: state.currentUser.username,
            roomId: state.currentRoom.id,
            openedAt: new Date().toISOString(),
        };

        await persistence.update(sessionId, record);
        console.log(`Session started: ${sessionId}`);
    }

    public async executePostExternalComponentClosed(
        externalComponent: IExternalComponent,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const state = externalComponent.state;
        if (!state) return;

        // Find and close the most recent open session for this user + component
        // In a real app, you'd track session IDs more precisely
        console.log(`Session ended for: ${state.currentUser.username} - ${externalComponent.name}`);

        // Notify external monitoring system
        await http.post('https://monitoring.example.com/session-end', {
            data: {
                component: externalComponent.name,
                userId: state.currentUser.id,
                roomId: state.currentRoom.id,
                closedAt: new Date().toISOString(),
            },
        });
    }
}
```

---

## Key Points

1. **No `modify` accessor**: Unlike most other handlers, `IPostExternalComponentOpened` and `IPostExternalComponentClosed` do **not** receive a `modify` parameter. They are pure notification handlers.
2. **`state` is null until opened**: The `IExternalComponent.state` property is `null` until the component is opened. Always check for `state` before accessing `currentUser` or `currentRoom` (especially in the `Closed` handler, where the state might already be gone).
3. **Two locations**: Components render in `CONTEXTUAL_BAR` (right sidebar) or `MODAL` (overlay). Use `externalComponent.location` to distinguish.
4. **Multiple components per App**: One App can register multiple components (each with a unique `name`). The handlers receive the specific component that was opened/closed.
5. **User and Room context**: The `IExternalComponentState` provides the user who opened the component and the room where it was opened, plus all room members -- useful for permission checks and context-aware behavior in the iframe.

---

## Related Interfaces

| Interface | Source File |
|-----------|-------------|
| `IPostExternalComponentOpened` | `definition/externalComponent/IPostExternalComponentOpened.ts` |
| `IPostExternalComponentClosed` | `definition/externalComponent/IPostExternalComponentClosed.ts` |
| `IExternalComponent` | `definition/externalComponent/IExternalComponent.ts` |
| `IExternalComponentState` | `definition/externalComponent/IExternalComponentState.ts` |
| `IExternalComponentRoomInfo` | `definition/externalComponent/IExternalComponentRoomInfo.ts` |
| `IExternalComponentUserInfo` | `definition/externalComponent/IExternalComponentUserInfo.ts` |
| `IExternalComponentOptions` | `definition/externalComponent/IExternalComponentOptions.ts` |
