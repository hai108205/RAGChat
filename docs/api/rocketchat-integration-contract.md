# Rocket.Chat Integration API Contract

## Overview

This document specifies the canonical integration contract between the Rocket.Chat App (`src/`) and the Node.js/Express backend (`backend/`).
The integration layer exposes dedicated endpoints under `/api/v1/integrations/rocketchat/*` to provide clean separation between Rocket.Chat bot events and end-user JWT web routes.

The architecture is designed specifically for Rocket.Chat's distributed environment:
- **Fail-Closed Security**: Shared Bearer token validated via constant-time comparison, strict callback origin allowlisting, and dev mode lockouts.
- **Asynchronous Execution via BullMQ**: Complies with Rocket.Chat's 10-second Deno runtime execution limit by returning `HTTP 202 Accepted` immediately and delegating RAG/ingestion to an isolated worker.
- **Durable State & Scoped Vector Search**: Isolates knowledge base documents by workspace, room, and thread.

---

## Authentication & Security

### 1. Ingress Authentication (Fail-Closed)
All incoming HTTP requests from Rocket.Chat to backend integration endpoints must include a shared Bearer token in the `Authorization` header:

```http
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
```

- **Constant-Time Comparison**: Validated using `crypto.timingSafeEqual` against `ROCKETCHAT_INTEGRATION_TOKEN` to prevent timing attacks.
- **Fail-Closed in Production**: If `ROCKETCHAT_INTEGRATION_TOKEN` is missing from the environment or mismatched in the header, the backend immediately throws during startup or returns `HTTP 401 Unauthorized`.
- **Development Mode Lockout**: Missing tokens in development are strictly rejected unless `ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true` is explicitly set.

### 2. Egress Webhook Callback Security
Webhook callbacks dispatched to Rocket.Chat (`callbackUrl`) are strictly validated before any HTTP connection is established:
- **Protocol Allowlist**: Only `http:` and `https:` schemes are permitted.
- **Credentials & Fragments**: Callbacks containing embedded credentials (`user:pass@host`) or URL fragments (`#hash`) are rejected (`HTTP 400`).
- **Trusted Origins**: In production, the callback URL's origin must match the `ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS` allowlist or `ROCKETCHAT_CALLBACK_BASE_URL`.

---

## Architecture & Queue Processing

```
Rocket.Chat Client ---> Rocket.Chat App (Apps-Engine)
                             |
                   POST /messages/async (HTTP 202)
                             v
                     Backend Controller
                             |
                     BullMQ Queue: rocketchat-integration-jobs
                             |
               +-------------+-------------+
               v                           v
     Integration Worker          PostgreSQL (Prisma)
   (Background Job Runner)     (RocketChatIntegrationJob)
               |
         RAG Pipeline
    (Qdrant + OpenRouter)
               |
               v
     Webhook Callback POST ---> CallbackEndpoint (Rocket.Chat)
```

### Deterministic Job Identifiers & Idempotency
- **Job ID Format**: `rc-job-${workspaceId}-${type}-${requestId}`
- Enqueue operations use BullMQ deterministic IDs to prevent duplicate jobs when network retries occur.
- Database job tracking model `RocketChatIntegrationJob` maintains lifecycle states: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.

### Correlation Identifiers
All requests support an `X-Request-Id` correlation header. The backend propagates this ID through BullMQ jobs, database records, structured logs, and webhook callbacks.

---

## Multi-Tenant Scope Policy

All data and vector search operations enforce strict tenant isolation using `RocketChatScope`:
- `workspaceId`: Rocket.Chat workspace ID or host identifier (defaults to `default`).
- `roomId`: Rocket.Chat room or channel identifier.
- `threadId`: Optional thread message identifier.

### Isolation Rules:
1. **Chat & Session Resolution**:
   - `User` record: `username: "rc_<workspaceId>_<rocketUserId>"`.
   - `Chat` record: Scoped by unique `rocketchatScopeKey` (`rc:<workspaceId>:<roomId>:<threadId>`).
2. **Document & Vector Isolation**:
   - `ChatSource` record: Scoped by unique `dedupeKey` (`rc:<workspaceId>:<roomId>:<threadId>:<filename>`).
   - Vector retrieval only searches collections matching the caller's authorized room and workspace scope. Cross-workspace and cross-room data leakage is strictly blocked.

---

## Document Ingestion & Policy

The ingestion pipeline supports multi-format parsing and enforces strict size limits:
- **Supported Formats**: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.md`, `.txt`, `.html`.
- **Preflight & Ingress Size Limit**: Raw files are capped at **7 MiB** (approx. 9.33 MiB Base64).
- **Express Body Parser Limit**: Configured to **20mb** in `app.ts` to accommodate JSON wrappers.
- **Integrity Verification**: Document headers are verified against magic byte signatures before parsing.

---

## Standard Response Envelope

All integration endpoints return a standardized JSON envelope:

### Success Response:
```json
{
  "statusCode": 200,
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

### Error Response:
```json
{
  "statusCode": 400,
  "success": false,
  "data": null,
  "message": "Validation failed",
  "errors": ["Specific field error or validation issue"]
}
```

---

## API Endpoints Reference

### 1. Enqueue Asynchronous Message (`POST /api/v1/integrations/rocketchat/messages/async`)

Enqueues a user query for asynchronous RAG processing. Returns `HTTP 202 Accepted` immediately.

#### Request:
```http
POST /api/v1/integrations/rocketchat/messages/async
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
Content-Type: application/json
X-Request-Id: ask-1788192000-abc123
```

```json
{
  "workspaceId": "default",
  "rocketUserId": "rocket-user-id",
  "roomId": "rocket-room-id",
  "threadId": "optional-thread-id",
  "placeholderId": "rocket-message-id",
  "requestId": "ask-1788192000-abc123",
  "query": "How do I configure OAuth in Rocket.Chat?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ],
  "model": "openai/gpt-4o-mini",
  "temperature": 0.7,
  "embeddingModel": "openai/text-embedding-3-small",
  "provider": "DEFAULT",
  "callbackUrl": "http://rocketchat:3000/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback"
}
```

#### Response (HTTP 202):
```json
{
  "statusCode": 202,
  "success": true,
  "data": {
    "status": "accepted",
    "jobId": "rc-job-default-chat-ask-1788192000-abc123",
    "requestId": "ask-1788192000-abc123",
    "duplicate": false
  },
  "message": "Message queued for processing"
}
```

---

### 2. Knowledge Base Statistics (`GET /api/v1/integrations/rocketchat/stats`)

Returns aggregated document counts and token usage statistics for the given scope.

#### Request:
```http
GET /api/v1/integrations/rocketchat/stats?workspaceId=default&roomId=room-123
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
```

#### Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "documents": [
      {
        "id": "c0a80123-0000-4000-8000-000000000001",
        "filename": "Rocket.Chat Admin Guide",
        "chunks_count": 42,
        "created_at": "2026-08-31T00:00:00.000Z"
      }
    ],
    "chats": [],
    "usage": {
      "inputTokens": 1520,
      "outputTokens": 840,
      "totalTokens": 2360
    }
  },
  "message": "Integration stats retrieved successfully"
}
```

---

### 3. List Knowledge Base Sources (`GET /api/v1/integrations/rocketchat/sources`)

Returns paginated sources indexed for the room or workspace.

#### Request:
```http
GET /api/v1/integrations/rocketchat/sources?workspaceId=default&roomId=room-123&limit=50&cursor=uuid-cursor
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
```

#### Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "sources": [
      {
        "id": "c0a80123-0000-4000-8000-000000000001",
        "filename": "guidelines.md",
        "documentationUrl": "rocketchat://default/room-123/guidelines.md",
        "chunksCount": 8,
        "totalPages": 1,
        "createdAt": "2026-08-31T00:00:00.000Z",
        "lastIndexedAt": "2026-08-31T00:05:00.000Z",
        "status": "ACTIVE",
        "embeddingModel": "openai/text-embedding-3-small",
        "embeddingDimensions": 1536
      }
    ],
    "nextCursor": null,
    "hasMore": false
  },
  "message": "Sources retrieved successfully"
}
```

---

### 4. Delete Source (`DELETE /api/v1/integrations/rocketchat/sources/{id}`)

Safely deletes an indexed document from PostgreSQL and initiates vector collection cleanup.

#### Request:
```http
DELETE /api/v1/integrations/rocketchat/sources/c0a80123-0000-4000-8000-000000000001?workspaceId=default&roomId=room-123
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
```

#### Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "id": "c0a80123-0000-4000-8000-000000000001",
    "deleted": true,
    "vectorsRemoved": true,
    "qdrant": {
      "deleted": true
    }
  },
  "message": "Source deleted successfully"
}
```

---

### 5. Submit User Feedback (`POST /api/v1/integrations/rocketchat/feedback`)

Records user feedback rating on AI responses into telemetry and audit event logs.

#### Request:
```http
POST /api/v1/integrations/rocketchat/feedback
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
Content-Type: application/json
```

```json
{
  "workspaceId": "default",
  "roomId": "GENERAL",
  "rocketUserId": "rocket-user-id",
  "chatMessageId": "a0000000-0000-4000-8000-000000000002",
  "rating": "positive",
  "feedbackText": "Very helpful answer!"
}
```

#### Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "recorded": true,
    "rating": "positive",
    "chatMessageId": "a0000000-0000-4000-8000-000000000002"
  },
  "message": "Feedback submitted successfully"
}
```

---

### 6. Base64 Source Ingestion (`POST /api/v1/integrations/rocketchat/sources/base64`)

Enqueues document ingestion from Rocket.Chat file upload hooks.

#### Request:
```http
POST /api/v1/integrations/rocketchat/sources/base64
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
Content-Type: application/json
```

```json
{
  "workspaceId": "default",
  "rocketUserId": "rocket-user-id",
  "roomId": "GENERAL",
  "threadId": "optional-thread-id",
  "filename": "guidelines.md",
  "contentBase64": "IyBHdWlkZWxpbmVz...",
  "contentType": "text/markdown",
  "embeddingModel": "openai/text-embedding-3-small",
  "requestId": "upload-1788192000-xyz",
  "callbackUrl": "http://rocketchat:3000/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback"
}
```

#### Response (HTTP 202):
```json
{
  "statusCode": 202,
  "success": true,
  "data": {
    "status": "accepted",
    "jobId": "rc-job-default-ingestion-upload-1788192000-xyz",
    "requestId": "upload-1788192000-xyz"
  },
  "message": "Source queued for ingestion"
}
```

---

### 7. Fast Utility Completion (`POST /api/v1/integrations/rocketchat/utilities/completion`)

Executes fast text transformations or direct scoped semantic search (`/summarize`, `/explain`, `/translate`, `/search`).

#### Request:
```http
POST /api/v1/integrations/rocketchat/utilities/completion
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
Content-Type: application/json
```

```json
{
  "operation": "search",
  "query": "OAuth configuration",
  "topK": 5,
  "workspaceId": "default",
  "roomId": "GENERAL"
}
```

#### Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "results": [
      {
        "title": "OAuth Setup Guide",
        "snippet": "OAuth configuration allows authentication via Google, GitHub...",
        "pageUrl": "rocketchat://default/GENERAL/oauth-setup.md",
        "relevance": 0.88,
        "metadata": {
          "sourceId": "c0a80123-0000-4000-8000-000000000001"
        }
      }
    ]
  },
  "message": "Operation completed successfully"
}
```

---

## App Webhook Callback Contract

Upon job completion or failure, the worker dispatches a POST request to `callbackUrl`:

### 1. `chat_completed`
```json
{
  "event": "chat_completed",
  "request_id": "ask-1788192000-abc123",
  "user_id": "rocket-user-id",
  "room_id": "rocket-room-id",
  "thread_id": "optional-thread-id",
  "placeholder_id": "rocket-message-id",
  "query": "How do I configure OAuth in Rocket.Chat?",
  "answer": "To configure OAuth, navigate to Administration > Settings > OAuth...",
  "sources": [
    {
      "title": "OAuth Setup Guide",
      "snippet": "OAuth configuration allows authentication via Google, GitHub...",
      "pageUrl": "https://docs.rocket.chat/setup/oauth",
      "relevance": 0.92
    }
  ],
  "model": "openai/gpt-4o-mini"
}
```

### 2. `chat_failed`
```json
{
  "event": "chat_failed",
  "request_id": "ask-1788192000-abc123",
  "user_id": "rocket-user-id",
  "room_id": "rocket-room-id",
  "thread_id": "optional-thread-id",
  "placeholder_id": "rocket-message-id",
  "query": "user query",
  "error": "Failed to retrieve documents or LLM provider timed out"
}
```

### 3. `indexing_complete`
```json
{
  "event": "indexing_complete",
  "request_id": "upload-1788192000-xyz",
  "user_id": "rocket-user-id",
  "room_id": "rocket-room-id",
  "thread_id": "optional-thread-id",
  "document_name": "guidelines.md",
  "chunks_count": 8,
  "sourceId": "c0a80123-0000-4000-8000-000000000001"
}
```

### 4. `indexing_failed`
```json
{
  "event": "indexing_failed",
  "request_id": "upload-1788192000-xyz",
  "user_id": "rocket-user-id",
  "room_id": "rocket-room-id",
  "thread_id": "optional-thread-id",
  "document_name": "guidelines.md",
  "error": "Document could not be parsed: EMPTY_FILE"
}
```
