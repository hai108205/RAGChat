# Message Files

## Purpose

`IMessageFile` represents a file attachment in a Rocket.Chat message. Files are distinct from rich attachments (`IMessageAttachment`) — they represent actual uploaded files (documents, images, archives) that have been stored in Rocket.Chat's file system.

---

## Overview

When a user uploads a file to Rocket.Chat, the resulting message carries an array of `IMessageFile` objects in the `files` property. Each object identifies the file by `_id`, `name`, and `type` (MIME type). For full details (URL, size, extension), apps must fetch the file via the upload reader.

The older `file` (singular) property is **deprecated** — always use `files` (array), as Rocket.Chat now supports multiple file attachments per message.

---

## When To Use

- Reading file names from incoming messages → `message.files[].name`
- Checking file MIME type → `message.files[].type`
- Getting file IDs for downstream processing → `message.files[]._id`
- Determining the type group (document/image/audio/video) → `message.files[].typeGroup`
- **Not** for rich attachment cards with images — use `IMessageAttachment.imageUrl` instead.

---

## Important Interface

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IMessageFile` | File metadata in a message | `_id`, `name`, `type`, `typeGroup` |

---

## IMessageFile Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `_id` | `string` | **Yes** | Unique identifier of the uploaded file in Rocket.Chat. Use this to fetch full file details. |
| `name` | `string` | **Yes** | Original filename as uploaded by the user (e.g., `'report.pdf'`, `'screenshot.png'`). |
| `type` | `string` | **Yes** | MIME type of the file (e.g., `'application/pdf'`, `'image/png'`, `'text/plain'`). |
| `typeGroup` | `string` | No | High-level category: `'document'`, `'image'`, `'audio'`, `'video'`. Not always present. |

---

## IMessage: `file` vs `files`

```typescript
export interface IMessage {
    /** @deprecated Deprecated in favor of files */
    file?: IMessageFile;
    files?: Array<IMessageFile>;
    // ...
}
```

| Property | Status | Description |
|----------|--------|-------------|
| `file` | **Deprecated** | Legacy single-file reference. Only present on messages with exactly one file from older Rocket.Chat versions. |
| `files` | **Current** | Array of all file attachments. Supports multiple files per message. Always use this. |

---

## Typical Workflow

### 1. Reading File Info from Incoming Messages

```typescript
import { IMessage, IRead } from '@rocket.chat/apps-engine/definition/messages';

async function handleFiles(message: IMessage, read: IRead) {
    // Always use .files (array), never .file (deprecated singular)
    const files = message.files;

    if (!files || files.length === 0) {
        return; // No files attached
    }

    for (const file of files) {
        console.log(`File ID: ${file._id}`);
        console.log(`Name: ${file.name}`);
        console.log(`MIME type: ${file.type}`);
        console.log(`Type group: ${file.typeGroup}`);

        // Determine if it's an image
        if (file.typeGroup === 'image' || file.type.startsWith('image/')) {
            console.log('This is an image file');
        }
    }
}
```

### 2. Accessing Full File Details via Upload Reader

The `IMessageFile` object only contains basic metadata. For the full file URL, size, extension, and download capabilities, use `IUploadRead`:

```typescript
import { IRead } from '@rocket.chat/apps-engine/definition/accessors';

async function getFileDetails(message: IMessage, read: IRead) {
    if (!message.files) return;

    for (const fileInfo of message.files) {
        // Fetch full file details by ID
        const upload = await read.getUploadReader().getById(fileInfo._id);

        if (upload) {
            console.log(`URL: ${upload.url}`);           // Direct download URL
            console.log(`Size: ${upload.size}`);          // File size in bytes
            console.log(`Extension: ${upload.extension}`); // File extension
        }
    }
}
```

### 3. Filtering Messages by File Presence

```typescript
// Check if message has any file attachments
const hasFiles = message.files && message.files.length > 0;

// Check if any file is a PDF
const hasPdf = message.files?.some(f => f.type === 'application/pdf');

// Get only image files
const images = message.files?.filter(
    f => f.typeGroup === 'image' || f.type.startsWith('image/')
);
```

---

## Example

### Complete File Handler

```typescript
import {
    IMessage,
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';

async function processUploadedFiles(
    message: IMessage,
    read: IRead,
    modify: IModify,
): Promise<void> {
    const files = message.files;
    if (!files || files.length === 0) return;

    const appUser = await read.getUserReader().getAppUser();
    const uploadReader = read.getUploadReader();

    const fileDescriptions: string[] = [];

    for (const fileInfo of files) {
        const fullFile = await uploadReader.getById(fileInfo._id);
        if (fullFile) {
            fileDescriptions.push(
                `- **${fullFile.name}** (${fullFile.extension?.toUpperCase()}, ${formatBytes(fullFile.size ?? 0)})`
            );
        } else {
            fileDescriptions.push(`- **${fileInfo.name}** (${fileInfo.type})`);
        }
    }

    const builder = modify.getCreator().startMessage()
        .setRoom(message.room)
        .setSender(appUser)
        .setText(`Received ${files.length} file(s):\n${fileDescriptions.join('\n')}`)
        .setThreadId(message.id);

    await modify.getCreator().finish(builder);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
```

---

## Best Practices

- **Always use `message.files`** (plural array), never `message.file` (deprecated singular).
- **Check `files.length > 0`** before iterating — many messages have no files.
- **Use `typeGroup` for broad categorization** (`image`, `document`, `audio`, `video`) before checking specific MIME types.
- **Fetch full file details on demand** — the `IMessageFile` object is minimal metadata. Use `getUploadReader().getById()` when you need the URL, size, or extension.
- **Handle missing files gracefully** — `message.files` is optional and can be `undefined`.

---

## Common Mistakes

- **Using `message.file`** (singular, deprecated) — Only present on legacy single-file messages. New multi-file uploads only populate `files`.
- **Assuming `file.name` is unique or safe** — filenames are user-provided and can contain any characters.
- **Not checking for `undefined`** — `message.files` can be `undefined`. Always guard with `if (message.files && message.files.length > 0)`.
- **Confusing `IMessageFile` with `IMessageAttachment.fileId`** — `IMessageFile` represents the actual uploaded file. `IMessageAttachment.fileId` is a reference on a rich attachment that links to a file.
- **Expecting `url` or `size` on `IMessageFile`** — These properties are not on `IMessageFile`. Use `IUploadRead.getById()` to get the full file object.

---

## Related Topics

- [Message Structure](./message-structure.md)
- [Message Attachments](./message-attachments.md)
- [Message Reactions](./message-reactions.md)
