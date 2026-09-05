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
