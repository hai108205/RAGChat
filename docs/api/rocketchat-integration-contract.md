# Rocket.Chat Integration API Contract

## Overview

This document specifies the integration contract between the Rocket.Chat App (`src/`) and the Node.js/Express backend (`backend/`).
The integration layer exposes dedicated endpoints under `/api/v1/integrations/rocketchat/*` to provide clean separation between Rocket.Chat bot events and end-user JWT web routes.

---

## Authentication

All incoming HTTP requests from Rocket.Chat to the backend integration endpoints must include a shared Bearer token in the `Authorization` header:

```http
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
```

- Backend validates against the `ROCKETCHAT_INTEGRATION_TOKEN` environment variable.
- If no token is configured on either side in development mode, requests are accepted with a security warning logged.
- In production, missing or mismatched tokens return `HTTP 401 Unauthorized`.

---

## Standard Response Envelope

All integration endpoints return a standardized JSON envelope:

```json
{
  "statusCode": 200,
  "success": true,
  "data": {},
  "message": "Success message"
}
```

For error responses:

```json
{
  "statusCode": 400,
  "success": false,
  "data": null,
  "message": "Error description",
  "errors": ["Specific field error or details"]
}
```

---

## Identity & State Mapping

Rocket.Chat event payloads provide Rocket.Chat-specific identifiers:
- `workspaceId`: Rocket.Chat workspace ID or host identifier (defaults to `default`).
- `rocketUserId`: Rocket.Chat user ID (e.g. `user-123`).
- `roomId`: Rocket.Chat room ID (e.g. `GENERAL` or `d1f2e3...`).
- `threadId`: Optional thread message ID (e.g. `t-456`).

### Backend Mapping:
1. **User Resolution**:
   - Backend looks up or creates a `User` record with `username: "rc_<workspaceId>_<rocketUserId>"`.
   - `isVerified: true`, `isAdmin: false`.
2. **Chat Resolution**:
   - Backend looks up or creates a `Chat` record for the user named `RC Room <roomId> [Thread <threadId>]`.
   - Reuses existing chat or creates on demand.

---

## API Endpoints

### 1. Enqueue Asynchronous Message (`POST /api/v1/integrations/rocketchat/messages/async`)

Enqueues a user query for RAG question answering. Returns HTTP 202 immediately to comply with Rocket.Chat's 10-second Deno runtime execution limit.

#### Request:
```http
POST /api/v1/integrations/rocketchat/messages/async
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
Content-Type: application/json
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
  "model": "gpt-4o",
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
    "jobId": "job-uuid-123",
    "requestId": "ask-1788192000-abc123"
  },
  "message": "Message queued for processing"
}
```

---

### 2. Knowledge Base Statistics (`GET /api/v1/integrations/rocketchat/stats`)

Returns indexed documents, active chats, and token usage summary for the workspace or room.

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
        "id": "source-uuid",
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

### 3. Base64 Source Ingestion (`POST /api/v1/integrations/rocketchat/sources/base64`)

Uploads and indexes raw files (`.pdf`, `.docx`, `.txt`, `.md`, `.csv`, `.xlsx`, `.html`) sent through Rocket.Chat file upload hooks.

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
  "roomId": "rocket-room-id",
  "threadId": "optional-thread-id",
  "filename": "guidelines.md",
  "contentBase64": "IyBHdWlkZWxpbmVz...",
  "contentType": "text/markdown",
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
    "jobId": "job-upload-1788192000-xyz",
    "requestId": "upload-1788192000-xyz"
  },
  "message": "Source queued for ingestion"
}
```

---

### 4. Utility Text Operations (`POST /api/v1/integrations/rocketchat/utilities/completion`)

Performs direct text transformations for slash commands (`/search`, `/summarize`, `/explain`, `/translate`).

#### Request:
```http
POST /api/v1/integrations/rocketchat/utilities/completion
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
Content-Type: application/json
```

```json
{
  "operation": "summarize",
  "text": "Long text to summarize...",
  "targetLang": "vi",
  "concept": "Microservices",
  "query": "search keyword",
  "topK": 5
}
```

#### Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "result": "Summary text or explanation or translation",
    "results": [
      {
        "title": "Document Title",
        "snippet": "Matching snippet text",
        "relevance": 0.85
      }
    ]
  },
  "message": "Operation completed successfully"
}
```

---

## App Webhook Callback Contract

When asynchronous operations complete (or fail), the backend POSTs the result to the Rocket.Chat App's public callback endpoint:
`POST /api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback`

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
  "model": "gpt-4o"
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
  "document_name": "guidelines.md",
  "error": "Document could not be parsed"
}
```
