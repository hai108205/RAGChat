# OAuth2 Setup Guide

## Purpose

Practical guide for integrating OAuth2 authentication into a Rocket.Chat app. Covers what the OAuth2 client does under the hood, the authorization flow, provider examples, token refresh patterns, and error handling.

---

## What the OAuth2 Client Does

When you call `oauth2Client.setup(configuration)` inside `extendConfiguration`, the client automatically:

1. **Creates two settings** with IDs `{alias}-oauth-client-id` and `{alias}-oauth-clientsecret` (both type STRING, public, required, with empty defaults). Admins fill these in via the Rocket.Chat admin panel under the app's settings.

2. **Registers a callback API endpoint** at path `{alias}-callback`. This endpoint is `ApiSecurity.UNSECURE` and `ApiVisibility.PUBLIC` -- it can be reached without authentication since the OAuth provider redirects the user's browser to it. The endpoint handler (`handleOAuthCallback`) processes the authorization code.

3. **Requires i18n translations** for the setting labels. Without these, the admin settings page shows the raw IDs.

---

## Token Storage

Tokens are persisted per user via the App-Engine persistence layer:

| Association | Value |
|-------------|-------|
| `RocketChatAssociationModel.USER` | `user.id` |
| `RocketChatAssociationModel.MISC` | `{alias}-oauth-connection` |

The stored record contains: `scope`, `token`, `expiresAt`, `refreshToken`.

Tokens are created on first authorization and updated on refresh. They are removed on revocation. Reading uses `getPersistenceReader().readByAssociations()`.

---

## The Authorization Flow

```
User                Rocket.Chat App              OAuth Provider           User's Browser
 |                        |                            |                        |
 |-- /authorize slash --> |                            |                        |
 |                        |-- getUserAuthorizationUrl ->                       |
 |                        |<-- URL (with state=user.id) |                        |
 |                        |-- "Click here to authorize" ->                      |
 |                        |                            |                        |
 |                        |                            |<-- GET authUri ------- |
 |                        |                            |-- Login/Consent page ->|
 |                        |                            |                        |
 |                        |                            |<-- User approves ------ |
 |                        |                            |                        |
 |                        |<-- GET /{alias}-callback?code=xxx&state=user.id --- |
 |                        |                            |                        |
 |                        |-- POST accessTokenUri ---->|                        |
 |                        |<-- { access_token, ... } --|                        |
 |                        |                            |                        |
 |                        |-- authorizationCallback()                            |
 |                        |-- saveToken(authData, userId, persis)                |
 |                        |                            |                        |
 |                        |-- HTTP 200 (success page) ->                        |
```

### Step by Step

1. **User triggers authorization** -- typically via a slash command or UI button. App calls `getUserAuthorizationUrl(user, scopes)`.

2. **App builds redirect URL** -- constructs a URL pointing to `authUri` with `response_type=code`, `state={user.id}`, `client_id`, `redirect_uri`, and `scope`.

3. **User visits the URL** -- the app sends a message with the link or opens it. The user is redirected to the provider's login/consent page.

4. **User approves** -- the provider redirects back to `{siteUrl}/{alias}-callback?code={code}&state={user.id}`.

5. **Callback handler fires** -- `handleOAuthCallback`:
   - Looks up the user by `state` (which is `user.id`)
   - If no `code`: user denied authorization. Calls `authorizationCallback(undefined)` and returns UNAUTHORIZED.
   - If `code` present: POSTs to `accessTokenUri` with `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code`
   - Parses the response for `access_token`, `expires_in`, `refresh_token`, `scope`
   - Calls `authorizationCallback(authData, user, ...)`
   - Calls `saveToken(authData, userId, persis)`
   - Returns HTTP response (the content shown to the user in the browser tab)

6. **Token stored** -- the token is persisted via associations and available via `getAccessTokenForUser(user)`.

---

## Common Provider Examples

### GitHub

```typescript
const githubClient = createOAuth2Client(app, {
    alias: 'github',
    accessTokenUri: 'https://github.com/login/oauth/access_token',
    authUri: 'https://github.com/login/oauth/authorize',
    refreshTokenUri: 'https://github.com/login/oauth/access_token',  // GitHub uses same endpoint
    revokeTokenUri: 'https://api.github.com/applications/{client_id}/token',
    defaultScopes: ['repo', 'read:org'],
    authorizationCallback: async (token, user, read, modify, http, persis) => {
        if (!token) {
            return { responseContent: '<h1>Access denied</h1>' };
        }
        // Token exchange succeeded
        return { responseContent: '<h1>You can close this tab</h1>' };
    },
});
```

Note: GitHub access tokens do not expire unless revoked. `refreshTokenUri` and `refreshUserAccessToken` still exist but are unlikely to be called for GitHub.

### Google

```typescript
const googleClient = createOAuth2Client(app, {
    alias: 'google',
    accessTokenUri: 'https://oauth2.googleapis.com/token',
    authUri: 'https://accounts.google.com/o/oauth2/v2/auth',
    refreshTokenUri: 'https://oauth2.googleapis.com/token',
    revokeTokenUri: 'https://oauth2.googleapis.com/revoke',
    defaultScopes: ['https://www.googleapis.com/auth/userinfo.email', 'openid'],
});
```

Google tokens expire after 1 hour. Always call `refreshUserAccessToken` when a 401 is received, or proactively check `expiresAt`.

### Setting the Redirect URI in Provider Console

The callback URL the Rocket.Chat app uses is:

```
{your-rocketchat-url}/{alias}-callback
```

For example: `https://chat.example.com/github-callback`

Register this exact URL in the OAuth provider's application console as the authorized redirect URI.

---

## Error Handling

### Provider Returns 5xx

The callback handler throws. The user sees the default failed HTML. No token is saved. The app should guide the user to retry.

### User Denies Authorization

`authorizationCallback` is called with `token = undefined`. The handler can return custom HTML. No token is saved.

### Refresh Token Expired or Invalid

`refreshUserAccessToken` throws an `Error`. Catch it and prompt the user to re-authorize:

```typescript
try {
    const newToken = await oauth2Client.refreshUserAccessToken(user, persis);
} catch (err) {
    // Redirect user to authorization URL again
    const url = await oauth2Client.getUserAuthorizationUrl(user);
    // Show link to user
}
```

### No Token Exists

`getAccessTokenForUser` returns `undefined`. The user has never authorized, or the token was revoked/removed. Send the authorization URL.

### Token Revocation Failure

`revokeUserAccessToken` returns `false`. The token is removed from persistence anyway (best-effort local cleanup). Log the error for the admin.

---

## Token Refresh Patterns

### Proactive Refresh (Check Before Every API Call)

```typescript
async function getValidToken(user: IUser, persis: IPersistence): Promise<string | undefined> {
    let auth = await oauth2Client.getAccessTokenForUser(user);
    if (!auth) return undefined;

    const now = Math.floor(Date.now() / 1000);
    if (auth.expiresAt && auth.expiresAt < now) {
        try {
            auth = await oauth2Client.refreshUserAccessToken(user, persis);
        } catch {
            return undefined;
        }
    }

    return auth?.token;
}
```

### Reactive Refresh (On 401 Response)

```typescript
const response = await http.get(apiUrl, {
    headers: { Authorization: `Bearer ${token}` },
});

if (response.statusCode === 401) {
    const newAuth = await oauth2Client.refreshUserAccessToken(user, persis);
    // Retry with newAuth.token
}
```

---

## Admin Configuration

After the app is installed, an admin must configure the OAuth2 client:

1. Go to **Administration > Apps > [Your App] > Settings**
2. Fill in `{alias}-oauth-client-id` with the Client ID from the OAuth provider's console
3. Fill in `{alias}-oauth-client-secret` with the Client Secret
4. Ensure the redirect URI (`{siteUrl}/{alias}-callback`) is registered in the provider's console

The `isFullyConfigured` pattern is not built into `IOAuth2Client` itself, but you can wrap it:

```typescript
async function isOAuthConfigured(alias: string, read: IRead): Promise<boolean> {
    const clientId = await read.getEnvironmentReader().getSettings().getValueById(`${alias}-oauth-client-id`);
    const clientSecret = await read.getEnvironmentReader().getSettings().getValueById(`${alias}-oauth-clientsecret`);
    return Boolean(clientId && clientSecret);
}
```
