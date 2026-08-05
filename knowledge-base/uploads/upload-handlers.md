# Upload Handlers

## Purpose

`IPreFileUpload` intercepts file uploads **before** the file is saved to storage. Use it to validate file type, enforce size limits, scan for malware, or block uploads based on business rules.

---

## Overview

When a user or visitor uploads a file to a Rocket.Chat room, the platform fires the `IPreFileUpload` event **after** all file contents have been received by Rocket.Chat but **before** the file is saved to the database and storage backend.

Your handler receives the full file content as a `Buffer` along with metadata (filename, size, MIME type, room ID, user ID). You can inspect the file and either allow the upload (return normally) or reject it (throw `FileUploadNotAllowedException`).

---

## When To Use

- Restricting allowed file types (e.g., only images and PDFs)
- Enforcing maximum file size limits
- Scanning uploaded files for malware or sensitive content
- Blocking uploads by specific users or in specific rooms
- Inspecting file contents (the `Buffer`) before they hit storage
- Implementing custom upload policies per department or role

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IPreFileUpload` | Upload interceptor | `executePreFileUpload(context, read, http, persis, modify)` |
| `IFileUploadContext` | Upload context | `file: IUploadDetails`, `content: Buffer` |
| `IUploadDetails` | File metadata | `name`, `size`, `type`, `rid`, `userId`, `visitorToken` |

---

## IFileUploadContext

```typescript
export interface IFileUploadContext {
    /** File metadata: name, size, MIME type, room ID, user ID */
    file: IUploadDetails;
    /** Full file content as a Buffer */
    content: Buffer;
}
```

The `content` is a Node.js `Buffer` containing the entire file. You can inspect byte sequences to validate file type from content (not just extension), scan for patterns, etc.

---

## IUploadDetails

```typescript
export interface IUploadDetails {
    /** Full filename including extension */
    name: string;
    /** File size in bytes */
    size: number;
    /** MIME type (e.g. "image/png", "application/pdf") */
    type: string;
    /** Room ID where the file is being uploaded */
    rid: string;
    /** User ID of the uploader */
    userId: string;
    /** Livechat visitor token (if uploaded via livechat widget) */
    visitorToken?: string;
}
```

---

## IPreFileUpload

**Fires**: Before an upload is saved to the database and storage. Rocket.Chat has already received the full file content.

**Context**: `IFileUploadContext` -- contains file metadata (`IUploadDetails`) and full file content (`Buffer`).

**Can modify?** No. But can **prevent**. Throw a `FileUploadNotAllowedException` with a descriptive message to reject the upload. The error message is returned to the user.

**Method signature**: `executePreFileUpload(context, read, http, persis, modify): Promise<void>`

---

## Example: Validate File Type and Size

```typescript
import {
    IPreFileUpload,
    IFileUploadContext,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/uploads';
import { FileUploadNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

export class FileUploadGuard implements IPreFileUpload {
    // Only allow these MIME types
    private readonly ALLOWED_TYPES = [
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
    ];

    // Maximum file size: 10 MB
    private readonly MAX_SIZE_BYTES = 10 * 1024 * 1024;

    public async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { file, content } = context;

        console.log(`Upload requested: ${file.name} (${file.type}, ${file.size} bytes)`);
        console.log(`Uploader: ${file.userId}, Room: ${file.rid}`);

        // --- Rule 1: Check MIME type ---
        if (!this.ALLOWED_TYPES.includes(file.type)) {
            throw new FileUploadNotAllowedException(
                `File type "${file.type}" is not allowed. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`,
            );
        }

        // --- Rule 2: Check file size ---
        if (file.size > this.MAX_SIZE_BYTES) {
            const maxMB = this.MAX_SIZE_BYTES / (1024 * 1024);
            const fileMB = (file.size / (1024 * 1024)).toFixed(2);
            throw new FileUploadNotAllowedException(
                `File size ${fileMB} MB exceeds the maximum of ${maxMB} MB.`,
            );
        }

        // --- Rule 3: Validate image content matches declared MIME type ---
        if (file.type.startsWith('image/')) {
            if (!this.isValidImage(content, file.type)) {
                throw new FileUploadNotAllowedException(
                    `File content does not match declared MIME type "${file.type}".`,
                );
            }
        }

        // --- Rule 4: Block uploads to archived rooms ---
        const roomReader = read.getRoomReader();
        const room = await roomReader.getById(file.rid);
        if (room && room.archived) {
            throw new FileUploadNotAllowedException(
                'Cannot upload files to archived rooms.',
            );
        }

        console.log(`Upload allowed: ${file.name}`);
    }

    /**
     * Validate image by checking magic bytes (file signatures).
     */
    private isValidImage(buffer: Buffer, mimeType: string): boolean {
        const signatures: Record<string, number[]> = {
            'image/png': [0x89, 0x50, 0x4E, 0x47],
            'image/jpeg': [0xFF, 0xD8, 0xFF],
            'image/gif': [0x47, 0x49, 0x46, 0x38],
            'image/webp': [0x52, 0x49, 0x46, 0x46],
        };

        const expectedSig = signatures[mimeType];
        if (!expectedSig) return true; // Skip validation for unknown types

        return expectedSig.every((byte, i) => buffer[i] === byte);
    }
}
```

---

## Example: Block Uploads for Specific Roles

```typescript
import {
    IPreFileUpload,
    IFileUploadContext,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/uploads';
import { FileUploadNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

export class GuestUploadBlocker implements IPreFileUpload {
    public async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { file } = context;

        // Livechat visitors identified by visitorToken
        if (file.visitorToken) {
            // Allow uploads from visitors only if they are small images
            if (file.size > 1024 * 1024) {
                throw new FileUploadNotAllowedException(
                    'Visitors can only upload files under 1 MB.',
                );
            }
            if (!file.type.startsWith('image/')) {
                throw new FileUploadNotAllowedException(
                    'Visitors can only upload image files.',
                );
            }
        }

        // For regular users, check role permissions
        if (file.userId && !file.visitorToken) {
            const userReader = read.getUserReader();
            const user = await userReader.getById(file.userId);

            if (user && !user.roles.includes('admin')) {
                // Non-admin users: restrict PDF uploads
                if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
                    throw new FileUploadNotAllowedException(
                        'PDF files over 5 MB require admin permission.',
                    );
                }
            }
        }

        console.log(`Upload allowed: ${file.name}`);
    }
}
```

---

## Example: Content Scanning (Malware / Sensitive Data)

```typescript
import {
    IPreFileUpload,
    IFileUploadContext,
    IRead,
    IHttp,
    IPersistence,
    IModify,
} from '@rocket.chat/apps-engine/definition/uploads';
import { FileUploadNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

export class ContentScanner implements IPreFileUpload {
    public async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { file, content } = context;

        // Scan text files for sensitive patterns
        if (file.type === 'text/plain' || file.type === 'text/csv') {
            const text = content.toString('utf-8');

            // Check for credit card patterns (simplified)
            const ccPattern = /\b(?:\d[ -]*?){13,16}\b/;
            if (ccPattern.test(text)) {
                throw new FileUploadNotAllowedException(
                    'File appears to contain credit card numbers. Upload blocked.',
                );
            }

            // Check for social security numbers (simplified)
            const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;
            if (ssnPattern.test(text)) {
                throw new FileUploadNotAllowedException(
                    'File appears to contain SSN data. Upload blocked.',
                );
            }
        }

        // Delegate to external malware scanning service
        const scanResult = await http.post('https://malware-scanner.example.com/scan', {
            data: {
                filename: file.name,
                size: file.size,
                mimeType: file.type,
            },
        });

        if (scanResult.data?.threats > 0) {
            throw new FileUploadNotAllowedException(
                `File flagged as malicious: ${scanResult.data.reason}`,
            );
        }

        console.log(`Content scan passed: ${file.name}`);
    }
}
```

---

## Key Points

1. **Full file content is available**: The `content` Buffer contains the complete file -- you can inspect every byte.
2. **Rejection is explicit**: Throw `FileUploadNotAllowedException` (from `@rocket.chat/apps-engine/definition/exceptions`) with a user-facing error message.
3. **No modification possible**: You cannot alter the file content, change metadata, or redirect the upload. Only allow or reject.
4. **Performance consideration**: The Buffer may be large. Avoid expensive operations on very large files. If you only need metadata, ignore `content` and use `file` properties.
5. **Livechat uploads**: When a livechat visitor uploads, `file.visitorToken` is set and `file.userId` may be empty. Check `visitorToken` to identify visitor uploads.
6. **Fires after file received**: Rocket.Chat has already accepted the entire file into memory. Rejecting at this stage prevents it from being persisted.
