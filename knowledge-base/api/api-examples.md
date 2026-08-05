# API Examples

## Purpose

API examples provide pre-configured request samples for your API endpoints. These examples appear in the Rocket.Chat Marketplace documentation, helping users understand how to call your endpoints.

---

## Overview

API examples are attached to endpoint method handlers using the `@example` decorator. Each example specifies sample query parameters, path params, headers, and body content. The Rocket.Chat engine collects these during endpoint registration and surfaces them in the marketplace listing and API documentation.

---

## When To Use

- Documenting how to call your public/private API endpoints
- Providing cURL-like examples in the Marketplace listing
- Showing different request variations (error cases, different params)
- Helping users integrate with your App's API

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IApiExample` | Example definition | `params?`, `query?`, `headers?`, `content?` |
| `example()` | Decorator function | `@example(options)` attaches to method handlers |

---

## IApiExample Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `params` | `{ [key: string]: string }` | No | Sample path/route parameters |
| `query` | `{ [key: string]: string }` | No | Sample query string parameters |
| `headers` | `{ [key: string]: string }` | No | Sample request headers |
| `content` | `any` | No | Sample request body (for POST/PUT/PATCH) |

---

## The `@example` Decorator

The `@example` decorator attaches an `IApiExample` object to the endpoint class's `examples` property under the method name key. The engine reads these at registration time.

### Signature

```typescript
function example(options: IApiExample): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void
```

### Usage

```typescript
@example({
    params: { id: '123' },
    query: { format: 'json' },
    headers: { 'x-api-token': 'your-token' },
    content: { name: 'New Item' },
})
public async post(request: IApiRequest, ...rest: any[]): Promise<IApiResponse> {
    // ...
}
```

---

## Typical Workflow

### 1. Add Examples to an Endpoint

Decorate each method handler with one or more `@example` decorators. Multiple decorators on the same method stack — the engine collects all of them:

```typescript
import { IHttp, IModify, IPersistence, IRead, HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    example,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
    IApiExample,
} from '@rocket.chat/apps-engine/definition/api';

export class OrdersEndpoint extends ApiEndpoint {
    public path = 'orders';

    @example({
        query: { limit: '10', status: 'pending' },
        headers: { 'x-api-key': 'your-api-key-here' },
    })
    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        const limit = parseInt(request.query.limit, 10) || 10;
        const status = request.query.status;

        const orders = await this.fetchOrders(read, status, limit);
        return this.success({ orders, total: orders.length });
    }

    @example({
        content: {
            customer: 'john.doe',
            items: [
                { product: 'widget', quantity: 2 },
                { product: 'gadget', quantity: 1 },
            ],
        },
        headers: { 'x-api-key': 'your-api-key-here' },
    })
    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        const body = request.content;

        if (!body || !body.customer || !body.items) {
            return this.json({
                status: HttpStatusCode.BAD_REQUEST,
                content: { error: 'Missing required fields: customer, items' },
            });
        }

        const order = await this.createOrder(body, persis);

        return this.json({
            status: HttpStatusCode.CREATED,
            content: { order },
        });
    }

    private async fetchOrders(read: IRead, status: string, limit: number): Promise<any[]> { return []; }
    private async createOrder(body: any, persis: IPersistence): Promise<any> { return body; }
}
```

### 2. Multiple Examples Per Method

You can stack multiple `@example` decorators to show different use cases (success paths, error cases, variations):

```typescript
@example({
    // Simple query — fetch all
    query: {},
})
@example({
    // Filtered query
    query: { status: 'active', limit: '50', offset: '0' },
})
@example({
    // Search query
    query: { q: 'widget', sort: 'createdAt', order: 'desc' },
})
public async get(
    request: IApiRequest,
    endpoint: IApiEndpointInfo,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persis: IPersistence
): Promise<IApiResponse> {
    // ...handler implementation
}
```

---

## Example (Complete Endpoint with Decorated Examples)

```typescript
import { IHttp, IModify, IPersistence, IRead, HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    example,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';

export class NotificationsEndpoint extends ApiEndpoint {
    public path = 'notifications';

    @example({
        headers: { 'authorization': 'Bearer your-secret-token' },
        query: { limit: '10', unread: 'true' },
    })
    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        // Validate token
        const auth = request.headers['authorization'];
        if (auth !== 'Bearer your-secret-token') {
            return { status: HttpStatusCode.UNAUTHORIZED };
        }

        const limit = parseInt(request.query.limit, 10) || 10;
        const unreadOnly = request.query.unread === 'true';

        const notifications = await this.getNotifications(read, unreadOnly, limit);

        return this.success({ notifications });
    }

    @example({
        headers: { 'authorization': 'Bearer your-secret-token' },
        content: {
            title: 'Deploy complete',
            message: 'Build #142 deployed to production successfully.',
            type: 'success',
            channels: ['general', 'dev-team'],
        },
    })
    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        const body = request.content;

        if (!body || !body.title || !body.message) {
            return this.json({
                status: HttpStatusCode.BAD_REQUEST,
                content: { error: 'Missing required fields: title, message' },
            });
        }

        try {
            await this.sendNotification(body, read, modify);
            return this.json({
                status: HttpStatusCode.CREATED,
                content: { success: true, title: body.title },
            });
        } catch (error) {
            return {
                status: HttpStatusCode.INTERNAL_SERVER_ERROR,
                content: { error: 'Failed to send notification' },
            };
        }
    }

    private async getNotifications(read: IRead, unreadOnly: boolean, limit: number): Promise<any[]> { return []; }
    private async sendNotification(body: any, read: IRead, modify: IModify): Promise<void> { }
}
```

---

## How the Engine Collects Examples

The `@example` decorator uses the following internal mechanism:

```typescript
// Simplified: what the @example decorator does internally
function example(options: IApiExample) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        target.examples = target.examples || {};
        target.examples[propertyKey] = options;
    };
}
```

The engine reads `target.examples` during endpoint registration and includes them in the `IApiEndpointMetadata`, which is then available for the marketplace API documentation rendering.

At registration time, the endpoint's metadata looks like:

```typescript
{
    path: 'notifications',
    computedPath: '/api/apps/public/app-id/notifications',
    methods: ['get', 'post'],
    examples: {
        get: { query: { limit: '10', unread: 'true' }, headers: { ... } },
        post: { content: { title: '...', message: '...' }, headers: { ... } },
    },
}
```

---

## Best Practices

- **Use realistic values in examples** — make them copy-paste usable for integrators.
- **Include auth headers/API keys** — show how to authenticate even though `ApiSecurity.UNSECURE` leaves it unenforced.
- **Show at least one example per endpoint method** — GET examples with query params, POST examples with body.
- **Use descriptive content** — the example body should clearly illustrate the expected data shape.
- **Stack multiple examples for different scenarios** — show common use cases (search, filter, paginate) and error cases.
- **Keep examples up to date** — when you change an endpoint's expected input, update the examples.

---

## Common Mistakes

- **Decorating a method that is never implemented** — the example won't show as available.
- **Using unrealistic placeholder values** — `'string'` or `123` are not helpful. Use realistic data.
- **Not including content examples for POST/PUT** — users need to know the expected body shape.
- **Forgetting to show required headers** — if your endpoint expects an `x-api-key` header, show it.
- **Stacking too many decorators on one method** — keep it to 3-5 meaningful examples.

---

## Related Topics

- [API Definition](./api-definition.md)
- [API Endpoint](./api-endpoint.md)
- [API Request & Response](./api-request-response.md)
