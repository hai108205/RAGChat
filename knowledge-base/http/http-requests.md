# HTTP Requests

The Apps Engine provides an HTTP client for making outbound requests. The `IHttp` interface is available via `IAppAccessors.http` or injected into handler methods.

---

## Making Requests

```typescript
// Available via handler methods: http.get(url, options?)
const response = await http.get('https://api.example.com/data');

// In your App class initialize():
protected async initialize(configuration: IConfigurationExtend): Promise<void> {
    const http = this.getAccessors().http;
    // use http here
}
```

### GET

```typescript
// Simple GET
const resp = await http.get('https://api.example.com/items');

// GET with query string and headers
const resp = await http.get('https://api.example.com/items', {
    query: 'page=1&limit=10',
    headers: { 'X-API-Key': 'my-key' },
});
```

### POST

```typescript
const resp = await http.post('https://api.example.com/items', {
    data: { name: 'New Item', price: 99 },
    headers: { 'Content-Type': 'application/json' },
});
```

### PUT

```typescript
const resp = await http.put('https://api.example.com/items/42', {
    data: { name: 'Updated Item' },
});
```

### DELETE

```typescript
const resp = await http.del('https://api.example.com/items/42');
```

### PATCH

```typescript
const resp = await http.patch('https://api.example.com/items/42', {
    data: { price: 149 },
});
```

---

## IHttpRequest Options

| Option | Type | Description |
|---|---|---|
| `content` | `string` | Raw request body string (overrides `data`) |
| `data` | `any` | Request body (object, array, etc.) |
| `query` | `string` | URL query string (e.g. `'page=1&limit=10'`) |
| `params` | `{ [key: string]: string }` | URL query parameters as an object |
| `auth` | `string` | Basic auth string: `'username:password'` |
| `headers` | `{ [key: string]: string }` | Request headers |
| `timeout` | `number` | Request timeout in milliseconds |
| `encoding` | `string \| null` | Response encoding. `null` returns a Buffer for binary data. Default: utf8 |
| `strictSSL` | `boolean` | Require valid SSL certificates. Default: `true` |
| `rejectUnauthorized` | `boolean` | Verify server cert against supplied CAs. Default: `true` |
| `ssrfValidation` | `boolean` | Enable Server-Side Request Forgery protection. Default: `false` |

---

## Handling Responses

```typescript
interface IHttpResponse {
    url: string;             // Final URL after redirects
    method: RequestMethod;   // HTTP method used
    statusCode: number;      // HTTP status code
    headers?: { [key: string]: string };
    content?: string;        // Response body as string
    data?: any;              // Parsed JSON if Content-Type is JSON
}

// Example
const resp = await http.get('https://api.example.com/items/42');
if (resp.statusCode === 200) {
    const item = resp.data; // parsed JSON object
    console.log(item.name);
} else if (resp.statusCode === 404) {
    console.log('Not found');
} else {
    console.log(`Error: ${resp.statusCode} - ${resp.content}`);
}
```

### HttpStatusCode Enum

Available for readable status code checks:

```typescript
import { HttpStatusCode } from '@rocket.chat/apps-engine/definition/accessors';

if (resp.statusCode === HttpStatusCode.OK) { /* 200 */ }
if (resp.statusCode === HttpStatusCode.CREATED) { /* 201 */ }
if (resp.statusCode === HttpStatusCode.NOT_FOUND) { /* 404 */ }
if (resp.statusCode === HttpStatusCode.INTERNAL_SERVER_ERROR) { /* 500 */ }
if (resp.statusCode === HttpStatusCode.TOO_MANY_REQUESTS) { /* 429 */ }
```

---

## Error Handling

```typescript
try {
    const resp = await http.get('https://api.example.com/data', {
        timeout: 5000,
    });
    if (resp.statusCode >= 400) {
        throw new Error(`API error: ${resp.statusCode} ${resp.content}`);
    }
    return resp.data;
} catch (err) {
    // Network errors, timeouts, DNS failures
    this.getLogger().error('HTTP request failed', err);
    return null;
}
```

---

## SSRF Protection

Enable SSRF validation to prevent your app from being tricked into making requests to internal/private IP addresses.

```typescript
const resp = await http.get(url, {
    ssrfValidation: true, // Block internal IPs and private networks
});
```

If the target URL resolves to a private/internal IP, the request is aborted.

---

## SSL Options

```typescript
// Disable SSL verification entirely (insecure -- use only for testing)
const resp = await http.get(url, {
    strictSSL: false,
    rejectUnauthorized: false,
});
```

---

## Timeout Handling

```typescript
const resp = await http.get('https://slow-api.example.com', {
    timeout: 10000, // milliseconds
});
```

If the request exceeds the timeout, the promise rejects with a timeout error.

---

## IHttpExtend: Global Request Customization

`IHttpExtend` lets you configure default headers, query params, and pre/post-request hooks. Available during `initialize()` via `IConfigurationExtend.http`.

### Default Headers

```typescript
protected async initialize(configuration: IConfigurationExtend): Promise<void> {
    // Single header
    configuration.http.provideDefaultHeader('Authorization', 'Bearer my-token');

    // Multiple headers
    configuration.http.provideDefaultHeaders({
        'X-App-Version': this.getVersion(),
        'Accept': 'application/json',
    });
}
```

### Default Query Parameters

```typescript
configuration.http.provideDefaultParam('format', 'json');
configuration.http.provideDefaultParams({ lang: 'en', tz: 'UTC' });
```

### Pre-Request Handler (add auth tokens, transform requests)

```typescript
import { IHttpPreRequestHandler, IHttpRequest, IRead, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';

class AuthHandler implements IHttpPreRequestHandler {
    async executePreHttpRequest(
        url: string,
        request: IHttpRequest,
        read: IRead,
        persistence: IPersistence,
    ): Promise<IHttpRequest> {
        // Add auth token to every request
        request.headers = request.headers || {};
        request.headers['Authorization'] = 'Bearer ' + (await this.getToken());
        return request;
    }

    private async getToken(): Promise<string> {
        // Fetch token from persistence or generate it
        return 'dynamic-token';
    }
}

// Register during initialization:
configuration.http.providePreRequestHandler(new AuthHandler());
```

### Pre-Response Handler (transform/validate responses)

```typescript
import { IHttpPreResponseHandler, IHttpResponse, IRead, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';

class LoggingHandler implements IHttpPreResponseHandler {
    async executePreHttpResponse(
        response: IHttpResponse,
        read: IRead,
        persistence: IPersistence,
    ): Promise<IHttpResponse> {
        console.log(`[HTTP] ${response.method} ${response.url} -> ${response.statusCode}`);
        return response;
    }
}

configuration.http.providePreResponseHandler(new LoggingHandler());
```

---

## Complete Example: REST API Client

```typescript
import {
    IHttp,
    IHttpRequest,
    IHttpResponse,
    IHttpPreRequestHandler,
    IHttpPreResponseHandler,
    HttpStatusCode,
    IRead,
    IPersistence,
    IModify,
    IConfigurationExtend,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IApp } from '@rocket.chat/apps-engine/definition/IApp';
import { App } from '@rocket.chat/apps-engine/definition/App';

class TokenInjector implements IHttpPreRequestHandler {
    private token = '';

    setToken(token: string) { this.token = token; }

    async executePreHttpRequest(
        url: string, request: IHttpRequest, read: IRead, persistence: IPersistence,
    ): Promise<IHttpRequest> {
        request.headers = request.headers || {};
        request.headers['Authorization'] = `Bearer ${this.token}`;
        request.headers['Content-Type'] = 'application/json';
        return request;
    }
}

class ErrorValidator implements IHttpPreResponseHandler {
    async executePreHttpResponse(
        response: IHttpResponse, read: IRead, persistence: IPersistence,
    ): Promise<IHttpResponse> {
        if (response.statusCode >= 400 && response.statusCode !== HttpStatusCode.NOT_FOUND) {
            const logger = read.getEnvironmentReader().getLogger();
            logger.error(`HTTP ${response.statusCode} from ${response.url}: ${response.content}`);
        }
        return response;
    }
}

class ApiClient {
    constructor(
        private http: IHttp,
        private baseUrl: string,
    ) {}

    async get<T>(path: string, params?: Record<string, string>): Promise<T | null> {
        const query = params ? new URLSearchParams(params).toString() : undefined;
        const resp = await this.http.get(`${this.baseUrl}${path}`, { query, timeout: 10000 });
        if (resp.statusCode === HttpStatusCode.OK) return resp.data as T;
        if (resp.statusCode === HttpStatusCode.NOT_FOUND) return null;
        throw new Error(`API error: ${resp.statusCode}`);
    }

    async post<T>(path: string, data: unknown): Promise<T> {
        const resp = await this.http.post(`${this.baseUrl}${path}`, { data, timeout: 10000 });
        if (resp.statusCode === HttpStatusCode.CREATED || resp.statusCode === HttpStatusCode.OK) {
            return resp.data as T;
        }
        throw new Error(`API error: ${resp.statusCode}`);
    }

    async put<T>(path: string, data: unknown): Promise<T> {
        const resp = await this.http.put(`${this.baseUrl}${path}`, { data, timeout: 10000 });
        if (resp.statusCode === HttpStatusCode.OK) return resp.data as T;
        throw new Error(`API error: ${resp.statusCode}`);
    }

    async del(path: string): Promise<void> {
        const resp = await this.http.del(`${this.baseUrl}${path}`, { timeout: 10000 });
        if (resp.statusCode >= 400) throw new Error(`DELETE failed: ${resp.statusCode}`);
    }
}

// Usage in your App:
export class MyApp extends App implements IApp {
    private tokenInjector = new TokenInjector();
    private errorValidator = new ErrorValidator();

    protected async initialize(configuration: IConfigurationExtend): Promise<void> {
        configuration.http.providePreRequestHandler(this.tokenInjector);
        configuration.http.providePreResponseHandler(this.errorValidator);
        configuration.http.provideDefaultHeader('Accept', 'application/json');
    }

    // In a handler:
    // const client = new ApiClient(http, 'https://api.example.com/v1');
    // const items = await client.get<Item[]>('/items');
}
```
