# Rocket.Chat RAG E2E Quality Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live evaluator that uploads `tests/DOC_RAG.txt` through the Rocket.Chat integration API, exercises the real ingestion/chat workers, and reports synthetic-question RAG quality.

**Architecture:** Keep the live runner in `backend/scripts/` so normal unit CI does not call external services. Put deterministic HTTP response parsing, polling decisions, judge normalization, metric aggregation, and report rendering in small helpers under `backend/scripts/ragE2E/`; the runner orchestrates them and uses Prisma read-only only to observe async job/message completion. All ingestion and chat execution remains through the Rocket.Chat integration HTTP endpoints.

**Tech Stack:** TypeScript, `tsx`, Vitest, native `fetch`, OpenAI-compatible chat completions, Prisma read-only queries, Redis/BullMQ/Qdrant through the running backend and worker.

---

### Task 1: Define the evaluator contract and deterministic helpers

**Files:**
- Create: `backend/scripts/ragE2E/types.ts`
- Create: `backend/scripts/ragE2E/metrics.ts`
- Test: `backend/tests/rag/rocketChatE2E.test.ts`

- [ ] **Step 1: Write failing tests for run identity and metric aggregation**

  Cover unique run scope/request IDs, p50/p95 latency, error rate, empty evidence rate, answer/judge score averages, and threshold pass/fail behavior. Use fixed timestamps and outcomes; do not call a model or service.

- [ ] **Step 2: Run the focused test to verify it fails for the missing helper contract**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: FAIL because the new evaluator helper module does not exist.

- [ ] **Step 3: Implement the minimal types and metric functions**

  Define generated question, submitted case, persisted evidence, judge score, evaluator configuration, and report types. Implement stable run scope generation, percentile calculation, aggregate metrics, and explicit threshold evaluation.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit the helper contract**

  Run: `git add backend/scripts/ragE2E/types.ts backend/scripts/ragE2E/metrics.ts backend/tests/rag/rocketChatE2E.test.ts && git commit -m "test: define Rocket.Chat RAG E2E metrics"`

### Task 2: Add HTTP envelope parsing and polling helpers

**Files:**
- Create: `backend/scripts/ragE2E/http.ts`
- Modify: `backend/tests/rag/rocketChatE2E.test.ts`

- [ ] **Step 1: Write failing tests for API envelope parsing and retry decisions**

  Cover successful `ApiResponse` parsing, non-2xx errors with safe messages, active source detection, completed/failed job decisions, timeout decisions, and exponential polling delay capped by configuration.

- [ ] **Step 2: Run the focused test to verify the new cases fail**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: FAIL only in the new HTTP/polling cases.

- [ ] **Step 3: Implement native-fetch integration helpers**

  Add authenticated JSON POST/GET helpers using `Authorization: Bearer <integration token>`, send the same unique ID in `X-Request-Id` and the required body `requestId`, verify the response header, parse `{ success, data, message }`, and keep response bodies bounded in thrown errors. Add pure polling predicates and a small injectable sleep function so unit tests never wait. Treat `FAILED` as terminal only after the persisted job `attempts` reaches the configured BullMQ attempt count, because the current worker can write `FAILED` between retries; when the queue's `opts.attempts` is observable, use it as the source of truth and warn if the env fallback differs.

- [ ] **Step 4: Run focused tests and verify all helper tests pass**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit the transport helpers**

  Run: `git add backend/scripts/ragE2E/http.ts backend/tests/rag/rocketChatE2E.test.ts && git commit -m "test: add Rocket.Chat evaluator transport helpers"`

### Task 3: Add question generation and judge normalization

**Files:**
- Create: `backend/scripts/ragE2E/llm.ts`
- Modify: `backend/tests/rag/rocketChatE2E.test.ts`

- [ ] **Step 1: Write failing tests for strict JSON normalization**

  Cover a valid question-set response, Markdown-fenced JSON, missing required fields, invalid case counts, invalid judge scores, and a judge response that contains extra prose. Tests should exercise the normalizer directly and use no network calls.

- [ ] **Step 2: Run focused tests and confirm the normalizer cases fail**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: FAIL in the new LLM normalization cases.

- [ ] **Step 3: Implement the OpenAI-compatible generation/judge adapter**

  Resolve credentials from the validated backend runtime configuration, support OpenAI or OpenRouter base URLs, and use a configurable model. Generate supported and unsupported Vietnamese cases from the full document with a strict JSON schema prompt. Judge each answer against the question, reference answer, source evidence, persisted retrieved snippets, and citations. Parse plain or fenced JSON, clamp/validate scores, and fail the case clearly when the judge output is unusable. Never log API keys.

- [ ] **Step 4: Run focused tests and verify all pure LLM helper tests pass**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit the generation/judge adapter**

  Run: `git add backend/scripts/ragE2E/llm.ts backend/tests/rag/rocketChatE2E.test.ts && git commit -m "test: add synthetic question and judge adapter"`

### Task 4: Add report rendering and the live Rocket.Chat runner

**Files:**
- Create: `backend/scripts/ragE2E/report.ts`
- Create: `backend/scripts/evaluateRocketChatRagE2E.ts`
- Modify: `backend/package.json`
- Modify: `backend/tests/rag/rocketChatE2E.test.ts`

- [ ] **Step 1: Write failing tests for report rendering and configuration validation**

  Assert Markdown includes run scope, ingestion metrics, aggregate scores, failures, and synthetic-label warnings. Assert missing base URL/token/document and invalid case count produce actionable configuration errors. Ensure report rendering never includes credential values.

- [ ] **Step 2: Run focused tests and confirm the new cases fail**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: FAIL in report/configuration cases.

- [ ] **Step 3: Implement the live runner**

  Read the document as UTF-8 from the repository-root default path, validate the configured backend URL/token/`rocketUserId`, create a unique `workspaceId` and `roomId`, and upload the file as base64 with `contentType: "text/plain"` to `/sources/base64`. Poll `/sources` until the source is active and indexed. Generate the configured number of questions, submit each via `/messages/async` with `rocketUserId`, `provider`, `model`, and the same unique ID in the body and `X-Request-Id`, verify the response header, poll Prisma read-only for the matching integration job and persisted chat message/source rows, wait through intermediate BullMQ failures until attempts are exhausted, judge each completed case, aggregate metrics, and write exact files `rag-e2e-${runId}.json` and `rag-e2e-${runId}.md` under `artifacts/rag-e2e/`. Keep test data by default; only delete the run’s source when `RAG_E2E_CLEANUP=true`, and attempt that cleanup in `finally`.

  Use `RAG_E2E_CASES=50` by default, allow a smaller smoke run, serialize requests by default, and expose bounded timeout/poll settings including parsed `RAG_E2E_WORKER_ATTEMPTS=3`; define `RAG_E2E_ROCKET_USER_ID` with default `rag-e2e-user`. Retry question generation three times, network requests three times, and malformed judge JSON once with a repair prompt; exclude `judgeError` cases from score averages and report their count. Do not use web routes or JWT routes. Disconnect Prisma in a `finally` block. Exit non-zero on required live failures or configured score thresholds.

- [ ] **Step 4: Add the package script**

  Add `rag:evaluate-rocketchat-e2e`: `tsx scripts/evaluateRocketChatRagE2E.ts` without changing the existing labelled-corpus evaluator.

- [ ] **Step 5: Run focused tests and verify report/configuration behavior**

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit the runner and report**

  Run: `git add backend/scripts/ragE2E backend/scripts/evaluateRocketChatRagE2E.ts backend/package.json backend/tests/rag/rocketChatE2E.test.ts && git commit -m "feat: add Rocket.Chat RAG E2E evaluator"`

### Task 5: Verify against live services and inspect change scope

**Files:**
- No planned source changes; generated reports go under ignored/local `artifacts/rag-e2e/`.

- [ ] **Step 1: Run typecheck and focused tests**

  Run: `pnpm --dir backend run typecheck`

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

- [ ] **Step 2: Run a live smoke evaluation**

  Run with the user’s live services and credentials: `$env:RAG_E2E_CASES='10'; pnpm --dir backend run rag:evaluate-rocketchat-e2e`

  Expected: source becomes active, all submitted cases reach a terminal worker state, a JSON/Markdown report is written, and the command reports actual quality metrics or a precise live-service failure.

- [ ] **Step 3: Run the full 50-case evaluation when smoke is healthy**

  Run: `$env:RAG_E2E_CASES='50'; pnpm --dir backend run rag:evaluate-rocketchat-e2e`

  Expected: full report with 50 synthetic cases and per-case evidence/judge outcomes.

- [ ] **Step 4: Run GitNexus change detection before any implementation commit**

  Run: `node .gitnexus/run.cjs detect-changes --scope all --repo RAGChat --limit 100`

  Expected: only the planned evaluator files are attributed to this implementation; pre-existing worktree changes must be called out separately.

- [ ] **Step 5: Run GitNexus change detection before each implementation commit**

  Run: `node .gitnexus/run.cjs detect-changes --scope all --repo D:\\Work\\Study\\RAGChat\\.worktrees\\rocketchat-rag-e2e-quality --limit 100`

  Expected: only the planned evaluator files and report-ignore rule are attributed to this implementation; pre-existing changes in the main worktree must be called out separately. Run this immediately before every implementation commit.

- [ ] **Step 6: Run final verification**

  Run: `pnpm --dir backend run typecheck`

  Run: `pnpm --dir backend vitest run tests/rag/rocketChatE2E.test.ts`

  Run: `git diff --check`

  Expected: exit code 0 for typecheck, focused tests, and diff check; live result is reported exactly from the evaluator output.
