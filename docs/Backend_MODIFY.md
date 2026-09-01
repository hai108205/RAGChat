# Backend Integration-Only Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyen backend RAGChat sang mo hinh phuc vu Rocket.Chat App la chinh, loai bo auth/login web-app khong can thiet, va bo sung cac API thuc te cho quan ly tai lieu RAG.

**Architecture:** Backend se giu `User` nhu internal identity mapping cho Rocket.Chat (`workspaceId + rocketUserId`), nhung khong con flow dang ky/dang nhap/JWT cho nguoi dung web. Tat ca endpoint Rocket.Chat di qua shared integration token. Cac tinh nang SDK/UI se duoc trien khai theo lop mong: backend contract truoc, Rocket.Chat App UI sau.

**Tech Stack:** Node.js, Express, TypeScript, Prisma/PostgreSQL, Qdrant, BullMQ/Redis, Rocket.Chat Apps-Engine, Vitest/Supertest.

---

## Current Reality

Backend hien co 2 nhom API:

- Web-app API: `/api/v1/user`, `/api/v1/apikey`, `/api/v1/chat`, `/api/v1/chat-message`, `/api/v1/usage`, `/api/v1/admin`.
- Rocket.Chat integration API: `/api/v1/integrations/rocketchat`.

Rocket.Chat App hien da co async Q&A, callback, upload hook, slash commands va basic citations. Backend integration hien co:

- `POST /api/v1/integrations/rocketchat/messages/async`
- `GET /api/v1/integrations/rocketchat/stats`
- `POST /api/v1/integrations/rocketchat/sources/base64`
- `POST /api/v1/integrations/rocketchat/utilities/completion`

Nhung con thieu:

- `GET /sources` co filter dung theo workspace/room/thread.
- `DELETE /sources/:id` xoa an toan Postgres + Qdrant.
- `POST /feedback`.
- callback tra `chatMessageId` de App gan action vao cau tra loi.
- base64 upload ghi vector thuc su vao Qdrant hoac di qua worker durable.
- room/workspace source ownership ro rang. Hien tai upload gan source vao chat cua uploader, trong khi retrieval doc `chat.chatSources` cua user dang hoi. Neu khong sua, tai lieu upload trong room co the chi search duoc boi nguoi upload.

## Impact And Risk Notes

GitNexus status ngay 2026-09-01: index up-to-date tai commit `ea9ad5a`.

Impact da xac nhan:

- `getOrCreateRocketChatUser`: 2 direct callers, 2 affected processes, LOW risk.
- Affected processes: `handleAsyncMessage`, `handleBase64Source`.

Manual router review:

- Bo login/JWT web-app la HIGH/CRITICAL risk neu lam bang cach xoa thang `User` hoac `verifyStrictJWT`, vi cac router `chat`, `chat-message`, `apikey`, `usage`, `admin`, `user` dang phu thuoc vao `req.user`.
- Giai phap an toan: tach route surface. Giu internal `User`, bo/disable web auth routes, va khong dung JWT cho Rocket.Chat integration.

Before editing any symbol, run GitNexus impact:

```bash
node .gitnexus/run.cjs impact -r RAGChat <symbolName> --direction upstream
```

Before commit:

```bash
node .gitnexus/run.cjs detect-changes -r RAGChat
```

---

## Scope Decisions

### Keep

- `User` model as internal identity, because `Chat`, `UsageEvents`, and `AuditEvent` require `userId`.
- `verifyIntegrationToken`, because Rocket.Chat App still needs backend authentication.
- `Chat`, `ChatSource`, `DocumentPage`, `ChatMessage`, `ChatMessageSource`, `UsageEvents`, `AuditEvent`.
- Async callback architecture from backend to Rocket.Chat App.

### Remove Or Disable

- Public register/login/logout/refresh/reset/verify-email user flows.
- Per-user API key management if deployment uses server-side `OPENROUTER_*` or `OPENAI_*` env vars.
- Admin impersonation/dashboard features unless a web admin UI remains.

### Defer

- Duplicate/superseded document detection by semantic similarity.
- Stale document pruning by retrieval-hit age.
- Regenerate with per-message tuning.
- Full UIKit settings modal/persona.
- Clipboard copy button.

---

## Target File Structure

### Backend Files

- Modify: `backend/app.ts`
  - Optionally stop mounting web-only routers.
  - Increase JSON body limit for Rocket.Chat file uploads.

- Modify: `backend/routers/rocketchatIntegration.route.ts`
  - Add source CRUD and feedback routes.

- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
  - Add `listSources`, `deleteSource`, `submitFeedback`.
  - Return `chatMessageId` in `chat_completed` callback.
  - Fix base64 ingestion path.

- Modify: `backend/utils/validationSchemas.ts`
  - Add schemas for source list, source id param, feedback body.

- Modify: `backend/utils/rocketchatIdentity.ts`
  - Keep internal user creation.
  - Add helpers only if needed for workspace/room scoped source lookup.

- Modify: `backend/utils/qdrantCleanup.ts`
  - Reuse `deleteQdrantCollectionSafe` or add point-delete helper if collection is shared.

- Optional Create: `backend/utils/sourceDeletion.ts`
  - Encapsulate safe source deletion transaction and Qdrant cleanup.

- Optional Create: `backend/utils/base64Ingestion.ts`
  - Encapsulate text decode, chunking, embedding, Qdrant upsert, and `DocumentPage` creation.

- Optional Create: `backend/utils/rocketchatScope.ts`
  - Build and parse Rocket.Chat source/chat scope: `workspaceId`, `roomId`, `threadId`.
  - Attach room-scoped sources to each user's internal chat before retrieval.

- Test: `backend/tests/integration/rocketchat.integration.test.ts`
  - Extend existing integration tests.

- Optional Test: `backend/tests/sourceDeletion.test.ts`
  - Unit tests for safe deletion logic.

### Rocket.Chat App Files

- Modify later: `src/lib/BackendClient.ts`
  - Add `listSources`, `deleteSource`, `submitFeedback`.

- Modify later: `src/lib/BackendTypes.ts`
  - Add source and feedback DTOs.

- Create later: `src/commands/RagCommand.ts`
  - `/rag docs`, `/rag help`.

- Create later: `src/handlers/BlockActionHandler.ts`
  - Feedback/delete/inspect button actions.

- Modify later: `RagChatApp.ts`, `app.json`
  - Add UIKit interaction interfaces and permissions.

---

## Task 1: Protect The Integration Surface And Disable Web Auth Routes

**Files:**
- Modify: `backend/app.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`
- Optional Test: create `backend/tests/integration/web-routes-disabled.test.ts`

- [x] **Step 1: Run impact analysis**

Run:

```bash
node .gitnexus/run.cjs impact -r RAGChat app --direction upstream
node .gitnexus/run.cjs impact -r RAGChat verifyStrictJWT --direction upstream --file backend/middlewares/auth.middleware.ts
node .gitnexus/run.cjs impact -r RAGChat verifyIntegrationToken --direction upstream --file backend/middlewares/integrationAuth.middleware.ts
```

Expected:

- `verifyIntegrationToken` should remain low-risk and tied to integration routes.
- `verifyStrictJWT` may look low in GitNexus callgraph because Express route chains are hard to infer, but manual router usage is high.

- [x] **Step 2: Decide route mode**

Preferred minimal mode:

- Keep mounting `/api/v1/integrations/rocketchat`.
- Keep `/healthz` and `/metrics`.
- Disable or guard web routers by env flag.

Example design:

```ts
const ENABLE_WEB_ROUTES = process.env.ENABLE_WEB_ROUTES === "true";

if (ENABLE_WEB_ROUTES) {
    app.use("/api/v1/user", userRouter);
    app.use("/api/v1/apikey", apikeyRouter);
    app.use("/api/v1/chat", chatRouter);
    app.use("/api/v1/chat-message", chatMessageRouter);
    app.use("/api/v1/usage", usageRouter);
    app.use("/api/v1/admin", adminRouter);
}

app.use("/api/v1/integrations/rocketchat", rocketchatRouter);
```

- [x] **Step 3: Increase request body limit**

Current `16kb` is not realistic for base64 upload. Use an env-configurable limit.

```ts
const jsonLimit = process.env.JSON_BODY_LIMIT || "10mb";
app.use(express.json({ limit: jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonLimit }));
```

- [x] **Step 4: Write tests**

Add tests:

- Integration endpoints still require `ROCKETCHAT_INTEGRATION_TOKEN`.
- `/api/v1/user/login` is unavailable when `ENABLE_WEB_ROUTES !== "true"`.
- `/api/v1/integrations/rocketchat/stats` still works with token.

Run:

```bash
cd backend
pnpm vitest run tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend/app.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "refactor: make backend integration-only by default"
```

---

## Task 2: Keep Internal Rocket.Chat Identity Without Login/Auth

**Files:**
- Modify: `backend/utils/rocketchatIdentity.ts`
- Modify: `backend/prisma/schema.prisma` only if removing password/refresh fields now
- Test: `backend/tests/rocketchatIdentity.test.ts`

- [x] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat getOrCreateRocketChatUser --direction upstream
node .gitnexus/run.cjs impact -r RAGChat normalizeRocketChatUsername --direction upstream
```

Expected:

- Direct callers: `handleAsyncMessage`, `handleBase64Source`.
- Risk: LOW for helper changes, HIGH if schema drops `User`.

- [x] **Step 2: Keep `User`, do not delete it**

Do not remove `User` model yet. Internal user identity is still required by:

- `Chat.userId`
- `UsageEvents.userId`
- `AuditEvent.userId`
- Rocket.Chat usage tracking

- [x] **Step 3: Make helper explicitly integration-owned**

If needed, rename comments/fields semantically without changing DB columns:

```ts
/**
 * Creates an internal service identity for a Rocket.Chat user.
 * This is not a login account and should not receive a password.
 */
```

- [x] **Step 4: Consider schema cleanup only after tests pass**

Optional later migration:

- keep `User.id`, `username`, `email`, `fullname`, `isAdmin`, timestamps.
- drop or ignore `password`, `refreshToken`, `isVerified` only after all web auth routes are disabled.

- [x] **Step 5: Run tests**

```bash
cd backend
pnpm vitest run tests/rocketchatIdentity.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/utils/rocketchatIdentity.ts backend/tests/rocketchatIdentity.test.ts
git commit -m "refactor: keep rocketchat users as internal identities"
```

---

## Task 3: Define Room/Workspace Source Scope

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/utils/rocketchatIdentity.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Optional Create: `backend/utils/rocketchatScope.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`
- Test: `backend/tests/rocketchatIdentity.test.ts`

- [x] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat ChatSource --direction upstream
node .gitnexus/run.cjs impact -r RAGChat getOrCreateRocketChatChat --direction upstream --file backend/utils/rocketchatIdentity.ts
node .gitnexus/run.cjs impact -r RAGChat getOrCreateRocketChatUser --direction upstream --file backend/utils/rocketchatIdentity.ts
```

Expected:

- `ChatSource` schema changes are MEDIUM/HIGH risk because source retrieval, listing, deletion, ingestion, and historical data depend on it.
- Warn before editing if GitNexus reports HIGH/CRITICAL.

- [x] **Step 2: Add explicit source scope fields**

Preferred schema addition:

```prisma
model ChatSource {
    id                     String         @id @unique @default(uuid())
    heading                String
    isVectorLess           Boolean        @default(false) @map("is_vector_less")
    documentationUrl       String         @map("documentation_url")
    totalPages             Int?           @map("total_pages")
    lastIndexedAt          DateTime?      @map("last_indexed_at")
    pagesIndexed           DocumentPage[]
    chats                  Chat[]         @relation("ChatToChatSource")
    collectionName         String?        @default("") @map("collection_name")
    documentTree           DocumentTree?
    createdAt              DateTime       @default(now()) @map("created_at")
    ingestionRuns          IngestionRun[]
    scrapeLimit            Int?           @map("scrape_limit")
    rocketchatWorkspaceId  String?        @map("rocketchat_workspace_id")
    rocketchatRoomId       String?        @map("rocketchat_room_id")
    rocketchatThreadId     String?        @map("rocketchat_thread_id")
    uploadedByRocketUserId String?        @map("uploaded_by_rocket_user_id")

    @@unique([documentationUrl, isVectorLess])
    @@index([rocketchatWorkspaceId, rocketchatRoomId, createdAt])
}
```

Do not add a separate `Workspace` or `Room` table yet. The integration only needs stable source scoping, not full Rocket.Chat metadata replication.

- [x] **Step 3: Store scope during upload**

When handling `POST /sources/base64`, persist:

```ts
rocketchatWorkspaceId: workspaceId,
rocketchatRoomId: roomId,
rocketchatThreadId: threadId || null,
uploadedByRocketUserId: rocketUserId,
```

- [x] **Step 4: Attach room-scoped sources to every user's internal chat**

In `getOrCreateRocketChatChat`, after the internal chat is found or created:

```ts
const roomSources = await prisma.chatSource.findMany({
    where: {
        rocketchatWorkspaceId: workspaceId || "default",
        rocketchatRoomId: roomId,
        OR: [
            { rocketchatThreadId: threadId || null },
            { rocketchatThreadId: null },
        ],
    },
    select: { id: true },
});

if (roomSources.length) {
    await prisma.chat.update({
        where: { id: chat.id },
        data: {
            chatSources: {
                connect: roomSources.map((source) => ({ id: source.id })),
            },
        },
    });
}
```

This keeps retrieval behavior simple: `retrieveRelevantSources(chat, query)` can continue using `chat.chatSources`, but every Rocket.Chat user in the room sees the same room knowledge base.

- [x] **Step 5: Backfill existing Rocket.Chat sources**

For existing rows where `documentationUrl` starts with `rocketchat://`, backfill fields by parsing:

```text
rocketchat://<workspaceId>/<roomId>/<filename>
```

If parsing fails, leave scope null and treat as legacy/global source.

- [x] **Step 6: Add tests**

Test cases:

- User A uploads source in room R.
- User B asks a question in room R.
- User B internal chat has User A's room-scoped source attached.
- `GET /sources?workspaceId=W&roomId=R` returns the uploaded source independent of uploader.

- [x] **Step 7: Run tests and migration**

```bash
cd backend
pnpm prisma migrate dev --name add_rocketchat_source_scope
pnpm vitest run tests/rocketchatIdentity.test.ts tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/utils/rocketchatIdentity.ts backend/controllers/rocketchatIntegration.controller.ts backend/tests/rocketchatIdentity.test.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "feat: scope rocketchat sources by workspace and room"
```

---

## Task 4: Fix Base64 Document Ingestion So Uploads Are Actually Searchable

**Files:**
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Optional Create: `backend/utils/base64Ingestion.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat handleBase64Source --direction upstream --file backend/controllers/rocketchatIntegration.controller.ts
node .gitnexus/run.cjs impact -r RAGChat retrieveRelevantSources --direction upstream --file backend/controllers/rocketchatIntegration.controller.ts
```

- [x] **Step 2: Choose ingestion path**

Preferred durable path:

- Decode base64.
- Chunk text.
- Generate embeddings.
- Create Qdrant collection.
- Upsert points with payload: `url`, `title`, `heading`, `body`, `chatSourceId`, `chunkType`.
- Create `DocumentPage` rows.
- Callback `indexing_complete`.

Do not only create `DocumentPage`; `retrieveRelevantSources` uses Qdrant.
Also do not attach the source only to the uploader's chat. Use the room/workspace scope from Task 3.

- [x] **Step 3: Add integration test with mocked Qdrant**

Test should verify:

- `qdrant.createCollection` called.
- `qdrant.upsert` called with points.
- `DocumentPage` count matches chunks or indexed pages.
- Later `messages/async` can retrieve source payload.

- [x] **Step 4: Implement minimal ingestion**

Pseudo-code:

```ts
const chunks = splitDocumentationContent(textContent, {
    chunkSize: 1000,
    chunkOverlap: 150,
});

await qdrant.createCollection(collectionName, {
    vectors: { size: 1536, distance: "Cosine" },
});

const embeddings = await generateVectorEmbeddings(chunks.map((c) => c.content)) as number[][];

await qdrant.upsert(collectionName, {
    wait: true,
    points: chunks.map((chunk, index) => ({
        id: crypto.randomUUID(),
        vector: embeddings[index],
        payload: {
            url: sourceUrl,
            title: filename,
            heading: chunk.heading || filename,
            body: chunk.content,
            chatSourceId: source.id,
            chunkType: chunk.chunkType,
            hasCodeBlock: chunk.hasCodeBlock,
        },
    })),
});
```

- [x] **Step 5: Run tests**

```bash
cd backend
pnpm vitest run tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/controllers/rocketchatIntegration.controller.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "fix: index rocketchat uploads into qdrant"
```

---

## Task 5: Add Source List API For `/rag docs`

**Files:**
- Modify: `backend/routers/rocketchatIntegration.route.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `backend/utils/validationSchemas.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat getStats --direction upstream --file backend/controllers/rocketchatIntegration.controller.ts
```

- [x] **Step 2: Add schema**

Add query schema:

```ts
export const rocketchatSourcesQuerySchema = {
    query: z.object({
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
        threadId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
};
```

- [x] **Step 3: Add controller**

Route contract:

```http
GET /api/v1/integrations/rocketchat/sources?workspaceId=default&roomId=abc
```

Response:

```json
{
  "statusCode": 200,
  "data": {
    "sources": [
      {
        "id": "source-id",
        "filename": "guide.md",
        "documentationUrl": "rocketchat://default/room/guide.md",
        "chunksCount": 12,
        "totalPages": 12,
        "createdAt": "2026-09-01T00:00:00.000Z",
        "lastIndexedAt": "2026-09-01T00:00:00.000Z",
        "status": "ACTIVE"
      }
    ]
  },
  "message": "Sources retrieved successfully"
}
```

Implementation detail:

- If `roomId` is provided, filter sources through related `Chat.name` convention or add a better explicit room metadata later.
- Preferred filter after Task 3:

```ts
where: {
    rocketchatWorkspaceId: workspaceId || "default",
    rocketchatRoomId: roomId,
}
```

- Legacy fallback for rows without scope: parse `documentationUrl` prefix `rocketchat://${workspaceId}/${roomId}/`.

- [x] **Step 4: Add route**

```ts
rocketchatRouter
    .route("/sources")
    .get(validate(rocketchatSourcesQuerySchema), listSources);
```

- [x] **Step 5: Keep `/stats` as compatibility endpoint**

Do not remove `/stats` yet. It is used by `BackendClient.listDocuments`.

- [x] **Step 6: Run tests**

```bash
cd backend
pnpm vitest run tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add backend/routers/rocketchatIntegration.route.ts backend/controllers/rocketchatIntegration.controller.ts backend/utils/validationSchemas.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "feat: add rocketchat source listing api"
```

---

## Task 6: Add Safe Source Deletion API

**Files:**
- Modify: `backend/routers/rocketchatIntegration.route.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Optional Create: `backend/utils/sourceDeletion.ts`
- Modify: `backend/utils/validationSchemas.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat deleteQdrantCollectionSafe --direction upstream --file backend/utils/qdrantCleanup.ts
node .gitnexus/run.cjs impact -r RAGChat ChatSource --direction upstream
```

If GitNexus reports HIGH/CRITICAL for schema/entity edits, stop and warn before implementation.

- [x] **Step 2: Add param schema**

```ts
export const rocketchatSourceIdParamSchema = {
    params: z.object({
        id: z.string().uuid("Invalid source ID"),
    }),
};

export const rocketchatDeleteSourceSchema = {
    query: z.object({
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
        mode: z.enum(["room", "global"]).default("room"),
    }),
};
```

- [x] **Step 3: Implement safe delete rules**

Rules:

- Find `ChatSource` by `id`.
- Require `workspaceId` and `roomId` for default `mode=room`.
- Verify the source belongs to that workspace/room using explicit scope fields or legacy `documentationUrl` fallback.
- Count linked chats.
- If `mode=room`, delete the room-scoped source. If the source is legacy/shared across unrelated chats, disconnect it from matching room chats and do not delete vectors.
- If `mode=global`, delete the source globally only after explicit caller intent and only when safe.
- Delete Qdrant collection only when no remaining `ChatSource` references the same `collectionName`.
- Delete DB rows in transaction.
- `DocumentPage` cascades via Prisma relation.
- `ChatMessageSource` does not currently reference `ChatSource`; do not delete historical citations unless explicitly required.

Initial API can delete a scoped source by default:

```http
DELETE /api/v1/integrations/rocketchat/sources/:id?workspaceId=default&roomId=abc&mode=room
```

Response:

```json
{
  "statusCode": 200,
  "data": {
    "id": "source-id",
    "deleted": true,
    "vectorsRemoved": true,
    "qdrant": {
      "deleted": true
    }
  },
  "message": "Source deleted successfully"
}
```

- [x] **Step 4: Add tests**

Test cases:

- Missing/invalid integration token returns 401.
- Unknown source returns 404.
- Source with collection deletes Qdrant collection and DB row.
- Missing Qdrant collection is idempotent success.
- `mode=room` rejects when `workspaceId` or `roomId` is missing.
- Shared collection does not delete vectors if still referenced.

- [x] **Step 5: Run tests**

```bash
cd backend
pnpm vitest run tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/routers/rocketchatIntegration.route.ts backend/controllers/rocketchatIntegration.controller.ts backend/utils/validationSchemas.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "feat: add safe rocketchat source deletion"
```

---

## Task 7: Add Feedback API

**Files:**
- Modify: `backend/routers/rocketchatIntegration.route.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `backend/utils/validationSchemas.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat createAuditEvent --direction upstream
node .gitnexus/run.cjs impact -r RAGChat handleAsyncMessage --direction upstream --file backend/controllers/rocketchatIntegration.controller.ts
```

- [x] **Step 2: Add feedback schema**

```ts
export const rocketchatFeedbackSchema = {
    body: z.object({
        messageId: z.string().optional(),
        chatMessageId: z.string().uuid("Invalid chatMessageId").optional(),
        rating: z.enum(["positive", "negative"]),
        feedbackText: z.string().max(2000).optional(),
        rocketUserId: z.string().min(1),
        workspaceId: z.string().optional(),
        roomId: z.string().optional(),
    }),
};
```

- [x] **Step 3: Implement controller**

Store as `AuditEvent` first:

```ts
await createAuditEvent("rocketchat.feedback", user.id, chatIdOrNull, {
    messageId,
    chatMessageId,
    rating,
    feedbackText,
    rocketUserId,
    workspaceId,
    roomId,
});
```

Do not create a new `Feedback` table until reporting requirements are clear.

- [x] **Step 4: Add route**

```ts
rocketchatRouter
    .route("/feedback")
    .post(validate(rocketchatFeedbackSchema), submitFeedback);
```

- [x] **Step 5: Run tests**

```bash
cd backend
pnpm vitest run tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/routers/rocketchatIntegration.route.ts backend/controllers/rocketchatIntegration.controller.ts backend/utils/validationSchemas.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "feat: record rocketchat answer feedback"
```

---

## Task 8: Return `chatMessageId` In Async Callback

**Files:**
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify later: `src/api/CallbackEndpoint.ts`
- Modify later: `src/persistence/sessionStore.ts` only if storing backend ids locally
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [ ] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat handleAsyncMessage --direction upstream --file backend/controllers/rocketchatIntegration.controller.ts
```

- [ ] **Step 2: Extend callback payload**

Add:

```ts
chat_message_id: chatMessage.id,
```

to `chat_completed`.

- [ ] **Step 3: Update tests**

Assert callback body contains:

```json
{
  "event": "chat_completed",
  "chat_message_id": "<uuid>"
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend
pnpm vitest run tests/integration/rocketchat.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/rocketchatIntegration.controller.ts backend/tests/integration/rocketchat.integration.test.ts
git commit -m "feat: include chat message id in rocketchat callbacks"
```

---

## Task 9: Update Rocket.Chat App Backend Client Contract

**Files:**
- Modify: `src/lib/BackendClient.ts`
- Modify: `src/lib/BackendTypes.ts`
- Test: existing app build/test command from `package.json`

- [ ] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat BackendClient --direction upstream --file src/lib/BackendClient.ts
```

- [ ] **Step 2: Add DTOs**

Add:

```ts
export interface SourceDocument {
    id: string;
    filename: string;
    documentationUrl?: string;
    chunksCount: number;
    totalPages?: number;
    createdAt?: string;
    lastIndexedAt?: string;
    status: "ACTIVE" | "EMPTY" | "FAILED";
}

export interface SourcesListData {
    sources: SourceDocument[];
}

export interface FeedbackPayload {
    messageId?: string;
    chatMessageId?: string;
    rating: "positive" | "negative";
    feedbackText?: string;
    rocketUserId: string;
    workspaceId?: string;
    roomId?: string;
}
```

- [ ] **Step 3: Add client methods**

```ts
public async listSources(workspaceId?: string, roomId?: string, threadId?: string): Promise<SourceDocument[]>
public async deleteSource(sourceId: string, workspaceId: string, roomId: string, mode?: "room" | "global"): Promise<boolean>
public async submitFeedback(payload: FeedbackPayload): Promise<boolean>
```

- [ ] **Step 4: Keep old `listDocuments` compatibility**

`listDocuments` can call `/stats` until `/rag docs` is migrated.

- [ ] **Step 5: Run build**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: TypeScript build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/BackendClient.ts src/lib/BackendTypes.ts
git commit -m "feat: add source and feedback backend client methods"
```

---

## Task 10: Add Minimal `/rag docs` Command

**Files:**
- Create: `src/commands/RagCommand.ts`
- Modify: `RagChatApp.ts`
- Modify: `src/constants/Commands.ts`
- Test/build: app TypeScript build

- [ ] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat RagChatApp --direction upstream --file RagChatApp.ts
node .gitnexus/run.cjs impact -r RAGChat COMMANDS --direction upstream --file src/constants/Commands.ts
```

- [ ] **Step 2: Implement only useful subcommands**

Support:

- `/rag docs`
- `/rag help`

Defer:

- `/rag prune`
- `/rag settings`

- [ ] **Step 3: Render as plain message first**

Use text/attachment output before UIKit modal:

```text
Knowledge Base

1. guide.md
   Chunks: 12
   Last indexed: 2026-09-01
```

- [ ] **Step 4: Register command**

In `RagChatApp.extendConfiguration`, add:

```ts
configuration.slashCommands.provideSlashCommand(new RagCommand())
```

- [ ] **Step 5: Run build**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add RagChatApp.ts src/constants/Commands.ts src/commands/RagCommand.ts
git commit -m "feat: add rag docs command"
```

---

## Task 11: Add UIKit Actions After Backend Contract Is Stable

**Files:**
- Modify: `app.json`
- Modify: `RagChatApp.ts`
- Create: `src/handlers/BlockActionHandler.ts`
- Create: `src/handlers/ViewSubmitHandler.ts`
- Optional Create: `src/uikit/blocks/DocumentListBlock.ts`
- Optional Create: `src/uikit/modals/ConfirmDeleteModal.ts`

- [ ] **Step 1: Run impact analysis**

```bash
node .gitnexus/run.cjs impact -r RAGChat RagChatApp --direction upstream --file RagChatApp.ts
```

- [ ] **Step 2: Add permissions**

Add only if required by Apps-Engine version:

```json
{ "name": "ui.interact" },
{ "name": "ui.registerButtons" }
```

- [ ] **Step 3: Implement `IUIKitInteractionHandler`**

Add handler methods:

- `executeBlockActionHandler`
- `executeViewSubmitHandler`
- `executeViewClosedHandler`
- `executeActionButtonHandler`

Unused handlers should return success response.

- [ ] **Step 4: Add feedback buttons first**

Actions:

- thumbs up
- thumbs down

Payload should include:

- Rocket.Chat message id
- backend `chatMessageId` if available
- room id
- user id

- [ ] **Step 5: Add delete confirmation only after source delete API passes**

Deletion flow:

- `/rag docs` shows source list.
- User clicks delete.
- App opens confirmation modal.
- Submit calls `DELETE /sources/:sourceId`.
- App sends private/user notification on success/failure.

- [ ] **Step 6: Run build**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app.json RagChatApp.ts src/handlers/BlockActionHandler.ts src/handlers/ViewSubmitHandler.ts
git commit -m "feat: add rocketchat uikit source actions"
```

---

## Task 12: Remove Dead Backend Dependencies After Integration Path Works

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/app.ts`
- Delete later: `backend/controllers/user.controller.ts`
- Delete later: `backend/controllers/apikey.controller.ts`
- Delete later: `backend/controllers/admin.controller.ts`
- Delete later: unused routers/middlewares/tests

- [ ] **Step 1: Run detect changes before destructive cleanup**

```bash
node .gitnexus/run.cjs detect-changes -r RAGChat
```

- [ ] **Step 2: Remove only after replacement tests pass**

Do not delete controllers until:

- Rocket.Chat async Q&A passes.
- Rocket.Chat upload/index passes.
- source list/delete/feedback passes.
- app build passes.

- [ ] **Step 3: Drop dependencies only when imports are gone**

Candidates after web auth removal:

- `bcrypt`
- `jsonwebtoken`
- `resend`

Only remove if `rg` shows no production imports.

Run:

```bash
rg "bcrypt|jsonwebtoken|resend" backend
```

- [ ] **Step 4: Prisma migration**

Only after route cleanup:

```bash
cd backend
pnpm prisma migrate dev --name remove_web_auth_fields
```

Expected:

- Migration generated.
- Existing internal Rocket.Chat users remain valid.

- [ ] **Step 5: Full backend tests**

```bash
cd backend
pnpm vitest run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/prisma/schema.prisma backend/prisma/migrations backend/app.ts
git commit -m "refactor: remove unused web auth backend"
```

---

## Verification Checklist

- [ ] GitNexus impact was run before each symbol edit.
- [ ] `node .gitnexus/run.cjs detect-changes -r RAGChat` was run before commit.
- [ ] Integration token still protects all Rocket.Chat backend endpoints.
- [ ] Login/register/reset routes are disabled by default.
- [ ] Rocket.Chat App can ask a question and receive callback.
- [ ] Uploaded document is searchable through Qdrant retrieval.
- [ ] `/sources` returns room/workspace relevant documents.
- [ ] `DELETE /sources/:sourceId` handles DB and Qdrant safely.
- [ ] Feedback writes audit telemetry.
- [ ] App build succeeds after client contract changes.

---

## Recommended Execution Order

1. Task 1: Integration-only route surface.
2. Task 2: Internal Rocket.Chat identity.
3. Task 3: Room/workspace source scope.
4. Task 4: Fix base64 Qdrant ingestion.
5. Task 5: Source list API.
6. Task 6: Safe source deletion API.
7. Task 7: Feedback API.
8. Task 8: Callback `chatMessageId`.
9. Task 9: App BackendClient contract.
10. Task 10: Minimal `/rag docs`.
11. Task 11: UIKit actions.
12. Task 12: Dead auth cleanup.

This order keeps the system shippable after each phase and avoids deleting auth-related code before the Rocket.Chat integration path can fully replace it.
