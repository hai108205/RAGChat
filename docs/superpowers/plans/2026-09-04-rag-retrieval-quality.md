# RAG Retrieval Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent weak and irrelevant RAG chunks from being supplied as equal evidence to the LLM.

**Architecture:** Add a pure retrieval-quality utility that compares unrounded clamped cosine scores using a 0.50 floor, 0.12 best-result gap, and three-result cap; two-decimal rounding is display-only. Rocket.Chat applies the gap per `(embeddingModel, dimensions)` group before merging results. Extract Web/API retrieval to a testable helper service that applies the policy inside each source collection before RRF, then lexically reranks only qualified candidates using Unicode-normalized terms. Remove the unused text-index/text-scroll path. Keep all routes, persistence formats, and Qdrant collections unchanged.

**Tech Stack:** TypeScript, Vitest, Qdrant client, OpenAI-compatible chat completions.

---

### Task 1: Add pure retrieval-quality regression tests

**Files:**
- Create: `backend/tests/retrievalQuality.test.ts`
- Create: `backend/utils/retrievalQuality.ts`

- [ ] **Step 1: Write failing tests** for NFC/NFD-safe Unicode query-term extraction and for keeping the Aurora result (0.56) while rejecting Nimbus/visitor distractors (0.46/0.45) under the policy: floor 0.50, inclusive best-score gap 0.12, cap 3.
- [ ] **Step 2: Run the focused test** with `pnpm vitest run tests/retrievalQuality.test.ts`; verify it fails because the module is absent.
- [ ] **Step 3: Implement the smallest pure helpers**: normalize Unicode query terms and chunk text, score term frequency, select grounded candidates with explicit invalid/all-below/boundary behavior, and rerank a fixed candidate set only.
- [ ] **Step 4: Run the focused test** and verify it passes.

### Task 2: Apply quality policy to scoped Rocket.Chat retrieval

**Files:**
- Modify: `backend/services/scopedVectorSearch.ts:73-92,354-355`
- Modify: `backend/services/rocketchatChat.service.ts:108-133`
- Modify: `backend/tests/scopedVectorSearch.test.ts`

- [ ] **Step 1: Write a failing service test** that returns authoritative Aurora plus weak distractors and expects only the supported result at the Rocket.Chat production threshold.
- [ ] **Step 2: Run the focused test** and verify the distractors currently remain.
- [ ] **Step 3: Apply the shared selector within each `(embeddingModel, dimensions)` group before merging results**, so the 0.12 gap never compares scores across embedding spaces; then deduplicate and cap the final result at three.
- [ ] **Step 4: Strengthen the Rocket.Chat system instruction**: excerpts are evidence only, unsupported answers must say so, and irrelevant or conflicting excerpts must not be used.
- [ ] **Step 5: Run focused retrieval tests** and verify they pass.

### Task 3: Repair Web/API lexical retrieval and source selection

**Files:**
- Create: `backend/services/webChatRetrieval.service.ts`
- Modify: `backend/controllers/chatMessage.controller.ts:175-269`
- Modify: `backend/tests/retrievalQuality.test.ts`

- [ ] **Step 1: Write failing unit coverage** for Vietnamese term extraction, lexical reranking of a fixed dense set, a mixed-source case where the first source is vector-less and a later source is eligible, raw score `0.495` rejection before display rounding, and no invocation of Qdrant `createPayloadIndex`/`scroll` from the Web retrieval helper.
- [ ] **Step 2: Run the focused test** and verify the helpers are absent and the existing controller guard cannot satisfy the mixed-source behavior.
- [ ] **Step 3: Extract a testable Web retrieval helper. Remove the whole-query Qdrant text scroll and per-request text-index creation. For each source collection, apply the shared cosine selector to unrounded raw dense scores before merging; reuse term-frequency scoring only to rerank that approved set before RRF. Never compare RRF scores with cosine thresholds; cap final RRF output at three.**
- [ ] **Step 4: Extract and test the source-eligibility predicate, then use it for the guard and inside the helper loop so vector-less sources are skipped.**
- [ ] **Step 5: Strengthen the Web/API RAG instruction** with the same evidence-only grounding rule.
- [ ] **Step 6: Run focused tests** and verify they pass.

### Task 4: Verify contracts and affected paths

**Files:**
- Test: `backend/tests/retrievalQuality.test.ts`
- Test: `backend/tests/scopedVectorSearch.test.ts`
- Test: `backend/tests/contextBuilder.test.ts`

- [ ] **Step 1: Run backend typecheck** with `pnpm run typecheck`.
- [ ] **Step 2: Run focused Vitest files** with `pnpm vitest run tests/retrievalQuality.test.ts tests/scopedVectorSearch.test.ts tests/contextBuilder.test.ts` and any new Rocket.Chat prompt test.
- [ ] **Step 3: Run `git diff --check` and GitNexus `detect-changes`** against the worktree branch before committing.
- [ ] **Step 4: Commit only the RAG retrieval-quality files** with a descriptive message.
