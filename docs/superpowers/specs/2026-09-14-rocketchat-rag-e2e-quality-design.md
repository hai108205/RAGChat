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

The evaluator is a backend script rather than a default Vitest test because it requires live external services and incurs LLM/embedding cost. It will use the integration token for HTTP requests and a unique `workspaceId`/`roomId` per run. The script may use the backend Prisma client read-only to poll asynchronous job completion and read persisted message sources; all ingestion and answering work still goes through the public integration API and worker.

The document is uploaded as UTF-8 `text/plain` with a unique request ID. The script polls the scoped sources endpoint until the source is active and has indexed chunks. It then submits one unique async request per generated question and polls the database until the corresponding integration job is completed or failed. The stored `ChatMessage` and `ChatMessageSource` records are the evaluation inputs, so the report measures the same evidence that the backend persisted.

## Question generation

The configured LLM generates a JSON question set from the complete document. Each case contains:

- a stable case ID;
- a Vietnamese question;
- a reference answer;
- a short evidence excerpt or section hint;
- a question category;
- an `answerable` flag.

The default set has 50 cases, with supported factual, date/time, responsibility, multi-step, and negative/out-of-document questions. `RAG_E2E_CASES` can reduce the count for a smoke run. The generated corpus is saved in the report for reproducibility, but the report explicitly labels it as synthetic.

## Evaluation

Each completed answer is scored by an LLM judge using the question, reference answer, document evidence, retrieved snippets, and citations. The judge must return structured JSON and score:

- correctness of the answer;
- support by retrieved evidence;
- citation support/coverage;
- correct abstention for unanswerable questions.

The script also computes deterministic operational metrics: request failures, ingestion duration, per-question latency, p50/p95 latency, empty retrieval/citation counts, and worker job failures. Aggregate thresholds are configurable through environment variables and default to report-only unless an explicit fail threshold is set. The evaluator exits non-zero when a configured threshold is violated or a required live operation fails.

The report is written as JSON and Markdown under `artifacts/rag-e2e/` or an explicitly configured output path. It contains no API keys. Test data is retained by default for diagnosis; cleanup is opt-in through `RAG_E2E_CLEANUP=true` and only targets the unique source created by that run.

## Configuration and safety

Required configuration:

- `RAG_E2E_BASE_URL` (default `http://localhost:8000`);
- `ROCKETCHAT_INTEGRATION_TOKEN` or an explicitly named evaluator token;
- a running backend API and Rocket.Chat integration worker;
- Redis, PostgreSQL, Qdrant, and configured LLM/embedding credentials.

Optional configuration includes case count, model/provider, embedding model, polling timeout, judge model, output directory, cleanup, and score thresholds. The script fails early with a clear configuration error rather than sending partial test traffic.

## Verification

Pure helpers will have focused Vitest coverage for unique run IDs, response-envelope parsing, polling/backoff decisions, judge JSON normalization, metric aggregation, and report rendering. The live evaluator will be run explicitly with its command and environment; it will not run as part of ordinary unit-test CI.

