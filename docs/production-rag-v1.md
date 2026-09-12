# Production RAG v1

The backend now supports a versioned RAG index behind feature flags. `RAG_V1_ENABLED` enables the new path; `RAG_V1_DUAL_WRITE_ENABLED` keeps the legacy per-source collection in sync, and `RAG_V1_DUAL_READ_ENABLED` merges both paths during rollout. `RAG_ALLOW_LEGACY_AVAILABILITY_FALLBACK` is an explicit availability escape hatch and should be disabled after migration.

## Ingestion

Documents are normalized before hashing. A `RagDocument` manifest records the source, content/version hashes, embedding profile, collection, status, and chunk count. Qdrant points use deterministic SHA-256 IDs derived from source, version, locator, index, and normalized content. Replaying the same source/version/profile is an idempotent upsert and does not create duplicate chunks.

The shared v1 collection name is derived from index version, embedding model, and vector dimensions. Payloads include tenant scope (`chatId` or Rocket.Chat workspace/room/thread), document and chunk IDs, source URL, locator, hashes, and document metadata. Rocket.Chat null thread scope is encoded as an empty string so Qdrant filters remain deterministic.

## Retrieval and answer generation

Web and Rocket.Chat retrieval first use active v1 manifests and a Qdrant scope filter. During dual-read, they query legacy only for sources without an active v1 manifest in the selected profile; an empty v1 result is a grounded no-result, not a fallback trigger. A v1 runtime failure may use legacy only when the explicit availability flag is enabled. Follow-up questions are expanded for retrieval while the original message is preserved for generation. Context construction deduplicates chunks, orders by relevance, enforces a token budget, and emits stable `[n]` source labels. Conversation history is trimmed through LangChain before generation and begins on a user turn. The model is instructed to answer only from supplied evidence and never invent citations.

## Operations

Each chat request emits a redacted RAG trace with stage latencies for retrieval and generation. Stage-specific failures use `RagStageError` where the new ingestion/index path can identify chunk, embedding, or vector-store failures. Roll out by enabling dual-write, verifying v1 retrieval and citation quality, then enabling dual-read and finally disabling the legacy fallback.

`pnpm rag:evaluate-quality` is a fail-closed release gate. Its human-labelled corpus must include at least 50 cases, scope and citation observations, legacy baseline Recall@10/MRR@10/error-rate/p95 latency, and v1 observed error-rate/p95 latency. The command does not manufacture production measurements.

## Lexical Chunks & Hybrid Search Rollout

To support scoped keyword and hybrid retrieval (`RAG_LEXICAL_RETRIEVAL_ENABLED="true"`), searchable chunks are retained in PostgreSQL (`RagLexicalChunk`) with a `to_tsvector('simple', content)` GIN index:

1. **Dual-write phase**: Active ingesting paths (Rocket.Chat file uploads and web crawling) persist lexical chunks alongside vector embeddings immediately.
2. **Backfill phase**: Run `pnpm rag:backfill-lexical` (with optional `RAG_LEXICAL_BACKFILL_CHECKPOINT` and `RAG_LEXICAL_BACKFILL_LIMIT`) to scroll existing active Qdrant collections and populate `RagLexicalChunk` records with resume capability.
3. **Quality-gate verification**: Run `pnpm rag:evaluate-quality` to confirm Recall@10 and MRR@10 meet or exceed thresholds with zero scope leaks and no citation hallucinations.
4. **Activation**: Enable `RAG_LEXICAL_RETRIEVAL_ENABLED="true"` in production environment. If disabled or backfill is incomplete, rooms fall back to dense-only semantic search rather than failing.

### Rollback Triggers

- **Scope Leak**: Any cross-room or cross-workspace match immediately triggers disabling `RAG_LEXICAL_RETRIEVAL_ENABLED="false"`.
- **Quality Regression**: If Recall@10 / MRR@10 drops below baseline or citation validity fails, revert to semantic search.
- **Database Load / Latency**: If PostgreSQL FTS latency p95 breaches SLA (> 250ms), revert search mode to `semantic`.

## Room RAG Settings & Request Authentication

Rocket.Chat rooms can customize RAG behavior (search mode, top-K, similarity threshold, and custom system instructions) with strict end-to-end isolation:

1. **Capabilities endpoint (`GET /api/v1/integrations/rocketchat/capabilities`)**:
   - Authenticated via Bearer token.
   - Returns active backend capabilities (`lexicalRetrievalEnabled`, `availableSearchModes`, `defaultSearchMode`).
   - The Rocket.Chat App dynamically hides search modes (keyword/hybrid) if lexical retrieval is disabled in the backend.

2. **Per-room persistence & overrides**:
   - Stored in Rocket.Chat Apps-Engine compound association storage (`ROOM` + `MISC`).
   - Guarded by role permissions: only `admin`, `moderator`, `owner`, or `leader` may open the configuration modal and update settings.
   - Enforces strict bounds: `topK` in `[3, 5, 8, 10, 15]`, `similarityThreshold` in `[0.1, 0.9]`, prompt capped at 1,500 characters and 512 tokens.
   - Server-level grounding instructions are immutable and are always placed before room instructions in generation prompts. Room instructions can never override grounding or evidence constraints.

3. **Request validation & canonical override binding**:
   - Overrides passed in `AsyncMessageRequest.roomSettings` are validated against backend capabilities and normalized into an immutable `RoomRagSettings` object.
   - The verified canonical settings are bound before enqueuing to BullMQ so workers only consume validated overrides.

## Redacted Telemetry & Metrics

All RAG trace logging and metrics collection follow strict zero-prompt-logging discipline:
- **Redaction**: Raw user prompts, queries, document content, chunk text, and LLM responses are stripped before reaching debug/info log streams. Only bounded operational metadata (`requestId`, `roomId`, `workspaceId`, `queryLength`, `resultCount`, `model`, `latencyMs`, `stageLatencies`) is logged.
- **Retrieval Duration (`rag_retrieval_duration_seconds`)**: Prometheus histogram tracking retrieval latency partitioned by search mode (`semantic`, `keyword`, `hybrid`).
- **Retrieval Outcomes (`rag_retrieval_outcomes_total`)**: Prometheus counter tracking retrieval results partitioned by `mode` and `result_status` (`has_results`, `no_results`, `error`).
- **Lexical Coverage Gauge (`rag_lexical_coverage_ratio`)**: Prometheus gauge tracking the ratio of active knowledge sources with complete lexical chunk indexing.
- **Quality Corpus Benchmark Depth**: Human-labelled quality corpus evaluation evaluates Recall@K and MRR@K at a fixed benchmark depth (default 10) decoupled from individual room `displayTopK` settings.


