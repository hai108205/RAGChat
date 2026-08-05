# Upload Structure

## Purpose

`IUpload` represents a file uploaded to a Rocket.Chat room. `IUploadDescriptor` describes a file to be uploaded. `StoreType` identifies the storage backend where the file lives.

---

## Overview

When a user uploads a file (image, document, video, audio), Rocket.Chat creates an `IUpload` record. The record tracks the file's identity (name, size, type, extension), its location (store, path, token, url), its upload progress (`uploading`, `complete`, `progress`), and its context (room, user, visitor).

The `IUploadDescriptor` is the input you provide when programmatically creating an upload: filename, target room, uploading user, and optionally a livechat visitor token.

`StoreType` enumerates the supported storage backends: GridFS (MongoDB), Amazon S3, Google Cloud Storage, WebDAV, and local file system.

---

## When To Use

- Reading metadata about an uploaded file → `upload.name`, `upload.size`, `upload.type`
- Checking if upload is complete → `upload.complete` and `upload.uploading`
- Getting the file URL → `upload.url`
- Identifying the storage system → `upload.store`
- Knowing which room the file belongs to → `upload.room`
- Knowing who uploaded it → `upload.user`
- Creating an upload programmatically → build an `IUploadDescriptor`
- Handling livechat file uploads → include `visitorToken` in descriptor

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IUpload` | Uploaded file record | `id`, `name`, `size`, `type`, `extension`, `url`, `store`, `room`, `user` |
| `IUploadDescriptor` | Upload input specification | `filename`, `room`, `user`, `visitorToken` |
| `StoreType` | Enum | `GridFS`, `AmazonS3`, `GoogleCloudStorage`, `Webdav`, `FileSystem` |

---

## IUpload Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique upload identifier |
| `name` | `string` | Yes | File name (e.g. `"screenshot.png"`) |
| `size` | `string` | Yes | File size as string (e.g. `"204800"`) |
| `type` | `string` | Yes | MIME type (e.g. `"image/png"`, `"application/pdf"`) |
| `extension` | `string` | Yes | File extension (e.g. `"png"`, `"pdf"`) |
| `etag` | `string` | Yes | HTTP ETag for cache validation |
| `path` | `string` | Yes | Storage path within the backend |
| `token` | `string` | Yes | Access token for download authorization |
| `url` | `string` | Yes | Download URL (absolute or relative) |
| `progress` | `number` | Yes | Upload progress (0 to 1) |
| `uploading` | `boolean` | Yes | `true` while upload is in progress |
| `complete` | `boolean` | Yes | `true` when upload is finished |
| `updatedAt` | `Date` | Yes | Last update timestamp |
| `uploadedAt` | `Date` | Yes | When the upload completed |
| `store` | `StoreType` | Yes | Storage backend used |
| `room` | `IRoom` | Yes | Room where the file was uploaded |
| `visitor` | `IVisitor` | No | Livechat visitor (if uploaded by a visitor) |
| `user` | `IUser` | No | User who uploaded the file |

## IUploadDescriptor Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `filename` | `string` | Yes | Full filename including extension |
| `room` | `IRoom` | Yes | Target room for the upload |
| `user` | `IUser \| null` | No | Uploading user. Omit (set `null`) when uploading on behalf of a livechat visitor. |
| `visitorToken` | `string` | No | Livechat visitor token (ignored if `user` is provided) |

## StoreType Enum

| Value | Storage Backend | Description |
|-------|----------------|-------------|
| `GridFS` | `'GridFS:Uploads'` | MongoDB GridFS (Rocket.Chat default) |
| `AmazonS3` | `'AmazonS3'` | Amazon S3 or S3-compatible storage |
| `GoogleCloudStorage` | `'GoogleCloudStorage'` | Google Cloud Storage |
| `Webdav` | `'Webdav'` | WebDAV server |
| `FileSystem` | `'FileSystem'` | Local file system |

---

## Typical Workflow

### 1. Inspecting an Upload Record

```typescript
import { IUpload } from '@rocket.chat/apps-engine/definition/uploads';
import { StoreType } from '@rocket.chat/apps-engine/definition/uploads/StoreType';

function inspectUpload(upload: IUpload): void {
    console.log(`File: ${upload.name} (${upload.extension})`);
    console.log(`MIME: ${upload.type}`);
    console.log(`Size: ${upload.size} bytes`);
    console.log(`Store: ${upload.store}`);
    console.log(`URL: ${upload.url}`);
    console.log(`Complete: ${upload.complete}, Uploading: ${upload.uploading}`);

    // Check storage backend
    if (upload.store === StoreType.GridFS) {
        console.log('Stored in MongoDB GridFS');
    } else if (upload.store === StoreType.AmazonS3) {
        console.log('Stored in Amazon S3');
    }

    // Who uploaded it?
    if (upload.user) {
        console.log(`Uploaded by: ${upload.user.username}`);
    } else if (upload.visitor) {
        console.log(`Uploaded by livechat visitor: ${upload.visitor.token}`);
    }
}
```

### 2. Determining File Category from MIME Type

```typescript
import { IUpload } from '@rocket.chat/apps-engine/definition/uploads';

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'other';

function categorizeUpload(upload: IUpload): FileCategory {
    if (upload.type.startsWith('image/')) return 'image';
    if (upload.type.startsWith('video/')) return 'video';
    if (upload.type.startsWith('audio/')) return 'audio';
    if (upload.type === 'application/pdf') return 'document';
    if (upload.type.startsWith('text/')) return 'document';
    return 'other';
}
```

### 3. Building an Upload Descriptor

```typescript
import { IUploadDescriptor } from '@rocket.chat/apps-engine/definition/uploads';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

function createUploadDescriptor(
    filename: string,
    room: IRoom,
    user: IUser,
): IUploadDescriptor {
    return {
        filename,
        room,
        user,
        // visitorToken is omitted — only used for livechat visitors
    };
}

// For a livechat visitor upload:
function createVisitorUploadDescriptor(
    filename: string,
    room: IRoom,
    visitorToken: string,
): IUploadDescriptor {
    return {
        filename,
        room,
        user: null, // Important: set to null for visitor uploads
        visitorToken,
    };
}
```

### 4. Full Example: Logging Upload Details in a Message Handler

```typescript
import { IHttp, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IUpload } from '@rocket.chat/apps-engine/definition/uploads';
import { StoreType } from '@rocket.chat/apps-engine/definition/uploads/StoreType';

async function onMessageSent(
    message: IMessage,
    read: IRead,
    modify: IModify,
): Promise<void> {
    if (!message.file) return; // No file attached

    const upload: IUpload = message.file;
    const room = message.room;
    const appUser = await read.getUserReader().getAppUser();

    const storeLabel: Record<string, string> = {
        [StoreType.GridFS]: 'Local GridFS',
        [StoreType.AmazonS3]: 'Amazon S3',
        [StoreType.GoogleCloudStorage]: 'Google Cloud',
        [StoreType.Webdav]: 'WebDAV',
        [StoreType.FileSystem]: 'Local Disk',
    };

    const response = [
        `File uploaded: **${upload.name}**`,
        `Type: ${upload.type}`,
        `Size: ${(parseInt(upload.size, 10) / 1024).toFixed(1)} KB`,
        `Storage: ${storeLabel[upload.store] || upload.store}`,
        upload.complete ? ':white_check_mark: Upload complete' : ':hourglass: Upload in progress',
    ].join('\n');

    const msg = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser!)
        .setText(response);

    await modify.getCreator().finish(msg);
}
```

---

## Best Practices

- **Check `upload.complete`** before processing a file — incomplete uploads may not be accessible.
- **Check `upload.url`** for download — This is the canonical download URL. Don't reconstruct URLs from path/token manually.
- **Use `upload.type` for MIME-based logic** — `extension` is less reliable (a file can have a misleading extension).
- **Handle both `upload.user` and `upload.visitor`** — Livechat visitors use `visitor`, regular users use `user`. One will be undefined.
- **Set `user: null` in `IUploadDescriptor` for visitor uploads** — As documented in the source: "please ignore this property if you are going to assign a livechat visitor to perform upload."
- **Parse `upload.size` as a number** — It's typed as `string`, so use `parseInt(upload.size, 10)` or `Number(upload.size)` for calculations.

---

## Common Mistakes

- **Assuming `upload.size` is a number** → It's `string`. Convert before math.
- **Using `upload.extension` for MIME logic** → Use `upload.type` (the MIME string) instead.
- **Not checking `upload.complete`** → In-progress uploads may not have a valid URL yet.
- **Setting both `user` and `visitorToken` in descriptor** → They're mutually exclusive. For livechat visitors, set `user: null` and provide `visitorToken`.
- **Comparing `StoreType` as strings** → Use the `StoreType` enum constants: `StoreType.GridFS`, `StoreType.AmazonS3`, etc.

---

## Related Topics

- [Room Structure](../rooms/room-structure.md)
- [Message Structure](../messages/message-structure.md)
- [Message Reader Accessor](../accessors/message-reader.md)
- [Room Reader Accessor](../accessors/room-reader.md)
