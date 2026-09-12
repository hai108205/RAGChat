# Rocket.Chat Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the Rocket.Chat App to select and send the configured gateway LLM and OpenRouter embedding models.

**Architecture:** Keep the existing SELECT settings and backward-compatible model options, while changing new-install defaults to the gateway model names. Runtime settings and App Settings use the same constants so upload and chat payloads carry the selected values.

**Tech Stack:** TypeScript, Rocket.Chat Apps Engine, Vitest, pnpm.

---

### Task 1: Add gateway model settings

**Files:**
- Modify: `src/utils/BackendRuntimeSettings.ts`
- Modify: `src/settings/Settings.ts`

- [ ] Update defaults and allowed model lists with `api-ai.box/deepseek-v4-flash` and `openrouter/openai/text-embedding-3-small`, retaining existing options.
- [ ] Add the two values to the Rocket.Chat SELECT settings.

### Task 2: Verify and package

**Files:**
- Test: existing TypeScript/Vitest settings tests, if available.

- [ ] Run typecheck/tests.
- [ ] Build/package the Rocket.Chat App.
- [ ] Inspect the package output and report upgrade steps.
