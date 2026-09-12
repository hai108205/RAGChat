# RAG Retrieval Quality Design

## Goal

Reduce irrelevant document chunks in both RAG chat flows while preserving grounded answers for supported Vietnamese and English queries.

## Scope

- Apply shared candidate-quality rules only to comparable cosine relevance scores: a minimum relevance threshold of 0.50, a maximum gap of 0.12 below the best result, and a maximum result count of three.
- Make the Rocket.Chat prompt treat excerpts as evidence, reject unsupported answers, and ignore weak or contradictory excerpts.
- Replace the Web/API whole-query Qdrant text scroll with Unicode-aware lexical reranking of already-qualified dense candidates. Lexical matching must never introduce a new candidate.
- Correct the Web/API vector-retrieval guard so one vector-less source does not disable vector retrieval for other eligible sources.
- Add regression tests for the Aurora/Nimbus distractor case and token-based keyword matching.

## Non-goals

- Adding an external reranker, sparse-vector collection, or new managed service.
- Changing public HTTP contracts, Qdrant schema, stored embeddings, or existing citation format.

## Design

`scopedVectorSearch` will use a pure result-quality helper that removes candidates below 0.50 or more than 0.12 below the strongest candidate, then applies a three-result cap. Both flows compare one unrounded, clamped cosine score; two-decimal rounding remains display-only. Invalid values are rejected. Rocket.Chat will use that helper through its existing service.

The Web/API controller delegates its retrieval block to a testable helper service. That service applies the cosine policy independently to each source collection before candidates are merged, so scores from different embedding spaces are never compared by the best-score gap. Unicode-normalized query terms then rerank that fixed candidate set without another Qdrant text search. RRF remains a rank-order mechanism only and is never compared to a cosine threshold; its final result cap is three. The unused per-request Qdrant text-index creation is removed. The system prompts will state that only excerpts directly supporting an answer may be used; absence of sufficient evidence must produce an explicit unknown response.

## Validation

- Unit test all quality-policy boundaries, including invalid scores, all-below-floor, raw `0.495` behavior, gap equality, and result-cap ordering.
- Unit test NFC/NFD-safe Vietnamese lexical reranking, the mixed vector-less/vector-enabled source guard, and the testable Web retrieval helper's guarantee that it makes no text-index or text-scroll request.
- Preserve existing scoped-vector tests and typecheck the backend.
