# API Endpoint App

## Architecture

A REST API endpoint app that exposes two public endpoints: a GET handler that returns the room count the App has seen, and a POST handler that records a visit to a room. Demonstrates registering an API via `IApiExtend`, implementing `ApiEndpoint` subclass with `get()` and `post()`, parsing `IApiRequest`, building `IApiResponse`, checking user authentication, using the `@example` decorator, and persisting data across requests.

**Key concept**: API endpoints run outside the chat context -- they are HTTP handlers that receive JSON requests and return JSON responses. Authentication is the App's responsibility. The endpoint path is prefixed with `/api/apps/public/<app-id>/` for public endpoints.

## Folder Structure

```
api-endpoint-app/
  app.json
  app.ts
  endpoints/
    RoomStatsEndpoint.ts
```

## Flow

1. App registers the endpoint in `extendConfiguration()` via `configuration.api.provideApi()`
2. Engine mounts the endpoint at `/api/apps/public/<app-id>/room-stats`
3. External client sends `GET /api/apps/public/<app-id>/room-stats?limit=10`
4. Engine calls `RoomStatsEndpoint.get(request, endpoint, read, modify, http, persis)`
5. GET handler reads persisted stats from `persis.readByAssociation()`
6. Returns JSON array with status 200
7. External client sends `POST /api/apps/public/<app-id>/room-stats` with body `{ "roomId": "GENERAL", "roomName": "general" }`
8. Engine calls `RoomStatsEndpoint.post(request, endpoint, read, modify, http, persis)`
9. POST handler validates body, checks auth via `request.user`, stores via `persis.updateByAssociation()`
10. Returns status 201 with the created record

## Implementation

### app.json

```json
{
    "id": "c2b3d4e5-f6a7-8901-bcde-f12345678901",
    "version": "1.0.0",
    "requiredApiVersion": "^2.4.0",
    "iconFile": "icon.png",
    "author": {
        "name": "Your Name",
        "homepage": "https://example.com",
        "support": "https://example.com/support"
    },
    "name": "Room Stats API",
    "nameSlug": "room-stats-api",
    "classFile": "app.ts",
    "description": "Exposes a REST API to track and query room visit statistics.",
    "implements": []
}
```

### endpoints/RoomStatsEndpoint.ts

```typescript
import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    example,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';

interface RoomVisitRecord {
    roomId: string;
    roomName: string;
    visitedAt: string;
    visitedBy: string;
    visitCount: number;
}

export class RoomStatsEndpoint extends ApiEndpoint {
    public path = 'room-stats';

    @example({
        query: { limit: '10' },
    })
    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<IApiResponse> {
        if (!request.user) {
            return {
                status: 401,
                content: { error: 'Authentication required.' },
            };
        }

        const limit =
            parseInt(request.query.limit as string, 10) || 50;

        const records = await this.getStats(read);

        const sorted = records
            .sort(
                (a, b) =>
                    new Date(b.visitedAt).getTime() -
                    new Date(a.visitedAt).getTime(),
            )
            .slice(0, limit);

        return this.json({
            status: 200,
            content: { total: records.length, limit, records: sorted },
        });
    }

    @example({
        content: {
            roomId: 'GENERAL',
            roomName: 'general',
        },
    })
    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<IApiResponse> {
        if (!request.user) {
            return {
                status: 401,
                content: { error: 'Authentication required.' },
            };
        }

        const body = request.content;
        if (!body || typeof body !== 'object') {
            return this.json({
                status: 400,
                content: { error: 'Request body is required.' },
            });
        }

        const { roomId, roomName } = body;
        if (!roomId || !roomName) {
            return this.json({
                status: 400,
                content: {
                    error: 'Missing required fields: roomId, roomName.',
                },
            });
        }

        const record: RoomVisitRecord = {
            roomId,
            roomName,
            visitedAt: new Date().toISOString(),
            visitedBy: request.user.username,
            visitCount: 1,
        };

        // Check if a record for this room already exists
        const existing = await this.findExisting(read, roomId);

        if (existing) {
            existing.data.visitCount += 1;
            existing.data.visitedAt = record.visitedAt;
            existing.data.visitedBy = record.visitedBy;

            // Build an association so we can update by it
            const assoc = new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                roomId,
            );
            await persis.updateByAssociation(assoc, existing.data, true);

            return this.json({
                status: 200,
                content: { record: existing.data },
            });
        }

        // Create a new record associated with the room
        await persis.createWithAssociation(
            record,
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                roomId,
            ),
        );

        return this.json({
            status: 201,
            content: { record },
        });
    }

    private async getStats(
        read: IRead,
    ): Promise<RoomVisitRecord[]> {
        const persisRead = read.getPersistenceReader();
        const items = await persisRead.readByAssociation(
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                'room-stats',
            ),
        );
        return items.map((item) => item.data as RoomVisitRecord);
    }

    private async findExisting(
        read: IRead,
        roomId: string,
    ): Promise<{ data: RoomVisitRecord } | undefined> {
        const persisRead = read.getPersistenceReader();
        const items = await persisRead.readByAssociation(
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                roomId,
            ),
        );
        return items.length > 0
            ? ({ data: items[0].data as RoomVisitRecord })
            : undefined;
    }
}
```

### app.ts

```typescript
import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ApiSecurity, ApiVisibility } from '@rocket.chat/apps-engine/definition/api';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

import { RoomStatsEndpoint } from './endpoints/RoomStatsEndpoint';

export class RoomStatsApiApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [new RoomStatsEndpoint()],
        });
    }
}
```

## Best Practices

- **Check `request.user` for authentication**. Even for public APIs, validate that a user context exists before serving data. Return 401 if `request.user` is undefined.
- **Use `this.json()` for consistent responses**. The built-in helper wraps your content with proper headers.
- **Use `this.success()` as a shorthand** for `this.json({ status: 200, content })`.
- **Always validate the body in POST/PUT handlers**. `request.content` can be `undefined` -- check type and required fields before processing.
- **Use `IPersistence` for cross-request state**. Persistence is the only stateful mechanism available to Apps. Design your data model around association keys.
- **Use the `@example` decorator** on each handler method. It populates API documentation in the Marketplace and helps integrators understand the expected request shape.
- **Use `persis.updateByAssociation()` with `upsert: true`** for idempotent writes. Safe for first-time and repeat writes alike.
- **Handle edge cases in persistence**: data may be `undefined` on first read, array elements may shift. Always return sane defaults (empty array, `undefined`).

## Related Topics

- [API Definition](../api/api-definition.md)
- [API Endpoint](../api/api-endpoint.md)
- [API Request & Response](../api/api-request-response.md)
- [API Examples](../api/api-examples.md)
- [IPersistence Accessor](../accessors/i-persistence-accessor.md)
- [App Configuration](../app/app-configuration.md)
