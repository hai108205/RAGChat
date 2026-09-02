# Handoff: SDK-Backend Compatibility Implementation

**Ngay tao:** 2026-09-02T21:20 +07:00
**Branch:** refactor/backend
**Repo:** D:\Work\Study\RAGChat
**Plan goc:** plan.md

---

## COMPLETED (7 Tasks)

### Task 1 - Contract drift gate [DONE]
- Commit: 18b9eb7 test(contract): freeze Rocket.Chat integration API
- contracts/rocketchat-integration.openapi.yaml - OpenAPI 3.1 7 endpoints + 4 callbacks
- scripts/check-integration-contract.mjs - drift gate
- src/lib/generated/IntegrationApi.ts, backend/types/generated/IntegrationApi.ts, backend/utils/generated/rocketchatSchemas.ts
- .github/workflows/compatibility.yml
- Envelope standard: {statusCode, success, data, message}

### Task 2 - Fail-closed auth & correlation [DONE]
- Commit: fix(security): close Rocket.Chat integration auth and callback gaps
- backend/middlewares/integrationAuth.middleware.ts - crypto.timingSafeEqual, fail-closed
- backend/utils/validateEnv.ts - throw before HTTP bind if token missing
- Callback URL validation - http/https only, reject credentials/fragment
- BackendClient.ts sends X-Request-Id on all requests
- Env vars: ROCKETCHAT_INTEGRATION_TOKEN, ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS, ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV
- 35/35 integration tests pass, 108 total

### Task 3 - Scope policy & migration [DONE]
- Commit: 3525ab7 feat(scope): enforce Rocket.Chat workspace room and thread isolation
- backend/utils/rocketchatScope.ts - RocketChatScope, buildChatSourceScopeWhere, buildStatsScopeWhere, verifySourceDeletionScope, verifyFeedbackScope, buildRocketChatScopeKey
- backend/prisma/schema.prisma - Chat has 4 scope cols + rocketchatScopeKey @unique; ChatSource has dedupeKey @unique
- Migration: backend/prisma/migrations/20260902_add_rocketchat_scope/
- Backfill: backend/scripts/backfillRocketChatScope.ts
- getOrCreateRocketChatChat uses upsert by rocketchatScopeKey (concurrency-safe)
- /sources returns { sources, nextCursor, hasMore } cursor pagination
- 16/16 scope tests pass

### Task 4 - SDK settings propagation [DONE]
- Commit: feat(config): honor Rocket.Chat model and embedding settings
- src/utils/BackendRuntimeSettings.ts - centralized settings reader
- BackendClient.askAsync - 9 positional args PRESERVED, settings injected via reader
- Backend validates model/embedding allowlists, temperature 0-2
- ChatSource has embeddingModel, embeddingDimensions - migration 20260902_add_source_embedding_metadata
- RAG retrieval groups by (embeddingModel, embeddingDimensions)
- 114/114 backend pass, 6/6 SDK pass

### Task 6 - Document parser all formats [DONE]
- Commit: feat(ingestion): parse every SDK-supported document format
- backend/services/documentParser.ts - magic bytes + extension, UTF-8/BOM, Cheerio HTML, pdf-parse, mammoth DOCX, xlsx XLSX, jszip PPTX
- backend/utils/uploadPolicy.ts - 7 MiB max, base64 validation, filename sanitize, MIME allowlist
- SDK preflight in FileUploadHandler.ts rejects >7 MiB before base64
- JSON_BODY_LIMIT = 20mb in backend/app.ts
- Fixtures: backend/tests/fixtures/uploads/ - .txt .md .csv .html .pdf .docx .pptx .xlsx
- 32/32 parser tests pass, 26/26 E2E handler pass

### Task 10 - SDK timeouts & typed errors [DONE]
- Commit: fix(sdk): enforce Apps-Engine HTTP budgets and typed errors
- HTTP_TIMEOUT: ENQUEUE=5000, SEARCH=5000, UTILITY=8000, MANAGEMENT=8000
- Retry: GET/idempotent POST with X-Request-Id only; exponential backoff; fail-fast on 4xx
- BackendClientError typed class in src/lib/BackendTypes.ts
- Typed error constants in src/constants/Errors.ts
- 42/42 tests pass (01_BackendClient + 03_Observability)

### Task 11 - Test architecture [DONE - per plan.md checkboxes]
- Created tsconfig.sdk.json, tsconfig.tests.json
- Updated Apps-Engine 1.44 mocks (MockHttp, MockRead, MockModify, MockPersistence)
- Created tests/contract/compatibility-matrix.test.ts
- Scripts: typecheck:sdk, test:unit, test:contract

---

## REMAINING (5 Tasks)

### Task 5 - Durable BullMQ jobs [NOT STARTED]
IMPORTANT: backend/tests/rocketchatQueue.test.ts has UNCOMMITTED CHANGES - review first!

Files to create:
- backend/utils/rocketchatQueue.ts - BullMQ Queue, deterministic job ID: rc-${workspaceId}-${requestId}-${type}
- backend/workers/rocketchatIntegrationWorker.ts - Worker, concurrency=2, 3 retries, backoff, graceful shutdown
- backend/services/rocketchatChat.service.ts - pure RAG service, LLM error -> throw -> chat_failed callback
- backend/prisma/migrations/20260903_add_rocketchat_integration_jobs/migration.sql

Files to modify:
- backend/prisma/schema.prisma - add RocketChatIntegrationJob model:
  id, type (chat|ingestion), workspaceId, roomId, threadId?, requestId, status (PENDING|PROCESSING|COMPLETED|FAILED), payload Json, attempts Int, error?, timestamps
  @@unique([workspaceId, requestId, type])
- backend/controllers/rocketchatIntegration.controller.ts - handleAsyncMessage and handleBase64Source thin: validate -> upsert job -> queue.add -> 202
- backend/index.ts - start worker, Redis health check
- backend/Dockerfile - worker entrypoint
- docker/docker-compose.yml - add integration-worker service
- backend/package.json - add worker script

Impact gate: node .gitnexus/run.cjs impact -r RAGChat --direction upstream handleAsyncMessage
Commit: feat(queue): make Rocket.Chat async jobs durable and idempotent

### Task 7 - Semantic vector search [NOT STARTED]
DEPENDS ON: Task 5 (needs rocketchatChat.service.ts)

Files to create:
- backend/services/scopedVectorSearch.ts:
  Input: RocketChatScope + query + topK + embeddingModel
  Query Prisma ChatSource by scope -> group by (embeddingModel, embeddingDimensions)
  Embed query once per model group -> query Qdrant collection
  Normalize relevance 0-1, merge, sort, dedupe
  Return Array<{ title, snippet, pageUrl, relevance, metadata }>
  Qdrant unavailable -> throw code QDRANT_UNAVAILABLE

Files to modify:
- backend/controllers/rocketchatIntegration.controller.ts - handleUtilityCompletion search uses scopedVectorSearch
- backend/services/rocketchatChat.service.ts - RAG uses scopedVectorSearch (shared pipeline)
- src/lib/BackendClient.ts - search() add optional arg 6: options?: {workspaceId?: string; threadId?: string} - KEEP 5 existing positional args!
- src/commands/SearchCommand.ts - pass context.getThreadId() via options
- src/lib/BackendTypes.ts - add threadId to search types

CRITICAL impact gate: node .gitnexus/run.cjs impact -r RAGChat --direction upstream handleUtilityCompletion
Test: backend/tests/scopedVectorSearch.test.ts
Commit: feat(search): add scoped semantic retrieval for SDK search and RAG

### Task 8 - Stats/feedback/delete integrity [NOT STARTED]
CAN START after Task 3 complete (scope helpers already exist in backend/utils/rocketchatScope.ts)

Scope helpers already available:
- buildStatsScopeWhere(scope) -> for getStats
- verifyFeedbackScope(scope, chatMessageId) -> for feedback
- verifySourceDeletionScope(scope, sourceId, actorId, canManage) -> for delete

Files to create:
- backend/services/rocketchatStats.service.ts - use buildStatsScopeWhere
- backend/services/rocketchatFeedback.service.ts - use verifyFeedbackScope, store actorRocketUserId, 403 if out-of-scope
- backend/services/qdrantCleanupOutbox.service.ts - durable delete outbox logic
- backend/workers/qdrantCleanupWorker.ts - BullMQ worker, retry Qdrant delete, mark SUCCESS/DEAD
- backend/prisma/migrations/20260903_add_qdrant_cleanup_outbox/migration.sql

Files to modify:
- backend/prisma/schema.prisma - add QdrantCleanupOutbox model:
  id, collectionId @unique, status (PENDING|SUCCESS|DEAD), attempts, lastError?, payload Json?, timestamps
- backend/controllers/rocketchatIntegration.controller.ts - use new services
- backend/index.ts - start qdrant cleanup worker
- backend/app.ts - log route templates, NOT raw query params/tokens
- src/lib/BackendTypes.ts - add actorRocketUserId, canManageSources to delete/feedback types
- src/lib/BackendClient.ts - pass actor fields

Impact gate: node .gitnexus/run.cjs impact -r RAGChat --direction upstream getStats
Commit: fix(integration): scope stats feedback and source deletion

### Task 9 - Callback idempotency & delivery outbox [NOT STARTED]
DEPENDS ON: Task 5 (RocketChatIntegrationJob model) and Task 7 (service)

Files to create:
- src/types/CallbackEvents.ts - discriminated union: chat_completed, chat_failed, indexing_complete, indexing_failed
- src/persistence/callbackReceiptStore.ts - receipt key by jobId (fallback requestId), states PENDING/CLAIMED/COMPLETED/FAILED
- backend/services/rocketchatCallback.service.ts
- backend/services/rocketchatCallbackOutbox.service.ts - deliver with retry, mark BLOCKED/DEAD on 4xx
- backend/scripts/replayRocketChatCallbacks.ts - --job-id <id> and --all-blocked (replay from outbox, no re-run RAG)
- backend/prisma/migrations/20260903_add_rocketchat_callback_outbox/migration.sql

Files to modify:
- src/api/CallbackEndpoint.ts - validate event -> claim receipt -> process idempotent; duplicate -> 200; conflicting after terminal -> 409
- src/lib/BackendClient.ts - askAsync creates placeholderId BEFORE enqueue; sync error if enqueue fails
- src/handlers/FileUploadHandler.ts - create indexing placeholder before enqueue
- src/persistence/sessionStore.ts - addMessagesOnce(turnId, ...) check persistence before append
- backend/prisma/schema.prisma - add RocketChatCallbackOutbox model
- backend/workers/rocketchatIntegrationWorker.ts - write terminal result + outbox in transaction

Impact gate: node .gitnexus/run.cjs impact -r RAGChat --direction upstream CallbackEndpoint
Commit: fix(callback): make SDK callbacks typed durable and idempotent

### Task 12 - Full-stack verification & runbook [NOT STARTED]
DEPENDS ON: All tasks 5-11 complete

Files:
- docker/docker-compose.compat.yml - full stack with fake OpenAI server, isolated volumes
- tests/compat/run-compatibility.ps1 - smoke matrix
- docs/runbooks/rocketchat-integration.md
- Update README.md and docs/api/rocketchat-integration-contract.md

Final gate commands:
  node .gitnexus/run.cjs analyze
  node .gitnexus/run.cjs detect-changes --scope compare --base-ref main -r RAGChat
  npm.cmd run test:contract
  npm.cmd run test:unit
  pnpm.cmd --dir backend run test:ci
  npm.cmd run package:sdk
  docker compose -f docker/docker-compose.compat.yml up --build --abort-on-container-exit

Commit: docs: publish Rocket.Chat integration compatibility runbook

---

## CRITICAL RULES FOR NEXT AGENT

1. ALWAYS run impact gate before modifying any symbol:
   node .gitnexus/run.cjs impact -r RAGChat --direction upstream <SymbolName>

2. CRITICAL risk symbols (BackendClient, RagChatApp): do NOT shift positional args; only add optional args at end

3. Run MAX 2-3 subagents at once to avoid quota 429 errors

4. After each Task: node .gitnexus/run.cjs detect-changes --scope compare --base-ref main -r RAGChat

5. Do NOT work on Tasks 3, 5, 8 on same Prisma/controller files simultaneously - do sequentially

6. After modifying schema.prisma: pnpm exec prisma generate (in backend/)

## EXECUTION ORDER FOR NEXT AGENT

Step 1: git stash or review/commit backend/tests/rocketchatQueue.test.ts (has uncommitted changes)
Step 2: Run Task 5 alone (BullMQ jobs) - blocks Tasks 7 and 9
Step 3: Run Task 7 + Task 8 in parallel after Task 5 merges
Step 4: Run Task 9 after Task 5 + Task 7 done
Step 5: Run Task 12 after all above done

## BASELINE CHECK COMMANDS
git status
git log --oneline -5
node .gitnexus/run.cjs status
node scripts/check-integration-contract.mjs
pnpm.cmd --dir backend vitest run
npx.cmd vitest run tests/
