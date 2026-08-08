# IHttp Accessor

## Purpose

`IHttp` provides HTTP client capabilities to Rocket.Chat Apps. It enables making outbound HTTP requests to external web services — REST APIs, webhooks, third-party integrations. Built on Meteor's HTTP package conventions.

---

## Overview

`IHttp` exposes 5 HTTP verb methods (`get`, `post`, `put`, `del`, `patch`), each accepting a URL and an optional `IHttpRequest` configuration. All methods return `Promise<IHttpResponse>`.

`IHttpExtend` allows pre-configuring defaults (headers, query params, pre-request/pre-response handlers) applied to every request. The `HttpStatusCode` enum provides named constants for all standard HTTP status codes. SSRF protection is available via `ssrfValidation`.

---

## When To Use

- Calling external REST APIs from an App
- Sending data to webhooks (Slack, Discord, etc.)
- Fetching external data (weather, CRM, issue trackers)
- Integrating with third-party services
- Proxying requests through authentication middleware (via `IHttpExtend` pre-request handlers)

---

## Important Interfaces

### IHttp

| Method | Signature | Returns |
|--------|-----------|---------|
| `get` | `(url: string, options?: IHttpRequest)` | `Promise<IHttpResponse>` |
| `post` | `(url: string, options?: IHttpRequest)` | `Promise<IHttpResponse>` |
| `put` | `(url: string, options?: IHttpRequest)` | `Promise<IHttpResponse>` |
| `del` | `(url: string, options?: IHttpRequest)` | `Promise<IHttpResponse>` |
| `patch` | `(url: string, options?: IHttpRequest)` | `Promise<IHttpResponse>` |

### IHttpRequest

| Property | Type | Description |
|----------|------|-------------|
| `content` | `string` | Raw request body content |
| `data` | `any` | Data to be serialized as request body (objects serialized automatically) |
| `query` | `string` | URL query string |
| `params` | `{ [key: string]: string }` | URL parameters for route substitution |
| `auth` | `string` | Authorization header value (e.g., `"Bearer token123"`) |
| `headers` | `{ [key: string]: string }` | Custom HTTP headers |
| `timeout` | `number` | Request timeout in milliseconds |
| `encoding` | `string \| null` | Response body encoding. If `null`, body returned as Buffer. Default: `'utf8'` |
| `strictSSL` | `boolean` | If `true`, requires valid SSL certificates. Default: `true` |
| `rejectUnauthorized` | `boolean` | If `true`, verifies server certificate against supplied CAs. Default: `true` |
| `ssrfValidation` | `boolean` | If `true`, enables SSRF protection against internal/private network requests. Default: `false` |

### IHttpResponse

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | The final URL after redirects |
| `method` | `RequestMethod` | The HTTP method used |
| `statusCode` | `number` | HTTP status code |
| `headers` | `{ [key: string]: string }` | Response headers |
| `content` | `string` | Response body as string |
| `data` | `any` | Parsed response body (JSON automatically parsed if applicable) |

### RequestMethod Enum

```typescript
enum RequestMethod {
    GET = 'get',
    POST = 'post',
    PUT = 'put',
    DELETE = 'delete',
    HEAD = 'head',
    OPTIONS = 'options',
    PATCH = 'patch',
}
```

### HttpStatusCode Enum

All standard HTTP status codes as named constants:

| Category | Members |
|----------|---------|
| 1xx Informational | `CONTINUE` (100), `SWITCHING_PROTOCOLS` (101) |
| 2xx Success | `OK` (200), `CREATED` (201), `ACCEPTED` (202), `NON_AUTHORITATIVE_INFORMATION` (203), `NO_CONTENT` (204), `RESET_CONTENT` (205), `PARTIAL_CONTENT` (206) |
| 3xx Redirection | `MULTIPLE_CHOICES` (300), `MOVED_PERMANENTLY` (301), `FOUND` (302), `SEE_OTHER` (303), `NOT_MODIFIED` (304), `USE_PROXY` (305), `TEMPORARY_REDIRECT` (307) |
| 4xx Client Error | `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `PAYMENT_REQUIRED` (402), `FORBIDDEN` (403), `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `NOT_ACCEPTABLE` (406), `PROXY_AUTHENTICATION_REQUIRED` (407), `REQUEST_TIMEOUT` (408), `CONFLICT` (409), `GONE` (410), `LENGTH_REQUIRED` (411), `PRECONDITION_FAILED` (412), `REQUEST_ENTITY_TOO_LARGE` (413), `REQUEST_URI_TOO_LONG` (414), `UNSUPPORTED_MEDIA_TYPE` (415), `REQUESTED_RANGE_NOT_SATISFIABLE` (416), `EXPECTATION_FAILED` (417), `UNPROCESSABLE_ENTITY` (422), `TOO_MANY_REQUESTS` (429) |
| 5xx Server Error | `INTERNAL_SERVER_ERROR` (500), `NOT_IMPLEMENTED` (501), `BAD_GATEWAY` (502), `SERVICE_UNAVAILABLE` (503), `GATEWAY_TIMEOUT` (504), `HTTP_VERSION_NOT_SUPPORTED` (505) |

### IHttpExtend

Methods for pre-configuring defaults applied to every request:

| Method | Signature | Purpose |
|--------|-----------|---------|
| `provideDefaultHeader` | `(key: string, value: string): void` | Add one default header to all requests |
| `provideDefaultHeaders` | `(headers: { [key: string]: string }): void` | Add multiple default headers |
| `provideDefaultParam` | `(key: string, value: string): void` | Add one default query parameter |
| `provideDefaultParams` | `(params: { [key: string]: string }): void` | Add multiple default query parameters |
| `providePreRequestHandler` | `(handler: IHttpPreRequestHandler): void` | Register a handler called before each request |
| `providePreResponseHandler` | `(handler: IHttpPreResponseHandler): void` | Register a handler called after each response |
| `getDefaultHeaders` | `(): Map<string, string>` | Get read-only map of default headers |
| `getDefaultParams` | `(): Map<string, string>` | Get read-only map of default params |
| `getPreRequestHandlers` | `(): Array<IHttpPreRequestHandler>` | Get read-only array of pre-request handlers |
| `getPreResponseHandlers` | `(): Array<IHttpPreResponseHandler>` | Get read-only array of pre-response handlers |

### IHttpPreRequestHandler

```typescript
interface IHttpPreRequestHandler {
    executePreHttpRequest(
        url: string,
        request: IHttpRequest,
        read: IRead,
        persistence: IPersistence
    ): Promise<IHttpRequest>;
}
```

Called before every request reaches the destination. Can modify the request. If it throws, the request is aborted. Multiple handlers execute in registration order.

### IHttpPreResponseHandler

```typescript
interface IHttpPreResponseHandler {
    executePreHttpResponse(
        response: IHttpResponse,
        read: IRead,
        persistence: IPersistence
    ): Promise<IHttpResponse>;
}
```

Called after a response is received but before it is returned to the caller. Can inspect or transform the response. If it throws, the response is not returned. Multiple handlers execute in registration order.

---

## Typical Workflow

1. Receive `http: IHttp` in a lifecycle hook or event handler
2. Call the appropriate HTTP method (`http.get()`, `http.post()`, etc.)
3. Pass the URL and optional `IHttpRequest` configuration
4. `await` the returned `Promise<IHttpResponse>`
5. Check `response.statusCode` and process `response.data` or `response.content`

---

## Examples

### Simple GET Request

```typescript
import { IHttp, IHttpResponse, HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';

async function fetchUserData(http: IHttp, userId: string): Promise<any> {
    const response: IHttpResponse = await http.get(
        `https://api.example.com/users/${userId}`,
        {
            headers: {
                'Accept': 'application/json',
            },
        }
    );

    if (response.statusCode !== HttpStatusCode.OK) {
        throw new Error(`API returned ${response.statusCode}`);
    }

    return response.data;
}
```

### POST with JSON Body

```typescript
async function createIssue(
    http: IHttp,
    title: string,
    description: string,
): Promise<string> {
    const response = await http.post(
        'https://api.example.com/issues',
        {
            headers: {
                'Content-Type': 'application/json',
            },
            data: {
                title: title,
                description: description,
                priority: 'high',
            },
        }
    );

    if (response.statusCode !== HttpStatusCode.CREATED) {
        throw new Error(`Failed to create issue: ${response.statusCode}`);
    }

    // response.data is automatically parsed JSON
    return response.data.id;
}
```

### Authenticated Request with Error Handling

```typescript
async function callSecureApi(http: IHttp, apiKey: string): Promise<any> {
    const response = await http.get(
        'https://api.example.com/secure-data',
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'X-API-Version': 'v2',
            },
            timeout: 5000,  // 5 second timeout
        }
    );

    switch (response.statusCode) {
        case HttpStatusCode.OK:
            return response.data;
        case HttpStatusCode.UNAUTHORIZED:
            throw new Error('Invalid API key');
        case HttpStatusCode.FORBIDDEN:
            throw new Error('Insufficient permissions');
        case HttpStatusCode.TOO_MANY_REQUESTS:
            throw new Error('Rate limited — retry after ' + response.headers['retry-after']);
        case HttpStatusCode.INTERNAL_SERVER_ERROR:
            throw new Error('External API is experiencing issues');
        default:
            throw new Error(`Unexpected status: ${response.statusCode}`);
    }
}
```

### Using IHttpExtend for Default Headers and Auth

```typescript
import { IHttpExtend, IHttpPreRequestHandler } from '@rocket.chat/apps-engine/definition/accessors';

async function configureHttpDefaults(httpExtend: IHttpExtend, apiToken: string): Promise<void> {
    // Add default headers for all requests
    httpExtend.provideDefaultHeaders({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
    });

    // Add a default query parameter to all URLs
    httpExtend.provideDefaultParam('api_version', 'v2');
}
```

### SSRF Protection

```typescript
// Enable SSRF validation to prevent requests to internal/private IPs
const response = await http.get('https://api.example.com/data', {
    ssrfValidation: true,
});
```

---

## Best Practices

- **Use `HttpStatusCode` enum** — Avoid magic numbers. `HttpStatusCode.OK` is safer than `200`.
- **Set timeouts** — External services can hang. Always set a `timeout`.
- **Handle errors by status code range** — Check `response.statusCode` before accessing `response.data`.
- **Use `encoding: null` for binary data** — Ensures `response.content` is a Buffer, not a string.
- **Use `ssrfValidation: true` when calling user-supplied URLs** — Protects against Server-Side Request Forgery attacks.
- **Use `IHttpExtend` for shared headers/auth** — Call `provideDefaultHeader()` once in `initialize()` instead of repeating headers in every request.
- **Use `providePreRequestHandler` for dynamic auth** — Rotating tokens or request signing logic belongs in a pre-request handler.

---

## Common Mistakes

- **Not checking `statusCode`** → HTTP doesn't throw on non-2xx statuses. Always validate the response.
- **Assuming `response.data` is your type** → Parse failures or non-JSON responses cause `response.data` to be `undefined`. Always check.
- **Forgetting to `await`** → All HTTP methods return `Promise<IHttpResponse>`. A floating promise means the response is never handled.
- **Enabling `ssrfValidation` for internal services** → SSRF validation blocks requests to private IPs. If you legitimately need to call an internal service, leave it `false`.
- **Overwriting default headers per-request** → IHttpRequest `headers` are merged with defaults. Use distinct header keys to avoid conflicts.

---

## Related Topics

- [IRead Accessor](./i-read-accessor.md)
- [IPersistence Accessor](./i-persistence-accessor.md)
- [App Lifecycle](../../../packages/apps-engine/src/definition/App.ts)
