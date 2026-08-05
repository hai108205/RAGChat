# Cloud Workspace Read

## Purpose

`ICloudWorkspaceRead` provides apps with access to Rocket.Chat Cloud workspace tokens. Use it to authenticate API calls to Rocket.Chat Cloud services on behalf of the workspace.

---

## Overview

The cloud workspace read accessor exposes a single method: `getWorkspaceToken(scope)`. It returns an `IWorkspaceToken` containing a bearer token and expiration date. This token can be used to call Cloud Services APIs (e.g., push notification gateway, marketplace, license verification).

The accessor connects to Rocket.Chat Cloud, so it does not work in air-gapped (fully offline) environments.

---

## When To Use

- Calling Rocket.Chat Cloud APIs from an app
- Verifying workspace license or registration status
- Accessing cloud-managed services (push notifications, marketplace data)

---

## Interfaces

### ICloudWorkspaceRead

```typescript
export interface ICloudWorkspaceRead {
    getWorkspaceToken(scope: string): Promise<IWorkspaceToken>;
}
```

Available via `read.getCloudWorkspaceReader()`.

| Method | Description |
|--------|-------------|
| `getWorkspaceToken(scope)` | Returns a workspace-scoped access token for calling Cloud Services |

**Requires permission:** `cloud.workspace-token` with scopes matching the requested scope.

### IWorkspaceToken

```typescript
export interface IWorkspaceToken {
    token: string;
    expiresAt: Date;
}
```

| Field | Description |
|-------|-------------|
| `token` | The bearer token for authenticating to Cloud Services |
| `expiresAt` | When the token expires |

---

## Usage

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function callCloudService(read: IRead): Promise<void> {
    const cloudReader = read.getCloudWorkspaceReader();

    const { token, expiresAt } = await cloudReader.getWorkspaceToken('push-notifications');

    const response = await read.getHttp().get('https://cloud.rocket.chat/api/v1/push/send', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        params: {
            // ... push notification payload
        },
    });
}
```

---

## Limitations

- The surface area is minimal -- only `getWorkspaceToken`. There is no interface to query workspace registration status, license details, or cloud connectivity state directly. Those must be inferred from the ability to obtain a token.
- The accessor requires network access to Rocket.Chat Cloud. In air-gapped environments, calls will fail.
- Only one method is exposed. For richer cloud interactions, apps should use the token to call Cloud APIs directly via `IHttp`.
