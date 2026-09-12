# RAG Report Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct RAG V1 indexing/retrieval defects and make validated RAG settings configurable per Rocket.Chat room.

**Architecture:** Persist room settings in Apps-Engine storage and propagate a validated request override to the backend. Persist scoped lexical chunks in PostgreSQL for both new and backfilled content; dense and lexical retrieval stay independently scoped and hybrid uses RRF. Keep V1 rollout capability explicit and retain legacy read policy.

**Tech Stack:** TypeScript, Vitest, Rocket.Chat Apps-Engine persistence/UIKit, Prisma/PostgreSQL FTS, Qdrant, LangChain splitters.

---

## File map

- `backend/rag/roomRagSettings.ts` — canonical validated backend request override and availability rules.
- `backend/controllers/rocketchatIntegration.controller.ts` / `src/lib/BackendClient.ts` — authenticated capability response and settings binding across enqueue/worker execution.
- `backend/rag/lexicalRetrieval.ts` — safe scoped PostgreSQL FTS, excerpts, lexical result normalization and RRF fusion.
- `backend/prisma/schema.prisma` and migration — retained lexical chunks with GIN full-text index.
- `backend/rag/lexicalChunks.ts` / `backend/scripts/backfillLexicalChunks.ts` — idempotent writes and checkpointed Qdrant backfill.
- `backend/services/scopedVectorSearch.ts` — mode orchestration, over-fetching, dense-only threshold and content-hash dedup.
- `backend/services/rocketchatIngestion.service.ts`, `backend/chatWorker.ts`, `backend/rag/chunking.ts`, `backend/utils/ragUtilities.ts` — correct chunk units, aligned embeddings, lexical writes and cleaned extraction.
- `backend/rag/queryRewrite.ts`, `backend/services/rocketchatChat.service.ts`, `backend/controllers/rocketchatIntegration.controller.ts` — multilingual rewriting and validated settings consumption.
- `src/persistence/ragSettingsStore.ts`, `src/uikit/modals/RagSettingsModal.ts`, `src/handlers/ViewSubmitHandler.ts`, `src/lib/BackendClient.ts`, message handlers — room-scoped persistence, authorization and request propagation.

## Mandatory GitNexus gate

Before editing **every existing function, class, or method** named or discovered in a task, run `node .gitnexus/run.cjs impact <symbol> --direction upstream` (or the equivalent GitNexus tool) and record direct callers, affected processes, and risk. This includes helpers in `rag/context.ts`, `webChatRetrieval.service.ts`, `retrievalQuality.ts`, queue/worker handlers, telemetry/metrics, modal/handler/client code, config parsers and quality-corpus evaluators—not only the headline functions listed in individual tasks. If any impact result is HIGH or CRITICAL, stop, report the blast radius to the user, and obtain direction before editing that symbol. Run `detect-changes` before every commit and confirm that only planned symbols/processes changed.

### Task 1: Define and validate room retrieval overrides

**Files:**
- Create: `backend/rag/roomRagSettings.ts`
- Test: `backend/tests/rag/roomRagSettings.test.ts`
- Modify: `backend/config/env.ts`, `backend/.env.example`

- [ ] **Step 1: Write failing tests** for accepted enum values, 3/5/8/10/15 limits, dense-only thresholds, 1,500-character prompt rejection, 512-token truncation/budget, unavailable lexical modes, and tampered input rejection.
- [ ] **Step 2: Run** `pnpm vitest run tests/rag/roomRagSettings.test.ts`; verify the assertions fail because the validator is absent.
- [ ] **Step 3: Run GitNexus impact** for `parseConfig` and report direct callers/risk before editing configuration symbols.
- [ ] **Step 4: Implement** a pure parser returning a typed immutable override; add `RAG_LEXICAL_RETRIEVAL_ENABLED` capability config and no silent mode fallback. Define a signed/authenticated backend capability response so the App can hide unavailable keyword/hybrid options rather than guessing deployment readiness.
- [ ] **Step 5: Re-run focused test**; expect pass.

### Task 2: Persist searchable chunks and safe lexical retrieval

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_lexical_chunks/migration.sql`
- Create: `backend/rag/lexicalChunks.ts`, `backend/rag/lexicalRetrieval.ts`
- Test: `backend/tests/rag/lexicalRetrieval.test.ts`, `backend/tests/rag/lexicalChunks.test.ts`

- [ ] **Step 1: Write failing tests** that demand room/workspace-scoped lexical matches, actual excerpts/provenance, blank/operator-only query safety, deterministic ranking, no cross-room result, and active-version filtering.
- [ ] **Step 2: Run tests**; verify expected failures.
- [ ] **Step 3: Run GitNexus impact** for `scopedVectorSearch`, `RagChunk`, and `ChatSource`; report callers/processes. Stop and surface any HIGH/CRITICAL result before editing.
- [ ] **Step 4: Implement schema/migration** for idempotent lexical chunks keyed by source and stable vector/chunk identity, plus a PostgreSQL GIN `to_tsvector('simple', content)` index. Use parameterized scope predicates and `websearch_to_tsquery`, never interpolated user text.
- [ ] **Step 5: Implement writer and retrieval** with safe empty behavior, bounded excerpts, result provenance, active-document filtering, and test-injected Prisma seam.
- [ ] **Step 6: Run focused tests and Prisma generation**; expect pass.

### Task 3: Backfill and maintain lexical coverage

**Files:**
- Create: `backend/scripts/backfillLexicalChunks.ts`
- Modify: `backend/rag/ingestion.ts`, `backend/services/rocketchatIngestion.service.ts`, `backend/chatWorker.ts`, `backend/package.json`, `docs/production-rag-v1.md`
- Test: `backend/tests/rag/backfillLexicalChunks.test.ts`, `backend/tests/rag/ingestion.test.ts`

- [ ] **Step 1: Write failing tests** for exact persistence of newly ingested V1 and legacy/dual-write chunks, idempotent replays, Qdrant payload backfill checkpoints, failed-point retry, and mixed coverage: hybrid must fuse lexical for backfilled active sources while retaining dense-only results for active unbackfilled sources.
- [ ] **Step 2: Run tests**; verify failures reflect missing lexical writes/backfill.
- [ ] **Step 3: Run GitNexus impact** for `indexRagDocumentV1`, `ingestBase64Document`, and `scrapeAndIndexPage`; report blast radius before edits.
- [ ] **Step 4: Implement** lexical writes from the exact indexed chunk arrays and an explicit `rag:backfill-lexical` script that scrolls only known active collections, validates payload content, upserts deterministically, checkpoints errors, and emits coverage/failure counts. Instrument per-source lexical coverage so retrieval can apply the design's dense-only fallback only to incomplete active sources.
- [ ] **Step 5: Document** staged dual-write → backfill → quality-gate rollout and rollback triggers.
- [ ] **Step 6: Run focused tests**; expect pass.

### Task 4: Correct V1 chunk units, crawler embeddings, and HTML extraction

**Files:**
- Modify: `backend/rag/chunking.ts`, `backend/services/rocketchatIngestion.service.ts`, `backend/chatWorker.ts`, `backend/utils/ragUtilities.ts`
- Test: `backend/tests/rag/chunking.test.ts`, `backend/tests/rocketchatIngestion.service.test.ts` (or existing ingestion test), `backend/tests/chatWorker.test.ts`, `backend/tests/ragUtilities.test.ts`

- [ ] **Step 1: Write failing tests** proving structural V1 chunks honor 640-word budget (not 2,560), V1 web embeddings correspond exactly to `ragSegments`, and article extraction avoids duplicate/chrome text while retaining the full normalized title.
- [ ] **Step 2: Run tests**; verify failures against present behavior.
- [ ] **Step 3: Run GitNexus impact** for `splitParsedDocumentSegments`, `ingestBase64Document`, `scrapeAndIndexPage`, and `scrapeWebpage`; report blast radius before editing.
- [ ] **Step 4: Implement minimally:** pass V1 token settings directly; preserve clearly named legacy character conversion; create separate V1/legacy embedding arrays; select `article` else `body` after chrome removal.
- [ ] **Step 5: Re-run focused tests**; expect pass.

### Task 5: Make retrieval mode, deduplication and follow-up rewrite correct

**Files:**
- Modify: `backend/services/scopedVectorSearch.ts`, `backend/rag/queryRewrite.ts`, `backend/rag/context.ts`, `backend/services/rocketchatChat.service.ts`, `backend/services/webChatRetrieval.service.ts`, `backend/utils/retrievalQuality.ts`
- Test: `backend/tests/scopedVectorSearch.test.ts`, `backend/tests/rag/queryRewrite.test.ts`, `backend/tests/rag/context.test.ts`, `backend/tests/retrievalQuality.test.ts`, `backend/tests/rocketchatChat.service.test.ts`

- [ ] **Step 1: Write failing tests** for semantic/keyword/hybrid dispatch, 20–30 candidate over-fetch, RRF `k=60` tie breaking, configured Top-K, dense-only threshold, content-hash/chunk-ID dedup, Vietnamese ambiguous follow-up rewrite, and lower-priority bounded room instructions. Add a context-budget test proving the 512-token room-instruction reservation is subtracted from retrieval context and immutable grounding remains first.
- [ ] **Step 2: Run tests**; verify expected failures.
- [ ] **Step 3: Run GitNexus impact** for `scopedVectorSearch`, `rewriteQueryWithStructuredOutput`, and `processRocketChatChat`; report callers and risk. Stop for a HIGH/CRITICAL warning.
- [ ] **Step 4: Implement** mode orchestration and RRF without comparing lexical/RRF scores to cosine; replace 25-character keys; add Vietnamese/English ambiguity signals without a 12-word cap; subtract the prompt reservation from context construction; add immutable server guardrails before delimited room instructions.
- [ ] **Step 5: Re-run focused tests**; expect pass.

### Task 6: Implement Rocket.Chat room settings end-to-end

**Files:**
- Create: `src/persistence/ragSettingsStore.ts`
- Modify: `src/uikit/modals/RagSettingsModal.ts`, `src/handlers/ViewSubmitHandler.ts`, `src/lib/BackendClient.ts`, relevant message/command handler that constructs chat payload
- Test: `tests/08_RagSettingsStore.test.ts`, `tests/09_RagSettingsModal.test.ts`, `tests/10_ViewSubmitHandler_RagSettings.test.ts`, `tests/01_BackendClient.test.ts`

- [ ] **Step 1: Write failing App tests** for room-key isolation, missing-settings default, admin/moderator authorization denial, valid UIKit parsing, prompt bounds, persistence tampering rejection, authenticated backend capability loading, unavailable-mode hiding, and payload propagation.
- [ ] **Step 2: Run** `pnpm vitest run tests/08_RagSettingsStore.test.ts tests/09_RagSettingsModal.test.ts tests/10_ViewSubmitHandler_RagSettings.test.ts`; verify failures.
- [ ] **Step 3: Run GitNexus impact** for `handleViewSubmit`, `buildRagSettingsModal`, and `BackendClient`; report direct callers and risk before edits.
- [ ] **Step 4: Implement** association-scoped store, authorized submit path, rehydrated modal values, capability-aware mode options from the authenticated backend response, and settings payload propagation. Do not expose values that backend declares unavailable.
- [ ] **Step 5: Re-run focused App tests**; expect pass.

### Task 7: Complete request authentication, contract, and operational validation

**Files:**
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`, queue payload/types and worker dispatch, request validation/types, `backend/rag/telemetry.ts`, `backend/utils/metrics.ts`, `scripts/generate-contract.mjs` if contract shape changes
- Test: `backend/tests/integration/rocketchat.integration.test.ts`, `backend/tests/rag/qualityCorpus.test.ts`, `backend/tests/rag/telemetry.test.ts`, `tests/contract/*`, backend route tests
- Modify: `backend/rag/qualityCorpus.ts`, `docs/production-rag-v1.md`

- [ ] **Step 1: Write failing integration/contract tests** for a forged room/settings mismatch, unavailable modes, absent setting fallback, and a room setting reaching generation/retrieval with immutable grounding retained. Exercise controller → persisted job payload → worker → `processRocketChatChat`, proving only the canonical authenticated room/workspace-bound override survives serialization.
- [ ] **Step 2: Run targeted tests**; verify failures.
- [ ] **Step 3: Run GitNexus impact** for the integration controller handler(s); report blast radius before edit.
- [ ] **Step 4: Implement** request-bound identity validation, canonical override binding before enqueue, worker-only consumption of that bound payload, and contract update. Add redacted telemetry for lexical coverage plus per-mode no-result/error/latency; never record prompts or document bodies. Add quality corpus fields for language, scope, mode and expected chunk/source IDs, with candidate-depth independent of display Top-K.
- [ ] **Step 5: Add and run a failing-then-passing quality-corpus test** proving Recall/MRR candidate depth stays 10 (or benchmark depth) regardless of room `topK`; then run contract and focused tests.

### Task 8: Final verification and handoff

- [ ] **Step 1: Run** `pnpm run test:ci` and `pnpm run typecheck` from `backend`.
- [ ] **Step 2: Run** root `pnpm vitest run`, `pnpm run typecheck:sdk`, and `pnpm run typecheck:tests` so all new App tests run (not only the fixed `test:unit` subset).
- [ ] **Step 3: Run** `pnpm prisma generate`, then migration validation against the test database when Docker is available (`pnpm run db:test:up` and `pnpm prisma migrate deploy`). `pnpm run test:ci` does not invoke the package's `pretest`; do not claim migration verification unless these Docker-dependent commands completed. Run `git diff --check` and `node .gitnexus/run.cjs detect-changes` for the worktree.
- [ ] **Step 4: Compare modified symbols to the planned file map; inspect for scope leaks, prompt logging, and untracked generated artifacts.**
- [ ] **Step 5: Commit focused, reviewable changes; report test evidence, migration/backfill command, rollout prerequisites, and Docker-dependent checks not run.**
