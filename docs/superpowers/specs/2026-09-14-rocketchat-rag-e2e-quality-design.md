# Rocket.Chat RAG E2E Quality Evaluation Design

## Goal

Build a repeatable end-to-end evaluator for the Rocket.Chat integration path using `tests/DOC_RAG.txt`: upload the local document through the integration API, wait for the real ingestion worker, generate questions from the document, ask them through the async chat endpoint, and produce an automated quality report.

## Scope

In scope:

- `POST /api/v1/integrations/rocketchat/sources/base64`.
- Redis/BullMQ ingestion and chat workers.
- PostgreSQL persistence and Qdrant retrieval.
- `POST /api/v1/integrations/rocketchat/messages/async`.
- Generated-question evaluation of answer correctness, grounding, citations, refusal behavior, errors, and latency.

Out of scope:

- Web chat JWT routes and crawler-based ingestion.
- Rocket.Chat UI behavior or callback delivery as a separate product test.
- Automatic changes to RAG thresholds or production configuration.
- Treating self-generated labels as a release-quality human-labelled corpus.

## Approach

The evaluator is a backend script rather than a default Vitest test because it requires live external services and incurs LLM/embedding cost. It will use the integration token for HTTP requests and a unique `workspaceId`/`roomId` per run. The script uses `POST /sources/base64`, `GET /sources` for ingestion readiness, `POST /messages/async`, and (only when cleanup is enabled) `DELETE /sources/:id`. It may use the backend Prisma client read-only to poll asynchronous job completion and read persisted message sources; all ingestion and answering work still goes through the public integration API and worker.

The document is uploaded as UTF-8 `text/plain` with a unique request ID. The evaluator sends that ID both as the required body `requestId` and as `X-Request-Id`; the response header is checked and becomes the canonical ID because the backend request middleware gives the header precedence. The script polls the scoped sources endpoint until the source is active and has indexed chunks. Chat cases are submitted serially by default (`RAG_E2E_CONCURRENCY=1`) so correlation is deterministic: each request has a unique canonical `requestId`, the integration-job row is matched by `(workspaceId, requestId, type)`, and after that job is completed the script finds the newly persisted message by the exact unique question text, scoped chat, and `createdAt >= submittedAt`, then reads its `ChatMessageSource` rows. Generated questions must be distinct. This avoids relying on a `requestId` column that `ChatMessage` does not have. The stored `ChatMessage` and `ChatMessageSource` records are the evaluation inputs, so the report measures the same evidence that the backend persisted.

## Question generation

The configured LLM generates a JSON question set from the complete document. The required schema is:

- a stable case ID;
- a Vietnamese question;
- a reference answer (empty only when `answerable` is false);
- a short evidence excerpt or section hint (empty only when `answerable` is false);
- a category in `fact`, `date`, `responsibility`, `multi_hop`, or `negative`;
- an `answerable` boolean.

The generator must return exactly the requested number of distinct cases. Invalid JSON, duplicate IDs/questions, missing fields, or an incorrect count is a fatal generation error. The generator call is retried up to three times with bounded exponential backoff; a final malformed response is reported without sending chat traffic.

The default set has 50 cases, with supported factual, date/time, responsibility, multi-step, and negative/out-of-document questions. `RAG_E2E_CASES` can reduce the count for a smoke run. The generated corpus is saved in the report for reproducibility, but the report explicitly labels it as synthetic.

## Evaluation

Each completed answer is scored by an LLM judge using the question, reference answer, document evidence, retrieved snippets, and citations. The judge must return this structured JSON, with each numeric score an integer from 0 to 2 and rationale limited to plain text:

```json
{
  "correctness": 0,
  "groundedness": 0,
  "citationSupport": 0,
  "refusal": 0,
  "rationale": "..."
}
```

- correctness of the answer;
- support by retrieved evidence;
- citation support/coverage;
- correct abstention for unanswerable questions (`2` means the behavior is correct, `0` means it is incorrect; for answerable questions this measures whether the assistant answered instead of refusing).

For a supported case, correctness means the answer matches the reference answer, groundedness means claims are supported by retrieved snippets, and citation support means citations point to supporting persisted sources. For an unsupported case, correctness and groundedness score whether the answer avoids unsupported claims, while refusal is `2` only for a clear documentation-grounded abstention. A malformed judge response is retried once with a repair prompt; if it remains invalid, the case receives `judgeError: true`, is excluded from score averages, and causes a non-zero exit when threshold enforcement is enabled.

The script also computes deterministic operational metrics: request failures, ingestion duration, per-question latency, p50/p95 latency, empty retrieval/citation counts, and worker job failures. Scores are normalized from the 0-2 judge scale to 0-1 averages. Threshold enforcement is opt-in: `RAG_E2E_ENFORCE_THRESHOLDS` defaults to `false`, while required live-operation failures always exit non-zero. When enforcement is enabled, `RAG_E2E_MIN_CORRECTNESS` defaults to `0.70`, `RAG_E2E_MIN_GROUNDEDNESS` to `0.70`, `RAG_E2E_MIN_CITATION_SUPPORT` to `0.70`, `RAG_E2E_MIN_REFUSAL` to `0.80`, and `RAG_E2E_MAX_ERROR_RATE` to `0`.

The JSON report schema has `schemaVersion`, `run` (run ID, workspace, room, timestamps, document path/hash, evaluator/judge model, prompt versions, and sanitized configuration), `ingestion` (request ID, source ID, chunk count, duration, status), `cases` (generated case, request ID, job status, answer, persisted citations, latency, judge result/error), and `aggregate` (counts, normalized score averages, latency percentiles, error/empty-evidence rates, threshold results, and `passed`). The Markdown report renders the same fields and warns that labels are synthetic. It contains no API keys or authorization headers. Test data is retained by default for diagnosis; cleanup is opt-in through `RAG_E2E_CLEANUP=true` and only targets the unique source ID created by that run, using the scoped `DELETE /sources/:id` integration endpoint.

## Configuration and safety

Required configuration:

- `RAG_E2E_BASE_URL` (default `http://localhost:8000`);
- `RAG_E2E_TOKEN` (falls back to `ROCKETCHAT_INTEGRATION_TOKEN`);
- `RAG_E2E_DOCUMENT_PATH` (defaults to the repository-root `tests/DOC_RAG.txt`, resolved relative to the script rather than the current directory);
- a running backend API and Rocket.Chat integration worker;
- Redis, PostgreSQL, Qdrant, and configured LLM/embedding credentials.

Optional configuration includes `RAG_E2E_CASES` (default `50`, integer `1..100`), `RAG_E2E_PROVIDER` (default `DEFAULT`), `RAG_E2E_MODEL`, `RAG_E2E_JUDGE_MODEL`, `RAG_E2E_EMBEDDING_MODEL`, `RAG_E2E_POLL_TIMEOUT_MS` (default `180000`), `RAG_E2E_POLL_INITIAL_MS` (default `500`), `RAG_E2E_POLL_MAX_MS` (default `5000`), `RAG_E2E_REQUEST_TIMEOUT_MS` (default `30000`), `RAG_E2E_CONCURRENCY` (default `1`), `RAG_E2E_WORKER_ATTEMPTS` (default `3`), `RAG_E2E_OUTPUT_DIR` (default `artifacts/rag-e2e`), `RAG_E2E_CLEANUP` (default `false`), `RAG_E2E_ENFORCE_THRESHOLDS` (default `false`), and the five threshold variables above. Polling uses exponential backoff between the initial and max delay. `COMPLETED` is terminal; `FAILED` is terminal only when the persisted integration-job `attempts` is at least `RAG_E2E_WORKER_ATTEMPTS`, because the current worker writes `FAILED` after each failed BullMQ attempt and may later move the row back to `PROCESSING`. Timeout is a failure. Network requests retry up to three times; worker retries are owned by BullMQ and are not duplicated by the evaluator. The package script `rag:evaluate-rocketchat-e2e` must be added to `backend/package.json`. The script fails early with a clear configuration error rather than sending partial test traffic.

## Verification

Pure helpers will have focused Vitest coverage for unique run IDs, response-envelope parsing, polling/backoff decisions, judge/question JSON normalization, metric aggregation, configuration validation, and report rendering. The live evaluator will be run explicitly with its command and environment; it will not run as part of ordinary unit-test CI. The documented command is `pnpm --dir backend run rag:evaluate-rocketchat-e2e`.
