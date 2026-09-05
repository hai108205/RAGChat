# RAG v1 Rollout Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make v1 migration fallback coverage-driven and make chunk/history budgets token-aware while preserving existing chat contracts.

**Architecture:** Retrieval returns per-source active-manifest coverage for one profile; adapters use it to query legacy only for missing sources. Chunking uses an explicit approximate-token length function and message history uses LangChain trimming before generation.

**Tech Stack:** TypeScript, Vitest, Prisma, Qdrant, `@langchain/core`, `@langchain/textsplitters`.

---

### Task 1: Coverage-driven legacy-read policy

**Files:**
- Modify: `backend/rag/retrieval.ts`
- Modify: `backend/services/scopedVectorSearch.ts`
- Modify: `backend/controllers/chatMessage.controller.ts`
- Test: `backend/tests/rag/retrieval.test.ts`

- [x] Write failing tests that reject an empty-v1 fallback and allow only explicitly missing coverage or runtime availability fallback.
- [x] Run the retrieval test and verify it fails for the previous result-count policy.
- [x] Add a typed coverage decision and restrict legacy queries to uncovered source IDs.
- [x] Run the retrieval test and verify it passes.

### Task 2: Token-aware chunk and history budgets

**Files:**
- Modify: `backend/rag/chunking.ts`
- Modify: `backend/utils/contextBuilder.ts`
- Modify: `backend/services/rocketchatChat.service.ts`
- Test: `backend/tests/rag/chunking.test.ts`
- Test: `backend/tests/contextBuilder.test.ts`

- [x] Write failing tests for token-unit chunk sizing and human-first bounded history.
- [x] Run the focused tests and verify failures.
- [x] Use explicit length calculation for splitters and `trimMessages` for history trimming.
- [x] Run focused tests and verify they pass.

### Task 3: Quality gate inputs and documentation

**Files:**
- Modify: `backend/rag/qualityGate.ts`
- Modify: `backend/rag/qualityCorpus.ts`
- Modify: `backend/scripts/evaluateRagQuality.ts`
- Modify: `docs/production-rag-v1.md`
- Test: `backend/tests/rag/qualityGate.test.ts`
- Test: `backend/tests/rag/qualityCorpus.test.ts`

- [x] Write failing tests for error-rate and p95-latency thresholds.
- [x] Run focused quality tests and verify failures.
- [x] Add supplied operational measurements to the gate without fabricating a production benchmark.
- [x] Run focused quality tests and verify they pass.

### Task 4: Verify and hand off

- [x] Run the full focused RAG regression suite and `pnpm run typecheck` from `backend`.
- [ ] Run GitNexus change detection before committing; if unavailable, report it explicitly and do not claim GitNexus verification.
- [ ] Run Docker-backed integration tests once Docker is available; do not claim deployment validation without it.
