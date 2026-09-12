# RAG Report Remediation Design

## Goal

Resolve the verified RAG correctness and usability defects, while making supported retrieval and generation controls configurable per Rocket.Chat room.

## Scope

The implementation covers:

- V1 chunk-unit correctness and web-crawler embedding/chunk alignment.
- Multilingual follow-up rewrite, deterministic deduplication, and cleaner web extraction.
- Scoped lexical retrieval with genuine `semantic`, `keyword`, and `hybrid` modes.
- Persistent room-scoped settings submitted from `RagSettingsModal` and safely applied to chat requests.
- Tests and an operational quality-corpus template to support evidence-based threshold tuning.

`RAG_V1_ENABLED` remains an explicit rollout flag. This work does not turn it on by default or delete legacy indexes.

## Room settings architecture

The Rocket.Chat app owns settings keyed by `(workspaceId, roomId)` in Apps-Engine persistence. A small `RagSettingsStore` will serialize only validated values:

```ts
type RoomRagSettings = {
  model?: SupportedChatModel;
  searchMode: 'semantic' | 'keyword' | 'hybrid';
  topK: 3 | 5 | 8 | 10 | 15;
  similarityThreshold: 0.3 | 0.5 | 0.6 | 0.8;
  systemPrompt?: string;
};
```

The submit handler reads UIKit state, validates allowed enum values and prompt length, then writes this record. Settings are room-owned: only a room administrator/moderator (or app-authorized equivalent) may update them. The app loads the saved settings when opening the modal and attaches them to every room chat request. Absent settings use existing backend defaults.

The backend validates the incoming override again. It treats model and prompt as generation configuration, and `topK`, threshold, and mode as retrieval configuration. Invalid values are rejected rather than silently broadened. `topK` is bounded at 15 and context construction remains constrained by its token budget.

## Retrieval architecture

`scopedVectorSearch` receives validated retrieval options instead of imposing a three-result cap. It keeps dense retrieval for `semantic`, uses a scoped PostgreSQL lexical query over retained document/chunk text for `keyword`, and fuses independently retrieved result lists with RRF for `hybrid`. Every lexical result includes an actual excerpt and source provenance.

The implementation must not claim Qdrant payload filtering is BM25. Lexical search is separate and room/workspace scoped. If the existing schema lacks searchable chunk bodies, add the smallest migration/table/index necessary; do not query headings with an entire user sentence.

Deduplication uses stable chunk IDs where present, falling back to a normalized content hash. It must never infer identity from a 25-character prefix.

## Ingestion and content extraction

The structural V1 splitter receives the configured token budget directly because its length function counts words. The legacy character splitter retains an explicit token-to-character conversion, with naming/comments that make the distinction unambiguous.

For web crawling, embeddings are generated independently for the exact array each index receives. The V1 write uses embeddings for `ragSegments`; legacy/dual-write uses embeddings for legacy `chunks`.

Web extraction selects `article` when present and otherwise `body`, removes structural chrome (`header`, `footer`, `nav`, `aside`) in addition to scripts/styles, and keeps a normalized non-truncated title.

## Query rewriting and generation

Follow-up detection recognizes ambiguous English and Vietnamese references and is no longer constrained by a 12-word limit. It calls the existing structured rewrite only when history exists and ambiguity is detected; unavailable providers retain the original query with telemetry. The original user message remains the generation prompt.

The configured system prompt is appended as a distinct bounded instruction. It cannot override grounding or citation rules embedded in server-side prompts.

## Quality and rollout

Threshold defaults remain conservative until a labelled corpus demonstrates a better value. Add a corpus template containing query, expected source/chunk identifiers, language, scope and mode; use the existing fail-closed quality gate to compare Recall@10, MRR@10, citation validity, error rate and latency. No production metric is fabricated.

## Error handling and security

- Scope filters apply identically to dense and lexical retrieval.
- Keyword/hybrid retrieval returns an explicit no-result when no scoped document matches; it never exposes another room's data.
- Permission checks happen before persistence changes.
- Logs include mode, limits and counts but exclude system prompts and document bodies.
- Existing V1 fallback flags continue to control legacy reads.

## Verification

Each behavior is developed test-first. Tests cover V1 word-budget chunking, crawler vector alignment, Vietnamese rewrite detection, lexical scope/excerpts/RRF, stable deduplication, sanitized extraction, modal state validation/persistence, request propagation and backend override validation. The full backend suite, typecheck, Rocket.Chat app tests/typecheck, and GitNexus change detection run before merge.
