# API Request & Response

## Purpose

`IApiRequest` and `IApiResponse` are the core data structures for all API endpoint handler methods. The request provides parsed HTTP request data (method, headers, query, body, user). The response defines what the server sends back (status code, headers, content).

---

## Overview

Every handler method (`get`, `post`, `put`, `delete`, `head`, `options`, `patch`) receives an `IApiRequest` as its first parameter and must return an `IApiResponse`. The request is pre-parsed by the Rocket.Chat engine. The response must contain at minimum an HTTP status code.

There are two response interfaces: `IApiResponse` (generic) and `IApiResponseJSON` (structured JSON with `content-type` header auto-applied).

---

## When To Use

- Reading `request.method` to handle different HTTP verbs
- Parsing `request.query` for URL query parameters
- Parsing `request.params` for route parameters
- Reading `request.content` for POST/PUT/PATCH body
- Accessing `request.user` for authenticated endpoints
- Reading `request.headers` for custom headers or auth tokens
- Building responses with appropriate status codes and content

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IApiRequest` | Incoming request data | `method`, `headers`, `query`, `params`, `content`, `privateHash`, `user` |
| `IApiResponse` | Outgoing response | `status`, `headers?`, `content?` |
| `IApiResponseJSON` | Response with JSON content | `status`, `headers?`, `content` (typed as object) |
| `HttpStatusCode` | Enum | All standard HTTP status codes |
| `RequestMethod` | String union type | `'get' | 'post' | 'put' | 'delete' | 'head' | 'options' | 'patch'` |

---

## IApiRequest Interface

| Property | Type | Description |
|----------|------|-------------|
| `method` | `RequestMethod` | The HTTP method used: `'get'`, `'post'`, `'put'`, `'delete'`, `'head'`, `'options'`, `'patch'` |
| `headers` | `{ [key: string]: string }` | Request headers. Keys are lowercased |
| `query` | `{ [key: string]: string }` | URL query parameters. Example: `?limit=10&page=2` becomes `{ limit: '10', page: '2' }` |
| `params` | `{ [key: string]: string }` | Route/path parameters. If the URL contains path segments after the endpoint path, they are captured as params |
| `content` | `any` | The parsed request body. For JSON requests, this is the parsed object. For other content types, it is the raw body |
| `privateHash` | `string` (optional) | The random hash from the URL (PRIVATE visibility only). Useful for verifying the calling context |
| `user` | `IUser` (optional) | The authenticated Rocket.Chat user. Only populated when `authRequired: true` is set on the endpoint |

### Reading Headers

Header keys are lowercased by the engine. Access them case-insensitively:

```typescript
const auth = request.headers['authorization'];      // 'Bearer token-xyz'
const contentType = request.headers['content-type']; // 'application/json'
```

### Reading Query Parameters

All values are strings. Parse to the appropriate type:

```typescript
const limit = parseInt(request.query.limit, 10) || 10;
const offset = parseInt(request.query.offset, 10) || 0;
const searchTerm = request.query.q || '';
const isActive = request.query.active === 'true';
```

### Reading Route Params

`params` captures additional path segments beyond the endpoint's `path`. For example, with endpoint path `items` and URL `/items/123/details`:
- `request.params[0]` or `request.params['id']` may contain `'123'` depending on the routing implementation.

```typescript
const itemId = request.params.id;
const action = request.params.action;
```

### Reading Content (Body)

For JSON POST/PUT bodies:

```typescript
const body = request.content;

if (typeof body === 'object' && body !== null) {
    const name = body.name;
    const email = body.email;
}
```

Always validate that `request.content` is not `null` and has the expected shape.

---

## IApiResponse Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `HttpStatusCode` | Yes | HTTP status code |
| `headers?` | `{ [key: string]: string }` | No | Response headers |
| `content?` | `any` | No | Response body |

Minimal response:

```typescript
return { status: HttpStatusCode.OK };
```

Response with content and headers:

```typescript
return {
    status: HttpStatusCode.OK,
    headers: { 'x-custom-header': 'value' },
    content: { success: true, data: [1, 2, 3] },
};
```

---

## IApiResponseJSON Interface

An extended response interface where `content` is typed as `{ [key: string]: any }`. Used with the `this.json()` helper to auto-set `content-type: application/json`:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `HttpStatusCode` | Yes | HTTP status code |
| `headers?` | `{ [key: string]: string }` | No | Response headers. If `content-type` is missing, `this.json()` sets it to `application/json` |
| `content` | `{ [key: string]: any }` | No | Response body as a plain object |

---

## Typical Workflow

### 1. Parsing a GET Request

```typescript
public async get(
    request: IApiRequest,
    endpoint: IApiEndpointInfo,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persis: IPersistence
): Promise<IApiResponse> {
    // Parse query parameters
    const limit = parseInt(request.query.limit, 10) || 10;
    const page = parseInt(request.query.page, 10) || 1;

    // Parse headers
    const apiVersion = request.headers['x-api-version'] || '1.0';

    // Fetch data
    const data = await this.fetchItems(read, limit, page);

    // Return paginated response
    return this.json({
        status: HttpStatusCode.OK,
        content: {
            data,
            pagination: { page, limit, total: data.length },
            version: apiVersion,
        },
    });
}
```

### 2. Parsing a POST Request

```typescript
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
    if (!body || typeof body !== 'object') {
        return this.json({
            status: HttpStatusCode.BAD_REQUEST,
            content: { error: 'Request body must be valid JSON' },
        });
    }

    if (!body.name || !body.email) {
        return this.json({
            status: HttpStatusCode.BAD_REQUEST,
            content: { error: 'Missing required fields: name, email' },
        });
    }

    // Check auth header for external service token
    const token = request.headers['x-api-token'];
    if (token !== 'my-secret-key') {
        return { status: HttpStatusCode.UNAUTHORIZED };
    }

    // Process the request
    const result = await this.createRecord(body, persis);

    return this.json({
        status: HttpStatusCode.CREATED,
        content: { record: result },
    });
}
```

### 3. Using Authenticated User

When `authRequired: true`, the authenticated user is available:

```typescript
public async get(
    request: IApiRequest,
    endpoint: IApiEndpointInfo,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persis: IPersistence
): Promise<IApiResponse> {
    const user = request.user;

    if (!user) {
        return { status: HttpStatusCode.UNAUTHORIZED };
    }

    return this.success({
        userId: user.id,
        username: user.username,
        message: `Hello, ${user.name || user.username}!`,
    });
}
```

---

## Example (Complete Request/Response Handling)

```typescript
import { IHttp, IModify, IPersistence, IRead, HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';

export class WebhookEndpoint extends ApiEndpoint {
    public path = 'events';

    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        const { method, headers, query, content, privateHash, user } = request;

        // Log the incoming request
        this.app.getLogger().debug({
            msg: 'Event received',
            method,
            hasContent: !!content,
            contentType: headers['content-type'],
            privateHash,
        });

        // Validate the secret
        const secret = headers['x-webhook-secret'];
        const expectedSecret = await read.getEnvironmentReader()
            .getSettings()
            .getValueById('webhook-secret');

        if (secret !== expectedSecret) {
            return this.json({
                status: HttpStatusCode.FORBIDDEN,
                content: { error: 'Invalid webhook secret' },
            });
        }

        // Validate the payload
        if (!content || !content.event || !content.data) {
            return this.json({
                status: HttpStatusCode.BAD_REQUEST,
                content: { error: 'Missing event or data fields' },
            });
        }

        try {
            // Process the event
            await this.processEvent(content.event, content.data, read, modify, http, persis);

            return this.json({
                status: HttpStatusCode.OK,
                content: { success: true, event: content.event },
            });
        } catch (error) {
            this.app.getLogger().error({ msg: 'Failed to process event', error });

            return this.json({
                status: HttpStatusCode.INTERNAL_SERVER_ERROR,
                content: { error: 'Internal processing error' },
            });
        }
    }

    private async processEvent(
        eventType: string,
        data: any,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();
        const roomReader = read.getRoomReader();
        const room = await roomReader.getByName('general');

        if (!room) return;

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`Event "${eventType}" received:\n\`\`\`\n${JSON.stringify(data, null, 2)}\n\`\`\``);

        await modify.getCreator().finish(builder);
    }
}
```

---

## Common Status Codes

| Code | Enum | When to Use |
|------|------|-------------|
| 200 | `HttpStatusCode.OK` | Successful GET, successful operation |
| 201 | `HttpStatusCode.CREATED` | Resource created via POST |
| 400 | `HttpStatusCode.BAD_REQUEST` | Invalid input, missing fields |
| 401 | `HttpStatusCode.UNAUTHORIZED` | Missing or invalid auth |
| 403 | `HttpStatusCode.FORBIDDEN` | Auth valid but insufficient permissions |
| 404 | `HttpStatusCode.NOT_FOUND` | Resource not found |
| 405 | `HttpStatusCode.METHOD_NOT_ALLOWED` | Returned automatically for unimplemented methods |
| 500 | `HttpStatusCode.INTERNAL_SERVER_ERROR` | Unexpected error |

---

## Best Practices

- **Always validate `request.content`** — check for `null` and expected shape before accessing properties.
- **Parse query parameters to the correct type** — all query values are strings. Use `parseInt`, `parseFloat`, or explicit comparisons.
- **Validate secret tokens/API keys in handlers** — since `ApiSecurity.UNSECURE` is the only available mode, implement your own auth.
- **Return proper status codes** — don't return 200 for errors. Use the appropriate code.
- **Use `this.json()` for structured responses** — it ensures Content-Type is set correctly.
- **Log incoming requests** — helps debug production webhook issues.
- **Handle errors gracefully** — catch exceptions and return 500 with a meaningful error message.

---

## Common Mistakes

- **Assuming `request.content` is always an object** — it might be null, a string, or undefined for GET/HEAD requests.
- **Not parsing query string values** — `request.query.limit` is `'10'` (string), not `10` (number).
- **Returning `success()` for errors** — use the appropriate error status code.
- **Forgetting to set response headers** — especially `content-type` when returning non-JSON data.
- **Accessing `request.user` without `authRequired: true`** — it will be undefined.
- **Not handling unexpected content types** — the body may not be JSON.

---

## Related Topics

- [API Definition](./api-definition.md)
- [API Endpoint](./api-endpoint.md)
- [API Examples](./api-examples.md)
- [IHttp Accessor](../accessors/i-http-accessor.md)
