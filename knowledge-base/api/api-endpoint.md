# API Endpoint

## Purpose

An API endpoint defines a single URL path within your App's API and implements HTTP method handlers. Each endpoint handles one piece of your REST API surface.

---

## Overview

An endpoint is defined by implementing the `IApiEndpoint` interface, typically by extending the `ApiEndpoint` abstract base class. You set a `path`, optionally require authentication, and implement method-specific handlers (`get()`, `post()`, `put()`, `delete()`, `head()`, `options()`, `patch()`).

The base class provides convenience helpers: `this.success()` for 200 OK responses and `this.json()` to set the `content-type: application/json` header.

---

## When To Use

- Handling GET requests to return data
- Handling POST/PUT requests to create/update resources
- Handling DELETE requests to remove resources
- Building any REST endpoint for your App

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IApiEndpoint` | Endpoint contract | `path`, `examples`, `authRequired`, method handlers |
| `ApiEndpoint` | Abstract base class | `app`, `success()`, `json()` |
| `IApiEndpointInfo` | Endpoint metadata (runtime) | `basePath`, `fullPath`, `appId`, `hash` |

---

## IApiEndpoint Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string` | Yes | The last part of the API URL path. Cannot contain `/` — it is a single segment |
| `examples` | `{ [key: string]: IApiExample }` | No | API examples shown in marketplace documentation |
| `authRequired` | `boolean` | No | If `true`, the request must be from an authenticated Rocket.Chat user (via cookie/token). Rejects with 401 otherwise |
| `_availableMethods` | `string[]` | No | Set by the runtime. Lists the HTTP methods implemented on this endpoint |
| `get?` | method handler | No | Handle GET requests |
| `post?` | method handler | No | Handle POST requests |
| `put?` | method handler | No | Handle PUT requests |
| `delete?` | method handler | No | Handle DELETE requests |
| `head?` | method handler | No | Handle HEAD requests |
| `options?` | method handler | No | Handle OPTIONS requests |
| `patch?` | method handler | No | Handle PATCH requests |

---

## IApiEndpointInfo (Runtime Metadata)

Passed to each method handler. Contains contextual information about the request URL:

| Property | Type | Description |
|----------|------|-------------|
| `basePath` | `string` | The base path: `/api/apps/public/{app-id}` or `/api/apps/private/{app-id}/{hash}` |
| `fullPath` | `string` | The full requested path |
| `appId` | `string` | Your App's ID |
| `hash?` | `string` | The random hash (only for PRIVATE visibility) |

---

## ApiEndpoint Base Class

The `ApiEndpoint` abstract class provides:

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `app` | `IApp` | Reference to your App instance (passed via constructor) |
| `path` | `string` | Must be set in your subclass |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `success()` | `(content?: any) => IApiResponse` | Returns `{ status: HttpStatusCode.OK, content }` |
| `json()` | `(response: IApiResponseJSON) => IApiResponse` | Sets `content-type: application/json` header if not already present and returns the response |

### Constructor

```typescript
constructor(public app: IApp) {}
```

Always call `super(app)` in your subclass constructor.

---

## Typical Workflow

### 1. Create an Endpoint Class

```typescript
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';

export class ItemsEndpoint extends ApiEndpoint {
    public path = 'items';

    // Handle GET /items
    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        // Read query parameters
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
        const filter = request.query.filter || '';

        // Fetch items from persistence
        const data = await this.getItems(read, persis, filter, limit);

        return this.success(data);
    }

    // Handle POST /items
    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        // Validate content
        const body = request.content;
        if (!body || !body.name) {
            return this.json({
                status: HttpStatusCode.BAD_REQUEST,
                content: { error: 'Missing required field: name' },
            });
        }

        // Create item
        const item = await this.createItem(body, persis);

        return this.json({
            status: HttpStatusCode.CREATED,
            content: { item },
        });
    }

    // Handle DELETE /items/:id
    public async delete(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        const id = request.params.id;

        if (!id) {
            return {
                status: HttpStatusCode.BAD_REQUEST,
                content: { error: 'Missing id parameter' },
            };
        }

        const deleted = await this.deleteItem(id, persis);

        return this.success({ deleted });
    }

    private async getItems(read: IRead, persis: IPersistence, filter: string, limit: number): Promise<any[]> {
        // Implementation that reads from persistence
        return [];
    }

    private async createItem(body: any, persis: IPersistence): Promise<any> {
        // Implementation that persists the item
        return body;
    }

    private async deleteItem(id: string, persis: IPersistence): Promise<boolean> {
        // Implementation that deletes from persistence
        return true;
    }
}
```

### 2. Register the Endpoint

```typescript
import { IApi, ApiVisibility, ApiSecurity } from '@rocket.chat/apps-engine/definition/api';
import { ItemsEndpoint } from './endpoints/ItemsEndpoint';

export const myApi: IApi = {
    visibility: ApiVisibility.PRIVATE,
    security: ApiSecurity.UNSECURE,
    endpoints: [
        new ItemsEndpoint(app), // Note: needs app reference for super(app)
    ],
};
```

### 3. Using Multiple HTTP Methods on One Endpoint

An endpoint can handle multiple methods. Route internally based on URL params if needed:

```typescript
export class DataEndpoint extends ApiEndpoint {
    public path = 'data';

    public async get(request: IApiRequest, ...rest: any[]): Promise<IApiResponse> {
        return this.success({ method: 'GET', query: request.query });
    }

    public async post(request: IApiRequest, ...rest: any[]): Promise<IApiResponse> {
        return this.success({ method: 'POST', body: request.content });
    }

    public async put(request: IApiRequest, ...rest: any[]): Promise<IApiResponse> {
        return this.success({ method: 'PUT', body: request.content });
    }
}
```

> **Note**: Only implement the methods you need. Unimplemented methods return 405 Method Not Allowed.

---

## Helper: `success()` vs `json()`

| Helper | When to Use |
|--------|-------------|
| `success(content?)` | Simple 200 OK response. Does NOT set content-type header automatically |
| `json(response)` | Any response where you want `content-type: application/json`. Sets the header if not already present. Use for structured JSON responses |

```typescript
// Simple success
return this.success();                         // { status: 200 }

// Success with content
return this.success({ data: [1, 2, 3] });     // { status: 200, content: { data: [1,2,3] } }

// JSON response with explicit status code
return this.json({
    status: HttpStatusCode.BAD_REQUEST,
    content: { error: 'Invalid input' },       // Automatically adds content-type: application/json
});
```

---

## Example (Complete Endpoint with Auth)

```typescript
import { IHttp, IModify, IPersistence, IRead, HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';

export class ProtectedEndpoint extends ApiEndpoint {
    public path = 'protected';
    public authRequired = true; // Requires Rocket.Chat authentication

    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        // `request.user` is populated when authRequired is true
        const user = request.user;
        const username = user?.username ?? 'anonymous';

        return this.success({
            message: `Hello, ${username}!`,
            authenticated: !!user,
        });
    }
}
```

---

## Best Practices

- **Extend `ApiEndpoint`** rather than implementing `IApiEndpoint` directly — you get `this.app` and helpers.
- **Use `this.success()` for 200 OK responses** — it is concise and consistent.
- **Use `this.json()` for structured JSON** — it ensures the correct content-type.
- **Return proper status codes** — use `HttpStatusCode` enum: `OK` (200), `CREATED` (201), `BAD_REQUEST` (400), `NOT_FOUND` (404), `UNAUTHORIZED` (401).
- **Validate `request.content` before accessing properties** — POST/PUT bodies may be null or malformed.
- **Use `request.params` for path parameters** — if your URL pattern includes route params, they appear here.
- **Set `authRequired: true` when data should be restricted** — the Rocket.Chat server handles authentication.
- **Implement only the methods you need** — unimplemented methods automatically return 405.

---

## Common Mistakes

- **Forgetting `super(app)` in the constructor** — `this.app` will be undefined.
- **Not validating `request.content`** — `null` or unexpected shape causes runtime errors.
- **Returning raw objects instead of `IApiResponse`** — the response must have `status` at minimum.
- **Setting `authRequired: true` but not using `request.user`** — it is set for you; check it for user-specific logic.
- **Using `path` with slashes** — the path is a single URL segment. Use query parameters or request body for additional routing.
- **Blocking the event loop** — endpoint handlers should resolve quickly. Offload slow operations.

---

## Related Topics

- [API Definition](./api-definition.md)
- [API Request & Response](./api-request-response.md)
- [API Examples](./api-examples.md)
- [HttpStatusCode Reference](../accessors/i-http-accessor.md)
