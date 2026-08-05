# Exception Handling

The Apps Engine defines exception classes to signal known error conditions to the Rocket.Chat host. Throwing these exceptions lets you prevent actions (message send, room create, file upload, etc.) and provide user-visible error messages.

All exceptions extend `AppsEngineException` which itself extends `Error`. All have `name` set to their class name and include `AppsEngineException.JSONRPC_ERROR_CODE = -32070`.

---

## Exception Classes

### `AppsEngineException`

**File:** `exceptions/AppsEngineException.ts`

Base exception for the framework. Used to signal a _known_ exception during app execution. Extends `Error`.

```typescript
import { AppsEngineException } from '@rocket.chat/apps-engine/definition/exceptions';

throw new AppsEngineException('Something went wrong');
```

Properties:
- `name`: `'AppsEngineException'`
- `message`: the error message string
- `getErrorInfo()`: returns `{ name, message }`
- Static `JSONRPC_ERROR_CODE = -32070`

---

### `UserNotAllowedException`

**File:** `exceptions/UserNotAllowedException.ts`

Thrown to prevent a user from performing a specific action. Extends `AppsEngineException`.

**Expected to be thrown in:**
- `IPreRoomCreatePrevent` -- prevent room creation
- `IPreRoomUserJoined` -- prevent user from joining a room
- `IPreRoomUserLeave` -- prevent user from leaving a room

```typescript
import { UserNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

// Inside executePreRoomUserJoined:
throw new UserNotAllowedException('User is banned and cannot join rooms');
```

---

### `FileUploadNotAllowedException`

**File:** `exceptions/FileUploadNotAllowedException.ts`

Thrown to prevent a file upload from completing. Extends `AppsEngineException`.

**Expected to be thrown in:**
- `IPreFileUpload`

```typescript
import { FileUploadNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

// Inside IPreFileUpload handler:
if (context.file.size > MAX_SIZE) {
    throw new FileUploadNotAllowedException('File exceeds maximum allowed size of 10MB');
}
```

---

### `InvalidSettingValueException`

**File:** `exceptions/InvalidSettingValueException.ts`

Thrown when an invalid value is provided for an app setting. Extends `AppsEngineException`.

**Expected to be thrown in:**
- Setting validation logic (e.g., `onPreSettingUpdate` / `onSettingUpdated`)

```typescript
import { InvalidSettingValueException } from '@rocket.chat/apps-engine/definition/exceptions';

// Inside onPreSettingUpdate:
if (newValue < 0) {
    throw new InvalidSettingValueException('Value must be a positive number');
}
```

---

### `EssentialAppDisabledException`

**File:** `exceptions/EssentialAppDisabledException.ts`

Internal framework exception. Informs the host that an app essential to a system action is disabled. Extends `AppsEngineException`.

**Not intended to be thrown manually by apps.** Used internally when an app registers as essential to events like `IPreMessageSentPrevent`, `IPreRoomUserJoined`, etc. and the app is currently disabled.

---

## Preventing Actions With Exceptions

### Prevent a Message from Being Sent

```typescript
import { IPreMessageSentPrevent } from '@rocket.chat/apps-engine/definition/messages';

class SpamBlocker implements IPreMessageSentPrevent {
    async checkPreMessageSentPrevent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        return message.text != null && message.text.includes('spam-word');
    }

    async executePreMessageSentPrevent(
        message: IMessage, read: IRead, http: IHttp, persistence: IPersistence,
    ): Promise<boolean> {
        // Return true to prevent; or throw an exception
        throw new AppsEngineException('Spam detected -- message blocked');
    }
}
```

### Prevent Room Creation

```typescript
import { IPreRoomCreatePrevent } from '@rocket.chat/apps-engine/definition/rooms';
import { UserNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

class RoomGatekeeper implements IPreRoomCreatePrevent {
    async executePreRoomCreatePrevent(
        room: IRoom, read: IRead, http: IHttp, persistence: IPersistence,
    ): Promise<boolean> {
        if (room.creator && isBanned(room.creator.id)) {
            throw new UserNotAllowedException('You are not allowed to create rooms');
        }
        return false; // allow
    }
}
```

### Prevent File Upload

```typescript
import { IPreFileUpload } from '@rocket.chat/apps-engine/definition/uploads';
import { FileUploadNotAllowedException } from '@rocket.chat/apps-engine/definition/exceptions';

class FileScanner implements IPreFileUpload {
    async [AppMethod.EXECUTE_PRE_FILE_UPLOAD](
        context: IFileUploadContext, read: IRead, http: IHttp,
        persis: IPersistence, modify: IModify,
    ): Promise<void> {
        const forbiddenTypes = ['.exe', '.sh', '.bat'];
        const ext = context.file.name.split('.').pop()?.toLowerCase();
        if (ext && forbiddenTypes.includes('.' + ext)) {
            throw new FileUploadNotAllowedException(`File type .${ext} is not allowed`);
        }
    }
}
```

---

## Best Practices for Error Messages

1. **Be specific and actionable.** `'File exceeds maximum size of 10MB'` is more helpful than `'Upload error'`.
2. **Do not expose internal details.** Do not include stack traces, file paths, or internal IDs in exception messages shown to users.
3. **Use the right exception class.** Use `UserNotAllowedException` for user permission denials, `FileUploadNotAllowedException` for file rejections, etc. The host may handle them differently in the UI.
4. **Return `false` in prevent handlers OR throw.** In `*Prevent` handlers, you can either return `true` from the `execute` method or throw an exception. Throwing is preferred when you need to provide a descriptive message to the user.
5. **Custom exceptions.** If you need custom error behavior beyond the built-in classes, extend `AppsEngineException`:
   ```typescript
   class RateLimitException extends AppsEngineException {
       constructor() { super('Rate limit exceeded. Please try again later.'); }
   }
   ```
