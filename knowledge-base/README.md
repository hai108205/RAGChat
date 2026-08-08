# Rocket.Chat App-Engine SDK — AI Knowledge Base

## Purpose

This Knowledge Base teaches AI coding assistants (and developers) how to build Rocket.Chat Apps using the public App-Engine SDK. It covers every public interface, accessor, and event handler in the SDK with production-quality TypeScript examples.

---

## Overview

The **Rocket.Chat App-Engine SDK** is a TypeScript SDK that lets external developers build Apps (plugins) for Rocket.Chat. An App can extend Rocket.Chat with slash commands, REST API endpoints, interactive UI blocks, scheduled jobs, message handlers, room handlers, livechat integrations, video conference providers, and more.

The SDK is structured around a single entry point — the `App` abstract class — which receives **accessors** (read, modify, HTTP, persistence) during its lifecycle hooks. Developers override lifecycle methods to register features and handle events.

---

## What You Can Build

| Category | Capabilities |
|----------|-------------|
| **Slash Commands** | Register custom `/commands` with previews and autocomplete |
| **REST API** | Public or private HTTP endpoints with full request/response control |
| **UI Kit** | Interactive blocks, modals, action buttons, contextual bars |
| **Message Handlers** | Intercept before/after message send, update, delete, react, pin, star |
| **Room Handlers** | Intercept room create/delete, user join/leave events |
| **User Handlers** | React to user created, updated, deleted, login, logout, status change |
| **Scheduler** | One-time and recurring cron jobs |
| **Persistence** | App-specific key-value storage with association support |
| **HTTP Client** | Make authenticated HTTP requests to external services |
| **OAuth2** | Full OAuth2 client with token lifecycle management |
| **Video Conference** | Register custom video conference providers |
| **Livechat** | Handle livechat room, visitor, agent, and transfer events |
| **File Uploads** | Intercept and validate file uploads before they are saved |
| **Email** | Intercept outgoing emails before they are sent |
| **External Components** | Embed iframes in Rocket.Chat UI (contextual bar, modal) |

---

## SDK Architecture

```
App (abstract class)
├── Lifecycle Hooks
│   ├── initialize()       — register features
│   ├── onEnable()         — app activated
│   ├── onDisable()        — app deactivated
│   ├── onInstall()        — first install
│   ├── onUninstall()      — removal
│   └── onUpdate()         — version upgrade
│
├── Accessors (injected into hooks)
│   ├── IRead              — 15 read-only readers
│   ├── IModify            — 10 write modifiers
│   ├── IHttp              — external HTTP client
│   ├── IPersistence       — data storage CRUD
│   └── ILogger            — structured logging
│
├── Configuration (IConfigurationExtend)
│   ├── .settings          — register app settings
│   ├── .slashCommands     — register slash commands
│   ├── .api               — register API endpoints
│   ├── .scheduler         — register job processors
│   ├── .ui                — register UI action buttons
│   └── .videoConfProviders — register video providers
│
└── Event Handler Interfaces
    ├── IPreMessageSentPrevent / Extend / Modify
    ├── IPostMessageSent / Updated / Deleted
    ├── IPreRoomCreatePrevent / Extend / Modify
    ├── IPostRoomCreate / Deleted
    ├── IPostUserCreated / Updated / Deleted
    └── ... (40+ handler interfaces)
```

---

## Learning Roadmap

1. **App Lifecycle** → Understand how Apps start, stop, and evolve
2. **Accessors** → Learn IRead and IModify, the gateways to Rocket.Chat
3. **Messages & Rooms** → Read, send, and modify messages; work with rooms
4. **Settings** → Define app configuration that admins can change
5. **Slash Commands** → Create interactive slash commands
6. **API Endpoints** → Expose REST APIs from your App
7. **Event Handlers** → Hook into message/room/user lifecycle events
8. **Scheduler & Persistence** → Run periodic jobs; store app data
9. **UI Kit** → Build interactive blocks, modals, and action buttons
10. **HTTP & OAuth2** → Call external APIs; integrate OAuth2 providers
11. **Advanced** → Livechat, Video Conference, Federation, External Components

---

## How to Use This Knowledge Base

- **Each document covers one topic** — read only what you need
- **Documents are independent** — no required reading order
- **Cross-references** are provided at the bottom of every document
- **Code examples** are production-quality TypeScript
- **Best Practices** and **Common Mistakes** sections help avoid pitfalls

Start with the [Topic Index](./index.md) to find the document you need.

---

## Document Sections

| Section | Description |
|---------|-------------|
| [`app/`](./app/) | App lifecycle, configuration, permissions, logging |
| [`accessors/`](./accessors/) | Read/Modify/HTTP/Persistence/Environment accessors and sub-accessors |
| [`messages/`](./messages/) | Message structure, attachments, files, reactions, event handlers |
| [`rooms/`](./rooms/) | Room structure, room types, room event handlers |
| [`users/`](./users/) | User structure, user event handlers |
| [`settings/`](./settings/) | App settings definition and updates |
| [`commands/`](./commands/) | Slash command registration and execution |
| [`api/`](./api/) | REST API endpoint definitions |
| [`uikit/`](./uikit/) | UI Kit: blocks, elements, modals, action buttons, interaction handlers |
| [`scheduler/`](./scheduler/) | One-time and recurring job scheduling |
| [`persistence/`](./persistence/) | App-specific data storage with associations |
| [`http/`](./http/) | HTTP client for external API calls |
| [`oauth/`](./oauth/) | OAuth2 client setup and token management |
| [`uploads/`](./uploads/) | File upload handling |
| [`livechat/`](./livechat/) | Livechat visitor, room, message, and event handlers |
| [`video/`](./video/) | Video conference provider integration |
| [`federation/`](./federation/) | Federation support |
| [`utilities/`](./utilities/) | Email, roles, moderation, external components, cloud, assets, exceptions, notifications |
| [`examples/`](./examples/) | Complete working app examples |
| [`reference/`](./reference/) | Quick lookup tables for accessors, handlers, settings, AppMethods |

---

## Related Topics

- [Topic Index](./index.md) — Complete table of contents
- [App Lifecycle](./app/app-lifecycle.md) — Start here if you're new
