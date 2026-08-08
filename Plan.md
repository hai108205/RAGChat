# Project Plan

# RAGChat – Rocket.Chat App-Engine for Document Question Answering

---

# 1. Project Overview

## 1.1 Objective

RAGChat is an AI-powered application built on Rocket.Chat Apps Engine that enables users to ask questions about internal documents using Retrieval-Augmented Generation (RAG).

The system retrieves relevant information from enterprise knowledge bases and generates accurate answers with source citations, helping users quickly access organizational knowledge while maintaining security and permission controls.

## 1.2 Goals

* Integrate AI Assistant into Rocket.Chat.
* Support enterprise document question answering.
* Reduce document searching time.
* Improve knowledge sharing.
* Ensure secure access to enterprise documents.
* Provide transparent answers with citations.

## 1.3 Scope

### In Scope

* Rocket.Chat integration
* Document upload & indexing
* Semantic search
* AI-powered question answering
* Citation support
* Conversation history
* Permission control
* Monitoring & logging

### Out of Scope (MVP)

* AI model training
* Agent workflow automation
* OCR for scanned documents
* Multi-system enterprise integrations

---

# 2. Functional Requirements

## 2.1 AI Chat

Users can:

* Chat with AI in Direct Message
* Mention bot in channels
* Continue conversations in threads
* Ask follow-up questions
* Retry previous responses
* Clear conversation history

### Supported Commands

```
@ai help

@ai start

@ai clear

@ai stats

/ask

/search

/summarize

/explain

/translate
```

---

## 2.2 Document Management

Supported operations

* Upload document
* Delete document
* Update document
* Re-index document
* View document list

Supported formats

* PDF
* DOCX
* TXT
* Markdown
* HTML
* PPTX
* CSV
* XLSX

Metadata

* Title
* Department
* Tags
* Owner
* Version
* Created Date
* Last Updated

### Document Identity & Versioning

* Deterministic document ID via SHA-256 hash of canonical source path (NFD-normalized, lowercase).
* Version hash via SHA-256 of content — enables diff detection for incremental indexing.
* Document Registry (SQLite) tracks: `document_id`, `source`, `filename`, `size`, `content_type`, `version_hash`, `chunk_ids` (JSON array).

---

## 2.3 Document Processing

Pipeline

```
Upload
    ↓
Parser (text extraction + metadata)
    ↓
Cleaning (NFKC normalization, whitespace, control chars)
    ↓
Chunking (markdown-aware recursive split)
    ↓
Embedding (OpenAI / BGE / E5)
    ↓
Vector Database (pgVector)
```

Functions

* Text extraction (8 formats: PDF, DOCX, PPTX, TXT, MD, HTML, CSV, XLSX)
* Metadata extraction (title, author, page count, word count, language)
* Chunk generation with markdown-aware separators: `\n#{1,6}` → ` ```\n` → `---` → `\n\n` → `\n` → ` ` → char
* Embedding generation (batch + async)
* **Incremental indexing** — diff current docs against Document Registry to compute `(new, changed, deleted)` sets; only re-index changed/new docs

### Chunking Strategy

* Algorithm: RecursiveCharacterTextSplitter (adapted from LangChain)
* Default: `chunk_size=1000`, `chunk_overlap=200`
* Markdown-aware: headings first, then code fences, then horizontal rules, then paragraphs, then sentences
* Per-format overrides: PDF splits on page boundaries first, then within pages

---

## 2.4 Retrieval

Support

* **Semantic Search** — pgVector cosine similarity (IVF Flat index, `lists=100`)
* **Keyword Search** — BM25 / PostgreSQL full-text search (`tsvector` + `tsquery`)
* **Hybrid Search** — Combined semantic + keyword with Reciprocal Rank Fusion (RRF, `k=60`)
* **Metadata Filter** — department, project, language, tags, owner
* **Top-K Retrieval** — configurable K (default 5)
* **Re-ranking** — Cross-encoder (e.g., `mixedbread-ai/mxbai-rerank-base`) on top-K candidates

### Relevance Scoring

* Convert raw distance to [0, 1] relevance score:
  * Cosine: `1.0 - distance`
  * L2/Euclidean: `1.0 - distance / sqrt(2)`
  * Inner Product: `1.0 - distance` (positive), `-1.0 * distance` (negative)
* Configurable relevance threshold filter (default 0.3)

Search Filters

* Department
* Project
* Language
* Tags
* Owner

---

## 2.5 AI Answer Generation

Features

* Context-aware responses
* Multi-language
* Conversation memory
* Source citations
* Suggested follow-up questions
* Hallucination reduction

### Synthesis Strategies

**Strategy 1 — Create-and-Refine** (sequential):
1. First chunk: generate initial answer with context prompt.
2. Subsequent chunks: refine existing answer with new context.
3. Only the last iteration streams; intermediate answers are generated non-streaming.

**Strategy 2 — Tree Summarization** (concurrent, default):
1. Generate prompts for all chunks concurrently (`asyncio.gather`).
2. Get answers for all chunks concurrently.
3. Recursively combine answers in batches of `num_children` (default 2).
4. Hierarchical merging until one root answer remains.
5. Only the final merge streams; intermediate merges are non-streaming.

### Conversation-Aware Question Refinement

* Before retrieval, rewrite the user's question to be standalone using conversation history.
* Uses LLM with `REFINED_QUESTION_CONVERSATION_AWARENESS` prompt template.
* Ensures retrieval quality when user asks follow-up questions with pronouns/ellipsis.

### Chat History

* Server-side ring buffer (`ChatHistory` list, max length configurable, default 2 turns).
* Stores Q&A pairs; oldest evicted when buffer full.
* Exposed via `DELETE /chat/history` endpoint.

Example

```
Answer

...

Sources

Employee Handbook.pdf
Page 25

HR Policy.docx
Section 3.2
```

---

## 2.6 Rocket.Chat Integration

Supported features

* Direct Message
* Mention Bot
* Thread Support
* Slash Commands
* Message Actions
* File Actions

Message Actions

* Ask AI
* Summarize
* Explain
* Translate
* Generate Reply

---

## 2.7 Conversation Management

Features

* Session Memory (server-side ring buffer + client-side `IPersistence`)
* Session Timeout
* Conversation History
* Rename Conversation
* Delete Conversation
* Export Conversation

---

## 2.8 Knowledge Base

Support

* Multiple Knowledge Bases
* Department Knowledge Base
* Shared Knowledge Base
* Private Knowledge Base

---

## 2.9 Administration

Admin can

* Configure AI model
* Configure embedding model
* Configure vector database
* Manage prompts
* Manage users
* Manage permissions
* View system statistics

---

# 3. Non-functional Requirements

## Performance

* Low response latency (< 5s for answer generation start)
* Concurrent users (target: 50 simultaneous)
* Background indexing via ARQ + Redis
* Efficient vector search (pgVector IVF Flat → HNSW in Phase 2)
* Response caching (Redis LRU, TTL-based per query hash)

---

## Scalability

* Stateless services (backend + worker scale independently)
* Horizontal scaling (multiple backend replicas behind load balancer)
* Queue-based indexing (ARQ workers, configurable concurrency)
* Distributed vector database (pgVector with read replicas)

---

## Availability

* Health Check (`/health` endpoint)
* Retry mechanism (exponential backoff on LLM calls)
* Graceful degradation (return partial results when some sources fail)
* Automatic restart (Docker `restart: unless-stopped`)

---

## Security

Authentication

* Rocket.Chat Authentication
* OAuth
* JWT
* API Key (for backend ↔ App communication)

Authorization

* RBAC
* Department-level permissions
* Document-level permissions

Security Controls

* Prompt Injection Protection
* Input Validation
* Secret Management (`.env` + Docker secrets)
* Encryption (TLS for all service communication)

---

## Reliability

* Automatic retry (ARQ built-in, LLM call retry)
* Backup (PostgreSQL pg_dump, MinIO mirror)
* Recovery (ARQ job persistence in Redis)
* Error handling (structured error responses, sentry/logging)

---

## Observability

### Logging

* Structured logging (JSON format, `structlog` or Python `logging` with JSON formatter)
* Log levels: DEBUG, INFO, WARNING, ERROR
* Correlation IDs per request

### Metrics

* Prometheus metrics exposed at `/metrics`:
  * `ragchat_requests_total` (Counter, labels: endpoint, status)
  * `ragchat_request_duration_seconds` (Histogram, labels: endpoint)
  * `ragchat_documents_indexed_total` (Counter)
  * `ragchat_chunks_stored_total` (Counter)
  * `ragchat_llm_calls_total` (Counter, labels: provider, model)
  * `ragchat_llm_call_duration_seconds` (Histogram, labels: provider, model)
  * `ragchat_embedding_requests_total` (Counter, labels: model)
  * `ragchat_vector_search_duration_seconds` (Histogram)
  * `ragchat_active_sessions` (Gauge)
  * `ragchat_documents_count` (Gauge)
* `prometheus_fastapi_instrumentator` middleware

### Tracing

* OpenTelemetry (OTLP export to Jaeger/Tempo)
* Span coverage: HTTP → RAG pipeline → LLM call → Vector search

### Audit Log

* Document operations (upload, delete, re-index)
* User queries (anonymized)
* Admin actions (model config changes, permission changes)

### Performance Dashboard

* Grafana with pre-built `ragchat-dashboard.json`
* Panels: request rate, latency percentiles, LLM call volume, document count, indexing throughput, error rate

---

# 4. System Architecture

## 4.1 Architecture Decision

RAGChat uses a **2-layer Hybrid Architecture**:

- **Layer 1 — Rocket.Chat App (TypeScript)**: Thin adapter inside Rocket.Chat. Handles user interaction (slash commands, DM bot, message actions) and delegates all RAG logic to the Python backend via HTTP.
- **Layer 2 — Python Backend (FastAPI)**: Heavy RAG service. Runs LangChain pipelines, manages pgVector, calls LLM APIs, processes documents.

**Why not pure TypeScript in App-Engine?** App-Engine SDK has 3 hard limits that make it unsuitable for RAG logic:

| Limit | Impact |
|-------|--------|
| No direct DB access | Cannot connect to pgVector. Only `IHttp` is available |
| Handler timeout | Slash command / message handler runs in Rocket.Chat request cycle. LLM call >5s will timeout |
| No streaming / long-poll | App handlers are request-response only. Cannot hold connection open |

Therefore: App = adapter only. Backend = all RAG logic.

## 4.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Rocket.Chat Server                  │
│  ┌───────────────────────────────────────────────┐  │
│  │          RAGChat App (TypeScript)              │  │
│  │                                                │  │
│  │  ISlashCommand  IPostMessageSentToBot          │  │
│  │  (/ask, /search, /summarize, DM bot)           │  │
│  │                                                │  │
│  │  IPersistence           App Settings           │  │
│  │  (session storage)      (API keys, config)     │  │
│  │                                                │  │
│  │  IHttp (REST client to Python backend)         │  │
│  └──────────────────┬────────────────────────────┘  │
└─────────────────────┼───────────────────────────────┘
                      │ HTTP (REST API)
                      ▼
┌─────────────────────────────────────────────────────┐
│              Python Backend (FastAPI)                │
│                                                      │
│  /api/chat          POST — ask question              │
│  /api/documents     POST — upload document           │
│  /api/documents     GET  — list documents            │
│  /api/documents/:id DELETE — remove document         │
│  /api/admin/*       — config, stats, users           │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              RAG Pipeline (LangChain)           │  │
│  │                                                 │  │
│  │  Document → Parser → Chunker → Embedder         │  │
│  │  Query   → Refine → Embed → Retrieve → Prompt   │  │
│  │           → Synthesize → LLM → Citations        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ pgVector │  │  Redis   │  │  Object Storage  │   │
│  │(vectors) │  │ (queue)  │  │  (raw documents) │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 4.3 Chat Flow (end-to-end)

```
1. User types "/ask Chính sách nghỉ phép năm 2026?"
2. ISlashCommand.executor fires in Rocket.Chat
3. App sends IHttp.post → Python /api/chat { query, user_id, room_id }
4. Python backend:
   a. Load chat history (server-side ring buffer)
   b. Refine question (conversation-aware standalone reformulation via LLM)
   c. Embed refined query (text-embedding-3-small)
   d. Search pgVector (hybrid: semantic + keyword, RRF fusion, top-K=5)
   e. Apply relevance threshold filter
   f. Build prompts for each chunk (system + context + history + query)
   g. Synthesize answer (Tree Summarization strategy — concurrent chunk processing)
   h. Format citations (source + page/section)
   i. Return { answer, sources, follow_up_questions }
   j. Append Q&A pair to chat history ring buffer
5. App receives response
6. App sends answer via IModifyCreator with attachments (citations)
```

## 4.4 Document Flow (Incremental Indexing)

```
1. User uploads document via slash command or DM
2. App receives file, uploads to Python /api/documents
3. Python backend:
   a. Store raw file in Object Storage (MinIO)
   b. Parse (pdf→text, docx→text, etc.)
   c. Extract metadata (title, author, pages, word count, language)
   d. Clean & normalize text (NFKC, whitespace, control chars)
   e. Generate document_id (SHA-256 of canonical source path)
   f. Generate version_hash (SHA-256 of content)
   g. Check Document Registry for existing version → skip if unchanged
   h. Chunk (markdown-aware recursive split, size=1000, overlap=200)
   i. Embed each chunk (batch, async)
   j. Store vectors + metadata in pgVector
   k. Register in Document Registry (document_id, version_hash, chunk_ids)
4. Return indexing status to App → notify user

Incremental Re-index (scheduled or triggered):
   a. Scan docs directory, compute (document_id, version_hash) for each
   b. Diff against Document Registry → (new, changed, deleted) sets
   c. Remove deleted/changed docs from pgVector and Registry
   d. Chunk, embed, upsert only new + changed docs
   e. Report changes to admin
```

## 4.5 Main Components

| Component | Layer | Role |
|-----------|-------|------|
| SlashCommand Handlers | App (TS) | `/ask`, `/search`, `/summarize`, `/explain`, `/translate` |
| Bot DM Handler | App (TS) | `IPostMessageSentToBot` — reply to DM conversations |
| Message Actions | App (TS) | "Ask AI", "Summarize", "Explain" on existing messages |
| Settings Registry | App (TS) | API keys, model selection, backend URL — via `SettingType` |
| Session Store | App (TS) | Conversation history per user/room — via `IPersistence` |
| HTTP Client | App (TS) | `IHttp` — all calls to Python backend |
| REST API | Backend (Python) | FastAPI endpoints for chat, documents, admin |
| Chat History | Backend (Python) | Server-side ring buffer (fixed-size Q&A pairs) |
| Question Refiner | Backend (Python) | Conversation-aware standalone question reformulation |
| Document Processor | Backend (Python) | LangChain document loaders + markdown-aware text splitters |
| Document Registry | Backend (Python) | SQLite/SQLModel — tracks doc_id, version_hash, chunk_ids for incremental indexing |
| Embedding Service | Backend (Python) | OpenAI / BGE / E5 embedding generation (async, batch) |
| Retriever | Backend (Python) | Semantic (pgVector cosine) + Keyword (BM25) + Hybrid (RRF) |
| Re-ranker | Backend (Python) | Cross-encoder on top-K candidates |
| Prompt Builder | Backend (Python) | LangChain prompt templates with context + history injection |
| Synthesis Engine | Backend (Python) | Tree Summarization (default) + Create-and-Refine strategies |
| LLM Adapter | Backend (Python) | Unified interface for OpenAI, Claude, Gemini, Ollama |
| Vector Store | Backend (Python) | pgVector with IVF Flat / HNSW index |
| Object Storage | Infra | MinIO — raw document files |
| Job Queue | Infra | Redis + ARQ — async document indexing |
| Response Cache | Infra | Redis LRU — TTL-based query response caching |
| Monitoring | Infra | Prometheus + Grafana + OpenTelemetry |

## 4.6 Technology Stack

### Rocket.Chat App (TypeScript)

| Concern | Technology |
|---------|-----------|
| SDK | `@rocket.chat/apps-engine` |
| Runtime | Rocket.Chat Apps Engine (Deno-based) |
| HTTP Client | `IHttp` accessor |
| Storage | `IPersistence` + `RocketChatAssociationRecord` |
| Config | `ISetting` — API keys, backend URL, model selection |

### Python Backend

| Concern | Technology |
|---------|-----------|
| Framework | FastAPI (Python 3.12) |
| RAG | LangChain + LangChain Community |
| LLM | OpenAI, Anthropic Claude, Google Gemini, Ollama (via langchain adapters) |
| Embedding | OpenAI text-embedding-3-small, BGE-large-en, intfloat/e5-large |
| Vector DB | pgVector (PostgreSQL extension) |
| Document Parsing | PyPDF2, python-docx, python-pptx, markitdown |
| Async Queue | Redis + ARQ (for background indexing jobs) |
| Object Storage | MinIO (S3-compatible) |
| Caching | Redis (LRU, TTL-based) |
| Logging | structlog (JSON structured logs) |
| Tracing | OpenTelemetry SDK (OTLP export) |

### Infrastructure

| Concern | Technology |
|---------|-----------|
| Database | PostgreSQL 16 + pgVector |
| Cache / Queue | Redis 7 |
| Deployment | Docker Compose (MVP), Kubernetes (Production) |
| Monitoring | Prometheus + Grafana + OpenTelemetry |
| CI/CD | GitHub Actions (pytest + coverage threshold, lint, pre-commit) |

---

# 5. Project Structure

```
ragchat/
├── app/                          # Rocket.Chat App (TypeScript)
│   ├── app.json                  # App manifest (id, name, version, permissions)
│   ├── tsconfig.json
│   ├── package.json
│   ├── src/
│   │   ├── RAGChatApp.ts         # extends App — lifecycle + extendConfiguration()
│   │   ├── commands/             # ISlashCommand implementations
│   │   │   ├── AskCommand.ts     # /ask
│   │   │   ├── SearchCommand.ts  # /search
│   │   │   ├── SummarizeCommand.ts
│   │   │   ├── ExplainCommand.ts
│   │   │   └── TranslateCommand.ts
│   │   ├── handlers/             # Event handler interfaces
│   │   │   ├── BotMessageHandler.ts   # IPostMessageSentToBot — DM chat
│   │   │   └── MessageActionHandler.ts
│   │   ├── settings/             # App settings definitions
│   │   │   └── settings.ts       # SettingType: API key, model, backend URL
│   │   ├── api/                  # IApiEndpoint (webhook callbacks from backend)
│   │   │   └── CallbackEndpoint.ts
│   │   ├── persistence/          # IPersistence helpers
│   │   │   └── sessionStore.ts   # Conversation history per user/room
│   │   └── lib/
│   │       └── httpClient.ts     # IHttp wrapper for Python backend calls
│   └── tests/
│
├── backend/                      # Python RAG Service (FastAPI)
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── Makefile                  # Standardized tasks (install, test, migrate, start, tidy)
│   ├── .pre-commit-config.yaml   # Ruff format + lint
│   ├── src/
│   │   ├── main.py               # FastAPI app entry point + lifespan
│   │   ├── config.py             # Pydantic Settings (env vars)
│   │   ├── state.py              # Global singleton state (db_engine, llm_client, vector_db, embedder, cache)
│   │   ├── database.py           # SQLAlchemy engine init (PostgreSQL)
│   │   ├── api/
│   │   │   ├── routes.py         # Router aggregator
│   │   │   ├── deps.py           # FastAPI dependencies (typed, from state)
│   │   │   ├── endpoints/
│   │   │   │   ├── health.py     # GET /health
│   │   │   │   ├── chat.py       # POST /api/chat (non-streaming)
│   │   │   │   ├── chat_stream.py # WebSocket /api/chat/stream + DELETE /api/chat/history
│   │   │   │   ├── documents.py  # CRUD /api/documents
│   │   │   │   └── admin.py      # Admin endpoints (models, prompts, stats, users)
│   │   │   └── services/
│   │   │       └── chat_stream.py # stream_chat_response, stream_rag_response
│   │   ├── rag/                  # RAG Pipeline
│   │   │   ├── pipeline.py       # Orchestrator: refine → embed → retrieve → rerank → synthesize → generate
│   │   │   ├── document/
│   │   │   │   ├── loader.py     # PDF, DOCX, PPTX, TXT, MD, HTML, CSV, XLSX
│   │   │   │   ├── parser.py     # Text extraction + metadata extraction
│   │   │   │   ├── cleaner.py    # NFKC normalization, whitespace, control chars
│   │   │   │   └── chunker.py    # Markdown-aware recursive split (size=1000, overlap=200)
│   │   │   ├── embedding/
│   │   │   │   └── embedder.py   # OpenAI / BGE / E5 embedding (async, batch)
│   │   │   ├── retriever/
│   │   │   │   ├── semantic.py   # pgVector cosine similarity
│   │   │   │   ├── keyword.py    # BM25 / PostgreSQL full-text search
│   │   │   │   ├── hybrid.py     # Combined + Reciprocal Rank Fusion (RRF)
│   │   │   │   └── reranker.py   # Cross-encoder re-ranking
│   │   │   ├── synthesis/
│   │   │   │   ├── base.py       # Abstract synthesis strategy
│   │   │   │   ├── create_and_refine.py  # Sequential chunk refinement
│   │   │   │   └── tree_summarization.py # Concurrent hierarchical merge
│   │   │   ├── prompt/
│   │   │   │   └── builder.py    # LangChain ChatPromptTemplate + conversation-aware templates
│   │   │   └── llm/
│   │   │       ├── adapter.py    # Unified interface (ABC)
│   │   │       ├── openai.py
│   │   │       ├── claude.py
│   │   │       ├── gemini.py
│   │   │       └── ollama.py
│   │   ├── services/
│   │   │   ├── chat_service/
│   │   │   │   ├── conversation_handler.py  # refine_question, answer, answer_with_context
│   │   │   │   ├── chat_history.py          # Fixed-size ring buffer (Q&A pairs)
│   │   │   │   └── ctx_strategy.py          # Synthesis strategy selection
│   │   │   └── ingest_documents_service/
│   │   │       ├── document.py              # Document dataclass
│   │   │       ├── document_registry.py     # SQLModel-backed registry (CRUD + diff/stale detection)
│   │   │       └── document_loader/
│   │   │           ├── loader.py            # DirectoryLoader (unstructured)
│   │   │           ├── text_splitter.py      # Markdown-aware RecursiveCharacterTextSplitter
│   │   │           └── format.py            # Format enum + per-format separators
│   │   ├── models/
│   │   │   └── document_record.py  # DocumentRecord SQLModel (documents table)
│   │   ├── schemas/
│   │   │   ├── chat.py             # ChatRequest, ChatResponse
│   │   │   ├── documents.py        # DocumentInfo, DocumentUploadResponse, DocumentListResponse
│   │   │   ├── health.py           # HealthResponse
│   │   │   └── model.py            # ModelSettings
│   │   ├── storage/
│   │   │   ├── vectorstore.py      # pgVector client (SQLAlchemy, async wrapper)
│   │   │   └── objectstore.py      # MinIO S3 client (singleton)
│   │   ├── queue/
│   │   │   ├── __init__.py         # ARQ job queue: index_document_job, delete_document_job, WorkerSettings
│   │   │   └── jobs.py             # ARQ background task definitions
│   │   ├── monitoring/
│   │   │   └── __init__.py         # Prometheus metrics + FastAPI instrumentator
│   │   ├── cache/
│   │   │   └── response_cache.py   # Redis LRU cache (TTL-based, query hash key)
│   │   └── helpers/
│   │       ├── log.py              # Structured JSON logger (structlog)
│   │       ├── prettier.py         # Format retrieval sources for display
│   │       └── id_generator.py     # SHA-256 deterministic ID generation
│   ├── tests/
│   │   ├── conftest.py             # Fixtures (llm, vector_db, db_engine, TestClient)
│   │   ├── unit/
│   │   │   ├── test_chunker.py
│   │   │   ├── test_cleaner.py
│   │   │   ├── test_parser.py
│   │   │   ├── test_config.py
│   │   │   ├── test_llm_adapter.py
│   │   │   ├── test_prompt_builder.py
│   │   │   ├── test_id_generator.py
│   │   │   ├── test_chat_history.py
│   │   │   ├── test_document_registry.py
│   │   │   ├── test_synthesis_strategies.py
│   │   │   └── test_conversation_handler.py
│   │   ├── integration/
│   │   │   ├── test_api.py         # All endpoint validation
│   │   │   ├── test_document_pipeline.py  # Full document processing pipeline
│   │   │   ├── test_chat_stream.py
│   │   │   └── test_rag_pipeline.py
│   │   └── performance/
│   │       ├── test_concurrent.py
│   │       └── test_large_document.py
│   └── scripts/
│       └── memory_builder.py       # CLI for incremental index rebuild
│
├── docker/
│   ├── docker-compose.yml          # 7 services (postgres, redis, minio, backend, worker, prometheus, grafana)
│   ├── Dockerfile.app              # Rocket.Chat + App
│   ├── Dockerfile.backend          # Python backend (Python 3.12-slim, uvicorn)
│   ├── prometheus/
│   │   └── prometheus.yml          # Scrape config (backend:8000/metrics every 15s)
│   └── grafana/
│       ├── dashboards/
│       │   └── ragchat-dashboard.json
│       └── provisioning/
│           ├── datasources/
│           │   └── prometheus.yml
│           └── dashboards/
│               └── provider.yml
├── .github/
│   └── workflows/
│       ├── ci.yaml                 # pytest + coverage threshold + lint
│       └── pre-commit.yaml         # Pre-commit CI
├── docs/
├── .gitnexus/
├── .pre-commit-config.yaml
├── Makefile
└── README.md
```

---

# 6. Verification & Testing

## Unit Testing

* Parser (text extraction, metadata)
* Chunker (markdown-aware split, size/overlap boundaries)
* Cleaner (unicode normalization, whitespace, control chars)
* Embedder (batch, query, async)
* Retriever (semantic, keyword, hybrid, RRF)
* Prompt Builder (context injection, history injection, all templates)
* LLM Adapter (all providers, error handling)
* Synthesis Strategies (create-and-refine, tree summarization)
* Chat History (ring buffer, eviction)
* Document Registry (CRUD, diff detection)
* ID Generator (deterministic, normalization)
* Config (defaults, env override)
* Rate Limiter
* Session Manager
* Response Cache (TTL, LRU eviction)

---

## Integration Testing

* Rocket.Chat ↔ App (slash commands, DM bot, message actions)
* App ↔ Python Backend (all REST API endpoints)
* Backend ↔ pgVector (embedding storage & retrieval)
* Backend ↔ LLM (prompt → response, all providers)
* Backend ↔ Object Storage (document upload & fetch)
* Upload Pipeline (upload → parse → clean → chunk → embed → store → registry)
* Incremental Indexing (new, changed, deleted documents)
* Async Queue (ARQ job lifecycle, status polling)
* Chat Streaming (WebSocket, RAG on/off toggle)
* Conversation History (refinement, ring buffer eviction)

---

## End-to-End Testing

* Upload document
* Index document
* Ask question
* Receive answer with citations
* Follow-up question (conversation awareness)
* Citation verification
* Permission validation
* Document deletion (cleanup from pgVector + MinIO + Registry)

---

## Performance Testing

Measure

* Response Time (p50, p95, p99)
* Time-to-First-Token (TTFT)
* Throughput (requests/sec)
* Concurrent Users (target: 50)
* Indexing Speed (pages/sec, chunks/sec)
* Large Document Performance (100+ pages)
* Cache Hit Rate

---

## Security Testing

* Authentication (API key validation, JWT)
* Authorization (RBAC, document-level)
* Prompt Injection (known attack patterns)
* Secret Leakage (env vars, logs)
* Access Control (cross-user, cross-department)
* Rate Limiting (burst, sustained)

---

## Accuracy Evaluation

### Retrieval Metrics

* Recall@K (K=3, 5, 10)
* Precision@K
* MRR (Mean Reciprocal Rank)
* NDCG@K

### Generation Metrics

* Context Relevance (RAGAS)
* Faithfulness (RAGAS — hallucination detection)
* Answer Relevance (RAGAS)
* Hallucination Rate
* Citation Accuracy (source match, page match)

### Evaluation Dataset

* Curated set of 50+ question-answer pairs from enterprise documents
* Synthetic test cases for edge cases (empty docs, multi-language, long context)
* Regular re-evaluation on model/provider changes

---

## User Acceptance Testing

Business scenarios

* HR knowledge search
* Technical documentation
* Company policy lookup
* Department knowledge sharing

Acceptance Criteria

* Correct answer
* Correct citation
* Stable performance
* Secure access control

---

# 7. Development Roadmap

## Phase 1 – MVP (Current)

* ✅ Rocket.Chat integration (5 slash commands, DM bot, 5 message actions)
* ✅ Document upload (8 formats, sync + async)
* ✅ RAG pipeline (parser → cleaner → chunker → embedder → pgVector)
* ✅ Semantic search (pgVector cosine similarity)
* ✅ AI answer generation (OpenAI + Claude)
* ✅ Citation support
* ✅ Session memory (client-side IPersistence)
* ✅ Basic monitoring (Prometheus metrics + Grafana)
* 🔲 Incremental indexing with Document Registry
* 🔲 Markdown-aware chunking
* 🔲 Server-side chat history ring buffer
* 🔲 Conversation-aware question refinement
* 🔲 Synthesis strategies (Tree Summarization + Create-and-Refine)
* 🔲 Deterministic document IDs (SHA-256)
* 🔲 Relevance score conversion (distance → [0,1])
* 🔲 CI/CD pipeline (GitHub Actions)
* 🔲 Pre-commit hooks (Ruff)
* 🔲 Makefile

---

## Phase 2 – Production

* Hybrid Search (semantic + keyword + RRF)
* Re-ranking (cross-encoder)
* Metadata filtering
* Admin Dashboard (model config, stats, user management)
* User Feedback (thumbs up/down, rating)
* Analytics (usage patterns, popular queries, cost tracking)
* Response caching (Redis LRU)
* Rate limiting
* Backend session manager
* Performance tests
* RAGAS evaluation pipeline
* Episodic memory (conversation-aware retrieval)

---

## Phase 3 – Enterprise

* Multi-tenant
* SSO (OAuth/OIDC)
* Multiple Knowledge Bases
* Cost Tracking (per-user, per-department)
* OCR (scanned PDFs, images)
* MCP Integration (Model Context Protocol)
* Agentic RAG (tool use, multi-step reasoning)
* GraphRAG (knowledge graph + entity extraction)
* Kubernetes deployment
* Read replicas for pgVector

---

# 8. Risks

| Risk                    | Mitigation                                      |
| ----------------------- | ----------------------------------------------- |
| Hallucination           | Better retrieval (hybrid + rerank), conservative prompt engineering, mandatory citations, RAGAS faithfulness evaluation |
| Large document indexing | Background queue (ARQ + Redis), incremental indexing (diff-based), configurable chunk size |
| High LLM cost           | Response caching (Redis LRU), smaller models for simple queries, token optimization, cost tracking dashboard |
| Unauthorized access     | RBAC and document-level permissions, API key validation, JWT |
| Slow response           | Hybrid search (RRF), pgVector HNSW index (Phase 2), response caching, concurrent synthesis (Tree Summarization) |
| App handler timeout     | App delegates all LLM calls to Python backend, returns response async via IModifyUpdater |
| Poor retrieval quality  | Conversation-aware question refinement, hybrid search, relevance threshold filtering, re-ranking |
| Duplicate/redundant indexing | Document Registry with SHA-256 version hash, incremental indexing |

---

# 9. Success Criteria

The project is considered successful when:

* Users can query enterprise documents directly from Rocket.Chat.
* Responses are accurate and include verifiable citations.
* Document permissions are enforced correctly.
* The system remains stable under expected load (50 concurrent users).
* The architecture supports future expansion with new LLM providers, vector databases, and enterprise knowledge sources.
* Retrieval quality meets target: Recall@5 ≥ 0.85, Faithfulness ≥ 0.90.
* Time-to-first-token < 5 seconds for 95th percentile.