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

---

## 2.3 Document Processing

Pipeline

```
Upload
    ↓
Parser
    ↓
Cleaning
    ↓
Chunking
    ↓
Embedding
    ↓
Vector Database
```

Functions

* Text extraction
* Metadata extraction
* Chunk generation
* Embedding generation
* Incremental indexing

---

## 2.4 Retrieval

Support

* Semantic Search
* Keyword Search
* Hybrid Search
* Metadata Filter
* Top-K Retrieval
* Re-ranking

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

* Session Memory
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

* Low response latency
* Concurrent users
* Background indexing
* Efficient vector search

---

## Scalability

* Stateless services
* Horizontal scaling
* Queue-based indexing
* Distributed vector database

---

## Availability

* Health Check
* Retry mechanism
* Graceful degradation
* Automatic restart

---

## Security

Authentication

* Rocket.Chat Authentication
* OAuth
* JWT

Authorization

* RBAC
* Department-level permissions
* Document-level permissions

Security Controls

* Prompt Injection Protection
* Input Validation
* Secret Management
* Encryption

---

## Reliability

* Automatic retry
* Backup
* Recovery
* Error handling

---

## Observability

Logging

Metrics

Tracing

Audit Log

Performance Dashboard

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
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              RAG Pipeline (LangChain)           │  │
│  │                                                 │  │
│  │  Document → Parser → Chunker → Embedder         │  │
│  │  Query   → Embed  → Retriever → Prompt → LLM   │  │
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
   a. Embed query (text-embedding-3-small)
   b. Search pgVector (cosine similarity, top-K=5)
   c. Build prompt (system + context + history + query)
   d. Call LLM (OpenAI / Claude)
   e. Format citations
   f. Return { answer, sources }
5. App receives response
6. App sends answer via IModifyCreator with attachments (citations)
```

## 4.4 Document Flow

```
1. User uploads document via slash command or DM
2. App receives file, uploads to Python /api/documents
3. Python backend:
   a. Store raw file in Object Storage (MinIO)
   b. Parse (pdf→text, docx→text, etc.)
   c. Clean & normalize text
   d. Chunk (recursive character split, overlap=200, size=1000)
   e. Embed each chunk
   f. Store vectors + metadata in pgVector
4. Return indexing status to App → notify user
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
| Document Processor | Backend (Python) | LangChain document loaders + text splitters |
| Embedding Service | Backend (Python) | OpenAI / BGE / E5 embedding generation |
| Retriever | Backend (Python) | pgVector semantic search + hybrid search |
| Prompt Builder | Backend (Python) | LangChain prompt templates with context injection |
| LLM Adapter | Backend (Python) | Unified interface for OpenAI, Claude, Gemini, Ollama |
| Vector Store | Backend (Python) | pgVector with IVF Flat / HNSW index |
| Object Storage | Infra | MinIO — raw document files |
| Job Queue | Infra | Redis + ARQ — async document indexing |
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

### Infrastructure

| Concern | Technology |
|---------|-----------|
| Database | PostgreSQL 16 + pgVector |
| Cache / Queue | Redis 7 |
| Deployment | Docker Compose (MVP), Kubernetes (Production) |
| Monitoring | Prometheus + Grafana + OpenTelemetry

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
│   ├── src/
│   │   ├── main.py               # FastAPI app entry point
│   │   ├── api/
│   │   │   ├── chat.py           # POST /api/chat
│   │   │   ├── documents.py      # CRUD /api/documents
│   │   │   └── admin.py          # Admin endpoints
│   │   ├── rag/                  # LangChain RAG pipeline
│   │   │   ├── pipeline.py       # Orchestrator: embed → retrieve → generate
│   │   │   ├── document/
│   │   │   │   ├── loader.py     # PDF, DOCX, TXT, Markdown, PPTX, CSV, XLSX
│   │   │   │   ├── parser.py     # Text extraction + metadata extraction
│   │   │   │   ├── cleaner.py    # Text normalization, whitespace, unicode
│   │   │   │   └── chunker.py    # Recursive character split (size=1000, overlap=200)
│   │   │   ├── embedding/
│   │   │   │   └── embedder.py   # OpenAI / BGE / E5 embedding
│   │   │   ├── retriever/
│   │   │   │   ├── semantic.py   # pgVector cosine similarity
│   │   │   │   ├── keyword.py    # BM25 / full-text search
│   │   │   │   ├── hybrid.py     # Combined + reciprocal rank fusion
│   │   │   │   └── reranker.py   # Cross-encoder re-ranking
│   │   │   ├── prompt/
│   │   │   │   └── builder.py    # LangChain ChatPromptTemplate
│   │   │   └── llm/
│   │   │       ├── adapter.py    # Unified interface
│   │   │       ├── openai.py
│   │   │       ├── claude.py
│   │   │       ├── gemini.py
│   │   │       └── ollama.py
│   │   ├── storage/
│   │   │   ├── vectorstore.py    # pgVector client
│   │   │   └── objectstore.py    # MinIO client
│   │   ├── queue/
│   │   │   └── jobs.py           # ARQ background tasks (indexing)
│   │   └── config.py             # Pydantic Settings (env vars)
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── performance/
│
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.app            # Rocket.Chat + App
│   └── Dockerfile.backend        # Python backend
├── docs/
├── scripts/
├── .gitnexus/
└── README.md
```

---

# 6. Verification & Testing

## Unit Testing

* Parser
* Chunking
* Embedding
* Retriever
* Prompt Builder
* LLM Adapter
* Rate Limiter
* Session Manager

---

## Integration Testing

* Rocket.Chat ↔ App (slash commands, DM bot, message actions)
* App ↔ Python Backend (all REST API endpoints)
* Backend ↔ pgVector (embedding storage & retrieval)
* Backend ↔ LLM (prompt → response, all providers)
* Backend ↔ Object Storage (document upload & fetch)
* Upload Pipeline (upload → parse → chunk → embed → store)
* Async Queue (document indexing job lifecycle)

---

## End-to-End Testing

* Upload document
* Index document
* Ask question
* Receive answer
* Citation verification
* Permission validation

---

## Performance Testing

Measure

* Response Time
* Throughput
* Concurrent Users
* Indexing Speed
* Large Document Performance

---

## Security Testing

* Authentication
* Authorization
* Prompt Injection
* Secret Leakage
* Access Control
* Rate Limiting

---

## Accuracy Evaluation

Metrics

* Recall@K
* Precision@K
* Context Relevance
* Faithfulness
* Hallucination Rate
* Citation Accuracy

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

## Phase 1 – MVP

* Rocket.Chat integration
* Document upload
* RAG pipeline
* Citation
* Session memory
* Basic monitoring

---

## Phase 2 – Production

* Hybrid Search
* Re-ranking
* Metadata filtering
* Admin Dashboard
* User Feedback
* Analytics

---

## Phase 3 – Enterprise

* Multi-tenant
* SSO
* Multiple Knowledge Bases
* Cost Tracking
* OCR
* MCP Integration
* Agentic RAG
* GraphRAG

---

# 8. Risks

| Risk                    | Mitigation                                      |
| ----------------------- | ----------------------------------------------- |
| Hallucination           | Better retrieval, prompt engineering, citations |
| Large document indexing | Background queue (ARQ + Redis), incremental indexing |
| High LLM cost           | Cache, smaller models, token optimization       |
| Unauthorized access     | RBAC and document-level permissions             |
| Slow response           | Hybrid search, pgVector HNSW index, response caching |
| App handler timeout     | App delegates all LLM calls to Python backend, returns response async via IModifyUpdater |

---

# 9. Success Criteria

The project is considered successful when:

* Users can query enterprise documents directly from Rocket.Chat.
* Responses are accurate and include verifiable citations.
* Document permissions are enforced correctly.
* The system remains stable under expected load.
* The architecture supports future expansion with new LLM providers, vector databases, and enterprise knowledge sources.
