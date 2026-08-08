# API Definition

## Purpose

An App API provides an HTTP interface that external services can call to interact with your Rocket.Chat App. You define endpoints with HTTP method handlers (GET, POST, PUT, etc.) and Rocket.Chat exposes them at predictable URLs.

---

## Overview

An API is defined by implementing the `IApi` interface. It specifies the visibility (public with a fixed URL, or private with a random hash), security mode, and a list of endpoint definitions. APIs are registered in `extendConfiguration()` via `configuration.api.provideApi()`.

---

## When To Use

- Receiving webhooks from external services (Slack, GitHub, Stripe)
- Building REST APIs consumed by external dashboards
- Exposing app functionality via HTTP (read data, trigger actions)
- Creating callbacks for third-party integrations

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IApi` | API registry definition | `visibility`, `security`, `endpoints` |
| `IApiEndpoint` | Individual endpoint definition | `path`, `examples`, `authRequired`, method handlers |
| `ApiEndpoint` | Abstract base class | `success()`, `json()`, `app` access |
| `ApiVisibility` | Enum | `PUBLIC`, `PRIVATE` |
| `ApiSecurity` | Enum | `UNSECURE` |
| `IApiExtend` | Registering APIs | `provideApi()` |

---

## IApi Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `visibility` | `ApiVisibility` | Yes | Controls URL format — fixed (PUBLIC) or random-hash (PRIVATE) |
| `security` | `ApiSecurity` | Yes | Currently only `UNSECURE` is available |
| `endpoints` | `Array<IApiEndpoint>` | Yes | Array of endpoint definitions |

---

## ApiVisibility Enum

| Value | Description | URL Format |
|-------|-------------|------------|
| `PUBLIC` | Fixed, predictable URL. Easy to remember but guessable. Consider using auth. | `https://{server}/api/apps/public/{app-id}/{path}` |
| `PRIVATE` | Random hash in URL, generated per installation. Harder to guess. Changes on reinstall. | `https://{server}/api/apps/private/{app-id}/{random-hash}/{path}` |

---

## ApiSecurity Enum

| Value | Description |
|-------|-------------|
| `UNSECURE` | No token verification. The API is open to anyone who knows the URL. |

> **Note**: Only `UNSECURE` is currently available. If you need authentication, implement it inside your endpoint handlers (e.g., check a secret header, validate a token).

---

## Typical Workflow

### 1. Create an API Object

Implement `IApi` with your endpoints. Use the `ApiEndpoint` base class for each endpoint.

```typescript
import { IApi, ApiVisibility, ApiSecurity } from '@rocket.chat/apps-engine/definition/api';
import { MyWebhookEndpoint } from './endpoints/MyWebhookEndpoint';

export const myApi: IApi = {
    visibility: ApiVisibility.PUBLIC,
    security: ApiSecurity.UNSECURE,
    endpoints: [
        new MyWebhookEndpoint(),
        new MyStatusEndpoint(),
    ],
};
```

### 2. Register in `extendConfiguration()`

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend, IEnvironmentRead } from '@rocket.chat/apps-engine/definition/accessors';
import { myApi } from './api';

export class MyApp extends App {
    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        await configuration.api.provideApi(myApi);
    }
}
```

---

## URL Resolution

### PUBLIC API

```
https://my-rocket-chat.example.com/api/apps/public/your-app-id/your-path
```

The public URL is deterministic. Anyone who knows your App ID can construct the URL. Use `ApiVisibility.PRIVATE` if the URL should not be guessed.

### PRIVATE API

```
https://my-rocket-chat.example.com/api/apps/private/your-app-id/a3f8b2c1d4/your-path
```

The random hash (`a3f8b2c1d4`) is generated when the App is installed. It persists across updates but changes if the App is uninstalled and reinstalled.

---

## (API Endpoint Interface)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string` | Yes | The last segment of the URL path |
| `examples` | `{ [key: string]: IApiExample }` | No | API examples for marketplace docs |
| `authRequired` | `boolean` | No | If `true`, requires authenticated Rocket.Chat user. Unauthenticated requests get 401 |
| `_availableMethods` | `string[]` | No | Set by the runtime. Lists the HTTP methods this endpoint handles |
| `get?` | method handler | No | Handle GET requests |
| `post?` | method handler | No | Handle POST requests |
| `put?` | method handler | No | Handle PUT requests |
| `delete?` | method handler | No | Handle DELETE requests |
| `head?` | method handler | No | Handle HEAD requests |
| `options?` | method handler | No | Handle OPTIONS requests |
| `patch?` | method handler | No | Handle PATCH requests |

---

## Example (Complete API)

```typescript
// api/MyApi.ts
import { IApi, ApiVisibility, ApiSecurity } from '@rocket.chat/apps-engine/definition/api';
import { WebhookEndpoint } from './endpoints/WebhookEndpoint';

export const myApi: IApi = {
    visibility: ApiVisibility.PRIVATE,
    security: ApiSecurity.UNSECURE,
    endpoints: [
        new WebhookEndpoint(),
    ],
};

// api/endpoints/WebhookEndpoint.ts
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ApiEndpoint, IApiEndpointInfo, IApiRequest, IApiResponse } from '@rocket.chat/apps-engine/definition/api';
import { HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';

export class WebhookEndpoint extends ApiEndpoint {
    public path = 'webhook';

    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        const payload = request.content;
        const authHeader = request.headers['authorization'];

        // Validate the request
        if (authHeader !== 'Bearer my-secret-token') {
            return { status: HttpStatusCode.UNAUTHORIZED };
        }

        // Process the webhook payload
        this.app.getLogger().info('Webhook received:', payload);

        // Respond with success
        return this.success({ received: true, timestamp: new Date() });
    }
}

// App.ts registration
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { myApi } from './api/MyApi';

export class MyApp extends App {
    protected async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await configuration.api.provideApi(myApi);
    }
}
```

---

## Best Practices

- **Use `PRIVATE` visibility by default** — prevents URL guessing.
- **Validate requests manually** — since only `UNSECURE` security exists, check headers/body for authentication.
- **Use the `ApiEndpoint` base class** — it provides `this.app` access and helper methods `success()` and `json()`.
- **Register endpoints as instantiated objects** — they need to exist at registration time for the runtime to read their `path` property and method handlers.
- **Return proper HTTP status codes** — use `HttpStatusCode` enum for consistency.
- **Log incoming requests** — helps with debugging production webhook issues.

---

## Common Mistakes

- **Using PUBLIC visibility for sensitive endpoints** — the URL can be guessed.
- **Not checking `request.content` for null** — POST/PUT requests might have empty bodies.
- **Forgetting to register the API in `extendConfiguration()`** — the API won't be exposed.
- **Returning a status code without a body** — some clients expect JSON, use `this.success()` or `this.json()`.
- **Not handling CORS** — the Rocket.Chat server handles this, but be aware of it if proxying.

---

## Related Topics

- [API Endpoint](./api-endpoint.md)
- [API Request & Response](./api-request-response.md)
- [API Examples](./api-examples.md)
- [IHttp Accessor](../accessors/i-http-accessor.md)
- [App Configuration](../app/app-configuration.md)
