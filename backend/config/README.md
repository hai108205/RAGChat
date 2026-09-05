# Backend configuration

`env.ts` is the only schema for backend runtime configuration. It validates
environment values before production clients are constructed and exposes typed,
grouped configuration through `runtime.ts`.

Copy `../.env.example` to `../.env` for local backend execution. Do not use an
example file as a Docker runtime env file, and never use the former predictable
Rocket.Chat token fallback. `CIPHER_KEY` must be generated as `openssl rand
-base64 32`.

Production requires a Rocket.Chat integration token and at least one trusted
callback origin. It also requires either `OPENAI_API_KEY` or both OpenRouter
keys. Optional feature values are documented in `../.env.example`.

## RAG v1 rollout

Set `RAG_V1_ENABLED=true` to enable the versioned index. During migration, use
`RAG_V1_DUAL_WRITE_ENABLED=true` to keep legacy collections current and
`RAG_V1_DUAL_READ_ENABLED=true` to merge v1 and legacy candidates. The legacy
availability escape hatch (`RAG_ALLOW_LEGACY_AVAILABILITY_FALLBACK`) is opt-in
and should be disabled once v1 coverage is complete. Collection names are
derived from `RAG_INDEX_VERSION`, `EMBEDDING_MODEL`, and vector dimensions; do
not change those values for an existing index without a planned re-index.

The non-destructive checkpointed backfill command is `pnpm rag:backfill`.
Set `RAG_BACKFILL_CHECKPOINT` and optionally `RAG_BACKFILL_LIMIT`; it never
deletes legacy collections or source records.
