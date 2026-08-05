# Livechat Department

## Purpose

`IDepartment` represents a livechat department -- an organizational unit for routing visitors to the right team of agents. Departments power the omnichannel routing engine.

---

## Overview

A department groups agents by expertise (e.g., "Sales", "Support", "Billing"). Visitors can be routed to departments based on pre-chat form selections, widget configuration, or API calls. Once assigned, only agents in that department can serve the conversation.

Departments carry configuration for:
- **Routing behavior**: offline message fallback, queue messages, forwarding rules
- **Closing behavior**: tags required before closing, auto-close messages for abandoned rooms
- **Visibility**: whether the department appears on the offline form and registration form
- **Agent count**: how many agents are currently available

---

## When To Use

- Reading the department from a livechat room → `room.department`
- Checking if a department is enabled → `department.enabled`
- Getting department routing info → `department.email`, `department.offlineMessageChannelName`
- Checking forwarding rules → `department.departmentsAllowedToForward`
- Determining agent capacity → `department.numberOfAgents`
- Checking closing requirements → `department.requestTagBeforeClosingChat`, `department.chatClosingTags`
- Displaying department on forms → `department.showOnOfflineForm`, `department.showOnRegistration`

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IDepartment` | Livechat department configuration | `id`, `name`, `email`, `enabled`, `numberOfAgents`, `showOnOfflineForm`, `showOnRegistration` |

---

## IDepartment Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique department ID |
| `name` | `string` | No | Human-readable department name (e.g., "Sales", "Support") |
| `email` | `string` | No | Department email for offline messages and notifications |
| `description` | `string` | No | Short description of the department's purpose |
| `offlineMessageChannelName` | `string` | No | Channel name where offline messages are posted when no agents are available |
| `requestTagBeforeClosingChat` | `false` | No | Whether tags are required before closing a chat (set to `false` to disable) |
| `chatClosingTags` | `Array<string>` | No | Allowed tags that agents can/must select when closing a conversation |
| `abandonedRoomsCloseCustomMessage` | `string` | No | Custom message sent when an abandoned room is auto-closed |
| `waitingQueueMessage` | `string` | No | Message shown to visitors while waiting in the queue |
| `departmentsAllowedToForward` | `string` | No | IDs of departments that agents can forward conversations to |
| `enabled` | `boolean` | Yes | Whether the department is active and accepting chats |
| `updatedAt` | `Date` | Yes | Last update timestamp |
| `numberOfAgents` | `number` | Yes | Number of agents assigned to this department |
| `showOnOfflineForm` | `boolean` | Yes | Whether the department appears as an option on the offline contact form |
| `showOnRegistration` | `boolean` | Yes | Whether the department is shown during visitor registration |

---

## Typical Workflow

### 1. Checking if a Department is Active

```typescript
if (department.enabled) {
    // Department is accepting chats
} else {
    // Department is disabled -- fall back to default routing
}
```

### 2. Reading Department from a Livechat Room

```typescript
import { isLivechatRoom } from '@rocket.chat/apps-engine/definition/livechat';

if (isLivechatRoom(room) && room.department) {
    const dept = room.department;
    console.log(`Department: ${dept.name}`);
    console.log(`Agents available: ${dept.numberOfAgents}`);
}
```

### 3. Checking Closing Requirements

```typescript
if (department.requestTagBeforeClosingChat !== false) {
    // Tags are required before closing
    const allowedTags = department.chatClosingTags ?? [];
    console.log(`Allowed closing tags: ${allowedTags.join(', ')}`);
}
```

### 4. Checking Department Form Visibility

```typescript
// Should this department appear on the offline form?
if (department.showOnOfflineForm) {
    // Include in offline form dropdown
}

// Should this department appear on the registration form?
if (department.showOnRegistration) {
    // Include in registration form dropdown
}
```

---

## Example

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { isLivechatRoom, IDepartment } from '@rocket.chat/apps-engine/definition/livechat';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';

async function analyzeDepartment(
    room: IRoom,
    read: IRead,
): Promise<string | null> {
    if (!isLivechatRoom(room) || !room.department) {
        return null;
    }

    const dept: IDepartment = room.department;

    const lines: string[] = [
        `**Department Analysis: ${dept.name || dept.id}**`,
    ];

    if (dept.description) {
        lines.push(`Description: ${dept.description}`);
    }

    lines.push(`Enabled: ${dept.enabled ? 'Yes' : 'No'}`);
    lines.push(`Agents: ${dept.numberOfAgents}`);

    if (dept.email) {
        lines.push(`Email: ${dept.email}`);
    }

    if (dept.waitingQueueMessage) {
        lines.push(`Queue message: "${dept.waitingQueueMessage}"`);
    }

    if (dept.offlineMessageChannelName) {
        lines.push(`Offline channel: #${dept.offlineMessageChannelName}`);
    }

    if (dept.chatClosingTags && dept.chatClosingTags.length > 0) {
        lines.push(`Closing tags: ${dept.chatClosingTags.join(', ')}`);
    }

    if (dept.abandonedRoomsCloseCustomMessage) {
        lines.push(`Abandoned room message: "${dept.abandonedRoomsCloseCustomMessage}"`);
    }

    lines.push(`Show on offline form: ${dept.showOnOfflineForm ? 'Yes' : 'No'}`);
    lines.push(`Show on registration: ${dept.showOnRegistration ? 'Yes' : 'No'}`);
    lines.push(`Last updated: ${dept.updatedAt.toISOString()}`);

    return lines.join('\n');
}
```

---

## Best Practices

- **Check `department.enabled` before routing** -- disabled departments should not receive new conversations.
- **Respect `showOnOfflineForm` and `showOnRegistration`** -- these flags control where the department appears in the UI; your App should honor them.
- **Use `department.email` for offline notifications** -- fallback contact when no agents are available.
- **Use `department.waitingQueueMessage`** -- display this to visitors while they wait for an agent.
- **Handle missing `name`** -- the `name` field is optional; fall back to `id` if necessary.

---

## Common Mistakes

- **Assuming all livechat rooms have a department** -- rooms can be unassigned (`room.department` is undefined).
- **Routing to disabled departments** -- Always check `enabled` before assigning or forwarding to a department.
- **Hardcoding department IDs** -- Department IDs are deployment-specific. Use `read` accessors to look up departments dynamically.
- **Ignoring `requestTagBeforeClosingChat`** -- When this is set, agents must provide a closing tag; your custom close flow should enforce this.
- **Treating `chatClosingTags` as always required** -- it's only enforced when `requestTagBeforeClosingChat` is set (not `false`).

---

## Related Topics

- [Livechat Visitor](./livechat-visitor.md)
- [Livechat Room](./livechat-room.md)
- [Livechat Message](./livechat-message.md)
