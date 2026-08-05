# Roles

Apps Engine provides read access to roles via `IRoleRead`. Access via `read.getRoleReader()`.

---

## IRole Interface

```typescript
export interface IRole {
    description: string;           // Human-readable role description
    mandatory2fa?: boolean;        // Whether role requires 2FA
    name: string;                  // Role name (e.g., 'admin', 'moderator')
    protected: boolean;            // True for system roles, false for custom
    scope: 'Users' | 'Subscriptions'; // Scope of the role
    id: string;                    // Role ID
}
```

---

## IRoleRead Accessor

```typescript
export interface IRoleRead {
    getOneByIdOrName(idOrName: string, appId: string): Promise<IRole | null>;
    getCustomRoles(appId: string): Promise<Array<IRole>>;
}
```

Access via:

```typescript
const roleReader = read.getRoleReader();
```

---

## Get a Role by ID or Name

```typescript
const role = await read.getRoleReader().getOneByIdOrName('admin', appId);
if (role) {
    console.log(`Role: ${role.name}, Protected: ${role.protected}`);
} else {
    console.log('Role not found');
}
```

Returns `null` if no role matches.

---

## Get All Custom Roles

Returns roles with `protected === false` (custom-created roles, not system roles).

Requires the `AppPermissions.role.read` permission.

```typescript
const customRoles = await read.getRoleReader().getCustomRoles(appId);
for (const role of customRoles) {
    console.log(`Custom role: ${role.name} (${role.description})`);
}
```

---

## Role Checking

The Apps Engine does not provide a direct "check if user has role X" method on `IRoleRead`. To determine a user's roles, inspect the `IUser.roles` property.

```typescript
const user = await read.getUserReader().getById(userId);
if (user && user.roles.includes('admin')) {
    // User is an admin
}
```

---

## Complete Example

```typescript
import { IPreMessageSentPrevent } from '@rocket.chat/apps-engine/definition/messages';

class RoleBasedFilter implements IPreMessageSentPrevent {
    async checkPreMessageSentPrevent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        // Only check for non-admin users
        const sender = await read.getUserReader().getById(message.sender.id);
        return !sender || !sender.roles.includes('admin');
    }

    async executePreMessageSentPrevent(
        message: IMessage, read: IRead, http: IHttp, persistence: IPersistence,
    ): Promise<boolean> {
        // Non-admin users cannot send messages containing links
        if (message.text && /https?:\/\//.test(message.text)) {
            throw new Error('Only admins can send links');
        }
        return false;
    }
}
```

---

## Permissions

Using `getCustomRoles()` requires the `role.read` app permission:

```typescript
// In app.json or App class:
{
    "permissions": [
        { "name": "role.read" }
    ]
}
```
