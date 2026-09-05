# RAG v1 Rollout Hardening

## Goal

Close the migration and token-budget gaps in the approved production RAG design without changing the public Web or Rocket.Chat contracts.

## Decisions

- Dual-read is driven by **coverage**, not retrieved-result count. A legacy read is permitted only for sources that have no active v1 manifest for the selected embedding profile. An empty v1 result remains a grounded no-result.
- Legacy availability fallback remains an explicit feature-flag path and is used only after a v1 runtime failure. It emits a bounded reason field.
- Chunk configuration is measured in approximate tokens through an explicit splitter length function. Existing environment variable names retain their public meaning.
- Conversation history is trimmed with LangChain `trimMessages`, preserving a human-first message sequence and a fixed token budget. The original user message remains outside the history window.
- Quality evaluation remains an operational gate: it must reject corpora below 50 labelled cases and will include availability/latency inputs rather than inferring production approval from unit tests.

## Compatibility and safety

All rollout flags default to false. Legacy collection deletion remains out of scope. The change adds no automatic cutover and performs no backfill or schema migration itself.

## Verification

Regression tests cover coverage-driven read decisions, empty-v1 no-fallback behavior, availability failures, token-length chunk boundaries, and human-first history trimming. Focused RAG tests and backend typecheck must pass before integration testing against a running Docker stack.
