# OAuth2 Client (IOAuth2Client)

## Purpose

`IOAuth2Client` implements the OAuth2 authorization code flow for Rocket.Chat apps. It auto-creates settings for client credentials, auto-registers a callback endpoint, handles token exchange/refresh/revoke, and persists tokens per user. Created via the `createOAuth2Client` factory function.

---

## Overview

A Rocket.Chat app that needs to call a third-party API on behalf of a user must first obtain the user's authorization. The OAuth2 client handles the entire lifecycle:

1. **Setup** -- registers API endpoint (`{alias}-callback`) and settings (`{alias}-oauth-client-id`, `{alias}-oauth-clientsecret`)
2. **Authorization URL** -- builds the redirect URL pointing to the provider's authorization endpoint
3. **Callback handler** -- receives the authorization code, exchanges it for tokens, fires `authorizationCallback`, persists token
4. **Token retrieval** -- reads persisted token for a user
5. **Token refresh** -- uses the refresh token to get a new access token
6. **Token revocation** -- revokes the token at the provider and removes it from persistence

---

## When To Use

- Connecting to GitHub, Google, GitLab, or any OAuth2-compliant API on behalf of a user
- Any app that needs per-user access tokens for third-party services
- Services that require refresh-token rotation
- Building slash commands or UI elements that act on external data

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IOAuth2Client` | OAuth2 client contract | `setup`, `getUserAuthorizationUrl`, `getAccessTokenForUser`, `refreshUserAccessToken`, `revokeUserAccessToken` |
| `IOAuth2ClientOptions` | Client configuration | `alias`, `accessTokenUri`, `authUri`, `refreshTokenUri`, `revokeTokenUri`, `defaultScopes`, `authorizationCallback` |
| `IAuthData` | Token data returned after exchange | `token`, `expiresAt`, `scope`, `refreshToken` |
| `OAuth2Client` | Concrete implementation | All IOAuth2Client methods + internal token persistence |
| `GrantType` | Enum of grant types | `RefreshToken`, `AuthorizationCode` |
| `createOAuth2Client` | Factory function | `(app, options) => OAuth2Client` |

---

## IOAuth2ClientOptions

```typescript
export interface IOAuth2ClientOptions {
    alias: string;
    accessTokenUri: string;
    authUri: string;
    refreshTokenUri: string;
    revokeTokenUri: string;
    defaultScopes?: Array<string>;
    authorizationCallback?: (
        token: IAuthData | undefined,
        user: IUser,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ) => Promise<{ responseContent?: string } | undefined>;
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `alias` | Yes | Unique identifier for this OAuth2 client. Used as prefix for settings (`{alias}-oauth-client-id`, `{alias}-oauth-clientsecret`) and callback path (`{alias}-callback`). Avoids collisions when multiple OAuth2 clients exist. |
| `accessTokenUri` | Yes | Provider endpoint for exchanging an authorization code for an access token (e.g., `https://github.com/login/oauth/access_token`) |
| `authUri` | Yes | Provider endpoint where the user is redirected to authorize the app (e.g., `https://github.com/login/oauth/authorize`) |
| `refreshTokenUri` | Yes | Provider endpoint for refreshing an expired access token using a refresh token |
| `revokeTokenUri` | Yes | Provider endpoint for revoking an access token |
| `defaultScopes` | No | Scopes always included when requesting authorization. User can pass additional scopes to `getUserAuthorizationUrl`. |
| `authorizationCallback` | No | Called after the provider redirects back to the callback endpoint. Receives the `IAuthData` (or `undefined` if the user denied authorization). Can return custom HTML in `responseContent` to display to the user. |

### i18n Requirements

After calling `setup()`, the app must provide translations for the auto-created settings. For `alias = 'github'`:

```json
{
    "github-oauth-client-id": "Client ID to connect to Github",
    "github-oauth-client-secret": "Client secret to connect to Github"
}
```

---

## IOAuth2Client Methods

### `setup(configuration: IConfigurationExtend): Promise<void>`

Call once during `extendConfiguration`. Creates:

- A public, unsecure API endpoint at `/{alias}-callback` (handles the OAuth redirect)
- Two settings: `{alias}-oauth-client-id` (STRING) and `{alias}-oauth-clientsecret` (STRING)

```typescript
public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
    await oauth2Client.setup(configuration);
}
```

### `getUserAuthorizationUrl(user: IUser, scopes?: Array<string>): Promise<URL>`

Builds the authorization URL the user must visit to grant access. The URL includes:

- `response_type=code`
- `redirect_uri={siteUrl}/{callbackPath}` (auto-computed)
- `state={user.id}` (used in callback to identify the user)
- `client_id={setting value}`
- `access_type=offline`
- `scope={defaultScopes + scopes}` (space-separated)

```typescript
const url = await oauth2Client.getUserAuthorizationUrl(user, ['repo', 'read:org']);
// Redirect the user to url.href
```

### `getAccessTokenForUser(user: IUser): Promise<IAuthData | undefined>`

Reads the persisted token for a user. Returns `undefined` if the user has not yet authorized.

The token is stored via `RocketChatAssociationModel.USER` + `RocketChatAssociationModel.MISC` with the record key `{alias}-oauth-connection`.

```typescript
const authData = await oauth2Client.getAccessTokenForUser(user);
if (authData) {
    // Use authData.token to call the provider API
}
```

### `refreshUserAccessToken(user: IUser, persis: IPersistence): Promise<IAuthData | undefined>`

Uses the stored refresh token to obtain a new access token from the provider. Throws if no token exists or if the token has no refresh token. Persists the new token automatically.

```typescript
try {
    const newAuthData = await oauth2Client.refreshUserAccessToken(user, persis);
} catch (error) {
    // Token refresh failed -- user may need to re-authorize
}
```

### `revokeUserAccessToken(user: IUser, persis: IPersistence): Promise<boolean>`

Revokes the access token at the provider and removes it from local persistence. Returns `true` on success, `false` on failure.

```typescript
const revoked = await oauth2Client.revokeUserAccessToken(user, persis);
```

---

## IAuthData

```typescript
export interface IAuthData {
    token: string;          // Access token from the provider
    expiresAt: number;      // Token expiration time in seconds
    scope: string;          // Authorized scopes (space-separated)
    refreshToken?: string;  // Token for obtaining a new access token (not all providers)
}
```

---

## GrantType Enum

```typescript
export enum GrantType {
    RefreshToken = 'refresh_token',
    AuthorizationCode = 'authorization_code',
}
```

Used internally by `OAuth2Client` when exchanging codes and refreshing tokens. Apps generally do not need to use this directly.

---

## createOAuth2Client

```typescript
export function createOAuth2Client(app: App, options: IOAuth2ClientOptions): OAuth2Client;
```

Placeholder factory. Currently just instantiates `OAuth2Client`, but reserves the ability to inject internal dependencies in the future. Always use this instead of `new OAuth2Client(...)`.

```typescript
import { createOAuth2Client } from '@rocket.chat/apps-engine/definition/oauth2/OAuth2';

const githubClient = createOAuth2Client(app, {
    alias: 'github',
    accessTokenUri: 'https://github.com/login/oauth/access_token',
    authUri: 'https://github.com/login/oauth/authorize',
    refreshTokenUri: 'https://github.com/login/oauth/access_token',
    revokeTokenUri: 'https://api.github.com/applications/{client_id}/token',
    defaultScopes: ['repo', 'read:org'],
    authorizationCallback: async (token, user, read, modify, http, persis) => {
        if (!token) {
            return { responseContent: '<h1>Authorization denied</h1>' };
        }
        // Store extra data, notify the user, etc.
        return { responseContent: '<h1>Authorization successful!</h1>' };
    },
});
```

---

## Complete Token Lifecycle Example

```typescript
import { App } from '@rocket.c hat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { createOAuth2Client, OAuth2Client } from '@rocket.chat/apps-engine/definition/oauth2/OAuth2';
import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

export class MyApp extends App implements ISlashCommand {
    private oauth2: OAuth2Client;

    constructor(info: IAppInfo) {
        super(info);
        this.oauth2 = createOAuth2Client(this, {
            alias: 'myprovider',
            accessTokenUri: 'https://provider.example.com/oauth/token',
            authUri: 'https://provider.example.com/oauth/authorize',
            refreshTokenUri: 'https://provider.example.com/oauth/token',
            revokeTokenUri: 'https://provider.example.com/oauth/revoke',
            defaultScopes: ['read'],
        });
    }

    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await this.oauth2.setup(configuration);
        await configuration.slashCommands.provideSlashCommand(this);
    }

    // Slash command: /authorize -- redirect user to provider
    // Slash command: /my-data -- fetch data using stored token
    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const [command] = context.getArguments();
        const user = context.getSender();

        if (command === 'authorize') {
            const url = await this.oauth2.getUserAuthorizationUrl(user);
            // Send user a message with the link to click
            return;
        }

        if (command === 'revoke') {
            await this.oauth2.revokeUserAccessToken(user, persis);
            return;
        }

        // Try to get stored token
        let authData = await this.oauth2.getAccessTokenForUser(user);

        // If no token, user needs to authorize
        if (!authData) {
            const url = await this.oauth2.getUserAuthorizationUrl(user);
            // Send authorization link
            return;
        }

        // Check if token is expired and try refresh
        if (authData.expiresAt && authData.expiresAt * 1000 < Date.now()) {
            try {
                authData = await this.oauth2.refreshUserAccessToken(user, persis);
            } catch {
                // Refresh failed, user must re-authorize
                const url = await this.oauth2.getUserAuthorizationUrl(user);
                return;
            }
        }

        // Use the access token
        const response = await http.get('https://provider.example.com/api/user', {
            headers: { Authorization: `Bearer ${authData.token}` },
        });
    }
}
```

---

## Token Persistence Model

Tokens are stored using two association records:

```typescript
const associations = [
    new RocketChatAssociationRecord(RocketChatAssociationModel.USER, user.id),
    new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `${alias}-oauth-connection`),
];
```

The stored object matches the `IAuthData` shape: `{ scope, token, expiresAt, refreshToken }`. The `saveToken` method uses `persis.updateByAssociations` with `upsert: true`, so it creates the record on first authorization and updates it on refresh.
