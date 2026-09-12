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

`RAG_V1_ENABLED` remains an explicit rollout flag. This work does not turn it on by default or delete legacy indexes. `semantic`, `keyword`, and `hybrid` room modes are supported by the deployed scoped retrieval service independently of that flag: keyword search reads the retained searchable chunks for the same scoped sources, and hybrid fuses it with whichever dense path (legacy or V1) is active. If a deployment has not applied the lexical schema/backfill, the backend explicitly rejects `keyword`/`hybrid` as unavailable and the modal presents only semantic mode; it must never silently substitute semantic or legacy behavior.

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

The submit handler reads UIKit state, validates allowed enum values and a maximum 1,500-character prompt, then writes this record. Settings are room-owned: only a room administrator/moderator (or app-authorized equivalent) may update them. The app loads the saved settings when opening the modal and attaches them to every room chat request. Absent settings use existing backend defaults.

The backend validates the incoming override again **and does not trust it as authority**. The authenticated Rocket.Chat integration identity and signed/request-bound room and workspace identity remain authoritative; a request whose settings scope differs from the authenticated scope is rejected. It treats model and prompt as generation configuration, and `topK`, threshold, and mode as retrieval configuration. Invalid or tampered persisted values are rejected rather than silently broadened. `topK` is bounded at 15 and context construction remains constrained by its token budget; the room prompt reserves at most 512 tokens from generation context and is rejected if its 1,500-character source value exceeds that bound.

## Retrieval architecture

`scopedVectorSearch` receives validated retrieval options instead of imposing a three-result cap. It over-fetches a bounded candidate pool (at least `max(20, topK * 2)` and at most 30), keeps dense retrieval for `semantic`, uses a scoped PostgreSQL lexical query over retained document/chunk text for `keyword`, and fuses independently retrieved result lists with RRF for `hybrid` (`k=60`, stable source/chunk-ID tie-breaker). Every lexical result includes an actual excerpt and source provenance.

`similarityThreshold` applies only to dense cosine candidates; it is not applied to lexical ranks or RRF scores. Keyword mode returns its bounded lexical ranking; hybrid filters the dense side first, fuses the two ranked lists, then emits the configured `topK`. This prevents incomparable score scales from being treated as one threshold.

The implementation must not claim Qdrant payload filtering is BM25. Lexical search is separate and room/workspace scoped. It uses parameterized Prisma/SQL scope predicates plus a normalized, safe full-text-query constructor (for example PostgreSQL `websearch_to_tsquery`); raw user input is never interpolated into `tsquery`. Blank, malformed, or operator-only input produces a bounded empty lexical result rather than a database error. If the existing schema lacks searchable chunk bodies, add the smallest migration/table/index necessary; do not query headings with an entire user sentence. The migration includes a versioned, idempotent backfill from active source content/segments, checkpointed retries and counts for failed records. Until a source is backfilled, hybrid returns the dense result for that source and records coverage telemetry; it must not silently broaden scope or fabricate lexical results.

Deduplication uses stable chunk IDs where present, falling back to a normalized content hash. It must never infer identity from a 25-character prefix.

## Ingestion and content extraction

The structural V1 splitter receives the configured token budget directly because its length function counts words. The legacy character splitter retains an explicit token-to-character conversion, with naming/comments that make the distinction unambiguous.

For web crawling, embeddings are generated independently for the exact array each index receives. The V1 write uses embeddings for `ragSegments`; legacy/dual-write uses embeddings for legacy `chunks`.

Web extraction selects `article` when present and otherwise `body`, removes structural chrome (`header`, `footer`, `nav`, `aside`) in addition to scripts/styles, and keeps a normalized non-truncated title.

## Query rewriting and generation

Follow-up detection recognizes ambiguous English and Vietnamese references and is no longer constrained by a 12-word limit. It calls the existing structured rewrite only when history exists and ambiguity is detected; unavailable providers retain the original query with telemetry. The original user message remains the generation prompt.

The configured system prompt is bounded, delimited as room-supplied untrusted instruction, and placed below immutable server-side system grounding/citation rules. Server prompts explicitly state that room instructions cannot override evidence-only, scope, citation, or safety requirements; the room value is never interpolated into those immutable rules.

## Quality and rollout

Threshold defaults remain conservative until a labelled corpus demonstrates a better value. Add a corpus template containing query, expected source/chunk identifiers, language, scope and mode; use the existing fail-closed quality gate to compare Recall@10, MRR@10, citation validity, error rate and latency. Evaluation uses a distinct candidate depth of 10 (or the configured benchmark depth) regardless of a room's returned-context `topK`; the latter only controls what is presented to generation. No production metric is fabricated.

Rollout is staged: dual-write and backfill first, then a limited labelled scope in semantic mode, then hybrid, and only then broader v1 reads. Promotion requires the project thresholds already documented for citation validity, Recall@10/MRR@10, retrieval error rate and p95 latency. Dashboards expose backfill coverage, per-mode no-result/error rate and latency. A failed gate, source-scope leak, citation mismatch, or error/latency breach immediately disables the new mode and returns to the existing flag-controlled path without deleting indexes.

## Error handling and security

- Scope filters apply identically to dense and lexical retrieval.
- Keyword/hybrid retrieval returns an explicit no-result when no scoped document matches; it never exposes another room's data.
- Permission checks happen before persistence changes.
- Logs include mode, limits and counts but exclude system prompts and document bodies.
- Existing V1 fallback flags continue to control legacy reads.

## Verification

Each behavior is developed test-first. Tests cover V1 word-budget chunking, crawler vector alignment, Vietnamese rewrite detection, lexical scope/excerpts/RRF, stable deduplication, sanitized extraction, modal state validation/persistence, request propagation and backend override validation. They also cover unavailable-mode rejection/UI hiding, the 1,500-character and 512-token prompt bounds, safe malformed lexical input, denied settings updates, complete request-path cross-room spoofing/isolation, missing-settings fallback, and tampered persistence records. The full backend suite, typecheck, Rocket.Chat app tests/typecheck, and GitNexus change detection run before merge.
