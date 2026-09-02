# RAGChat

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![Rocket.Chat Apps-Engine](https://img.shields.io/badge/Apps--Engine-1.44+-red.svg)](https://developer.rocket.chat)
[![Qdrant](https://img.shields.io/badge/Vector_DB-Qdrant-critical.svg)](https://qdrant.tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An intelligent enterprise Knowledge Base and RAG (Retrieval-Augmented Generation) assistant built directly for **Rocket.Chat**.

RAGChat allows users and teams to drop files into Rocket.Chat rooms, index documents into vector search in real-time, query knowledge bases via `@mention` or Slash Commands, and receive grounded answers with citations and interactive UIKit controls.

---

## Architecture

RAGChat operates on an **Integration-Only** architecture designed specifically for the Rocket.Chat Apps-Engine. The backend maintains internal service identities for Rocket.Chat users (`rc_<workspace>_<user>`), securing all integration traffic via a shared Bearer Integration Token with constant-time verification and strict fail-closed enforcement.

```
+---------------------------------------------------------------------------+
|                              Rocket.Chat                                  |
|  +-----------------------+  +------------------+  +--------------------+  |
|  | Channel / DM / Thread |  |   File Uploads   |  |   Slash Commands   |  |
|  | (@bot, direct queries)|  | (.pdf, .docx, ..)|  | (/rag, /ask, etc.) |  |
|  +-----------+-----------+  +--------+---------+  +---------+----------+  |
+--------------+-----------------------+----------------------+-------------+
               |                       |                      |
               v                       v                      v
+---------------------------------------------------------------------------+
|                      RAGChat App (Apps-Engine)                            |
|  - Handlers: BotMessageHandler, FileUploadHandler, MentionHandler         |
|  - UIKit: BlockActionHandler (Feedback, Delete), ViewSubmitHandler        |
|  - Slash Commands: /rag, /ask, /summarize, /explain, /translate, /search  |
|  - CallbackEndpoint: Webhook receiver for async AI responses & citations  |
+----------------------------------+----------------------------------------+
                                   | HTTPS / REST (Fail-Closed Bearer Token)
                                   v
+---------------------------------------------------------------------------+
|                        RAGChat Backend (Express)                          |
|  - Ingress Router: /api/v1/integrations/rocketchat/*                      |
|  - Constant-Time Auth (crypto.timingSafeEqual) & Trusted Origin Checks    |
|  - Fast HTTP 202 Enqueue -> BullMQ Queue (rocketchat-integration-jobs)    |
|  - Multi-tenant Scope Enforcement (Workspace / Room / Thread)             |
|  - Observability: Prometheus /metrics & /healthz                          |
+-------+--------------------------+----------------------------+-----------+
        |                          |                            |
        v                          v                            v
+--------------+          +-----------------+          +-----------------+
|  PostgreSQL  |          |      Redis      |          |     Qdrant      |
|   (Prisma)   |          |  (BullMQ Queue  |          |   (Vector DB    |
| Scope, Chat, |          |   & State Cache)|          |   Collections)  |
| Jobs Outbox  |          +--------+--------+          +--------+--------+
+--------------+                   |                            |
                                   v                            |
+-------------------------------------------------------------+ |
|             Integration Worker Service (BullMQ)             | |
|  - Worker: rocketchatIntegrationWorker.ts                   | |
|  - Multi-format Parsers (.pdf, .docx, .pptx, .xlsx, .csv..) | |
|  - Scoped Vector Retrieval & Generation Pipeline            | |
|  - Durable Webhook Dispatcher (POST to CallbackEndpoint)    |-+
+-------------------------------------------------------------+
```

---

## Key Features

- **Multi-Tenant Room & Workspace Scoped Knowledge Base**:
  - Documents uploaded in a channel/room are automatically scoped to that room.
  - Queries in Workspace A never cross-contaminate or leak into Workspace B.
- **Durable Asynchronous Processing (BullMQ)**:
  - Long operations comply with Rocket.Chat's 10-second execution ceiling by enqueuing jobs with deterministic IDs (`rc-job-${workspaceId}-${type}-${requestId}`).
  - State tracked durably in PostgreSQL `RocketChatIntegrationJob`.
- **Fail-Closed Enterprise Security**:
  - Constant-time Bearer token verification (`crypto.timingSafeEqual`).
  - Strict callback origin allowlisting (`ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS`).
  - Strict development lockout (`ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=false`).
- **Real-Time Vector Ingestion (Multi-Format)**:
  - Supports Markdown, PDF, DOCX, PPTX, XLSX, CSV, HTML, and TXT with magic-byte validation and 7 MiB payload safety checks.
- **Conversational RAG & In-thread Citations**:
  - Immediate visual feedback placeholder in Rocket.Chat while the AI processes queries asynchronously.
  - Answers include source citations with relevance scores and snippet references.
- **Interactive UIKit Actions**:
  - **`/rag docs`**: Renders an interactive document list with cursor pagination and one-click deletion.
  - **Feedback Telemetry**: Thumbs Up / Thumbs Down feedback buttons recorded into audit telemetry.
- **Rich Slash Commands**:
  - `/rag docs` - List and manage indexed knowledge base documents in the current room.
  - `/rag help` - Help guidance for RAG commands.
  - `/ask <query>` - Ask a question against the room's knowledge base.
  - `/summarize <text>` - Summarize long messages or documents.
  - `/explain <concept>` - Explain complex concepts with simple analogies.
  - `/translate <text>` - Translate text to target languages (e.g. Vietnamese).
  - `/search <query>` - Keyword & semantic search across indexed document pages.
- **Enterprise Operations & Telemetry**:
  - Unauthenticated `/healthz` liveness & readiness endpoint.
  - Prometheus `/metrics` endpoint with authentication.
  - Comprehensive Operational Runbook for queue draining, token rotation, and callback replays.

---

## Repository Structure

```
RAGChat/
├── RagChatApp.ts                   # Rocket.Chat App main entrypoint
├── app.json                        # App manifest & permissions
├── src/                            # Rocket.Chat App source code (Apps-Engine)
│   ├── api/                        # Webhook endpoints (CallbackEndpoint.ts)
│   ├── commands/                   # Slash commands (RagCommand, AskCommand, etc.)
│   ├── constants/                  # Command strings, HTTP budgets & error constants
│   ├── handlers/                   # Interaction & event handlers (BlockAction, FileUpload)
│   ├── lib/                        # BackendClient & BackendTypes (SDK)
│   ├── persistence/                # Session store & Rocket.Chat storage helpers
│   ├── settings/                   # App administration settings
│   └── utils/                      # MessageHelper, Formatter, Validator, Logger
├── backend/                        # Node.js & Express RAG Backend
│   ├── controllers/                # Express controllers (rocketchatIntegration.controller.ts)
│   ├── routers/                    # API routers (rocketchatIntegration.route.ts)
│   ├── middlewares/                # Fail-closed auth, validation, rate limiting
│   ├── prisma/                     # Prisma schema, migrations & config
│   ├── services/                   # RAG chat, ingestion & parser services
│   ├── workers/                    # BullMQ integration worker (rocketchatIntegrationWorker.ts)
│   ├── utils/                      # Queue, Scope, Upload policy, Qdrant/Redis clients
│   ├── tests/                      # Vitest unit & integration test suites
│   ├── Dockerfile                  # Production backend container image
│   └── docker-compose.test.yml     # Test database compose setup
├── docker/                         # Full-stack Docker Compose runtime
│   ├── docker-compose.yml          # Production stack (Postgres, Redis, Qdrant, Backend, Worker, Rocket.Chat)
│   ├── docker-compose.compat.yml   # Isolated full-stack compatibility verification harness
│   └── mock-openai/                # Deterministic mock OpenAI and webhook callback server
├── docs/                           # Documentation & Specifications
│   ├── api/                        # API contracts (rocketchat-integration-contract.md)
│   └── runbooks/                   # Operations runbook (rocketchat-integration.md)
├── tests/                          # E2E & Compatibility test harnesses
│   ├── compat/                     # Automated PowerShell full-stack matrix (run-compatibility.ps1)
│   └── contract/                   # OpenAPI contract compatibility tests
└── Makefile                        # Project automation targets
```

---

## Quick Start with Docker Compose

The fastest way to spin up the entire environment (Rocket.Chat + Postgres + Redis + Qdrant + Backend + Integration Worker):

### 1. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Ensure the following variables are set in `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/ragchat?schema=public"
REDIS_HOST="redis"
REDIS_PORT=6379
QDRANT_URL="http://qdrant:6333"

# Shared secret token for Rocket.Chat integration (min 32 chars hex)
ROCKETCHAT_INTEGRATION_TOKEN="your_secure_integration_token_here"
ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS="http://localhost:3001,http://rocketchat:3000"
ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV="false"

# LLM & Embedding provider keys
OPENROUTER_LLM_API_KEY="sk-or-v1-..."
OPENROUTER_EMBEDDING_API_KEY="sk-or-v1-..."
DEFAULT_LLM_MODEL="openai/gpt-4o-mini"
```

### 2. Launch Full Stack

```bash
make docker-up
```

Services started:
- **Rocket.Chat**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`
- **Integration Worker**: Running in background attached to Redis
- **Qdrant Dashboard**: `http://localhost:6333/dashboard`

To view logs:
```bash
make docker-logs
```

To shut down:
```bash
make docker-down
```

---

## Local Development

### 1. Start Infrastructure Dependencies

Start PostgreSQL, Redis, and Qdrant locally using Docker:

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant
```

### 2. Setup Backend & Integration Worker

```bash
cd backend
pnpm install
pnpm prisma generate
pnpm prisma migrate dev

# Run API server in development mode
pnpm run dev

# (In a separate terminal) Run BullMQ integration worker
pnpm run worker:integration
```

### 3. Setup Rocket.Chat App

In the project root:

```bash
# Install App dependencies
npm install

# Verify TypeScript compilation
npm run typecheck:sdk
```

### 4. Deploy App to Rocket.Chat

Install the Rocket.Chat Apps CLI if not already installed:

```bash
npm install -g @rocket.chat/apps-cli
```

Deploy the app to your running Rocket.Chat server:

```bash
rc-apps deploy --url http://localhost:3000 --username <admin-user> --password <admin-password>
```

Navigate to **Administration -> Apps -> RAGChat -> Settings** and configure:
- **Backend URL**: `http://localhost:8000` (or `http://backend:8000` if containerized)
- **Integration Token**: Matching `ROCKETCHAT_INTEGRATION_TOKEN` from your backend `.env`

---

## Integration API Reference

All integration endpoints are prefixed with `/api/v1/integrations/rocketchat` and require the `Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>` header.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/messages/async` | Asynchronously enqueue a RAG question (HTTP 202); delivers answer via webhook callback. |
| `GET` | `/sources` | Retrieve indexed documents filtered by `workspaceId` and `roomId` (cursor pagination). |
| `DELETE`| `/sources/:id` | Safely delete a source from PostgreSQL and clean up Qdrant vector collections. |
| `POST` | `/sources/base64` | Upload, parse, chunk, embed, and index a base64 encoded document into Qdrant. |
| `POST` | `/feedback` | Record user feedback rating (`positive` / `negative`) for an answer into audit telemetry. |
| `POST` | `/utilities/completion` | Fast AI text utility completion (`summarize`, `explain`, `translate`, `search`). |
| `GET` | `/stats` | Aggregate document counts and token usage statistics. |
| `GET` | `/healthz` | Unauthenticated liveness and database/Redis health check. |
| `GET` | `/metrics` | Prometheus metrics scrape endpoint. |

Detailed specifications are available in the [Rocket.Chat Integration Contract](docs/api/rocketchat-integration-contract.md).

---

## Operations & Runbooks

For production operations, disaster recovery, token rotation, and queue maintenance:
- **Operational Runbook**: [docs/runbooks/rocketchat-integration.md](docs/runbooks/rocketchat-integration.md)
  - Zero-downtime token rotation
  - BullMQ queue inspection, draining, and graceful shutdown
  - Replaying failed callback deliveries from the outbox without re-running RAG
  - Orphaned Qdrant collection cleanup
  - Safe database migration backups and rollback procedures

---

## Testing & Verification

### 1. Contract & Unit Tests

```bash
# Check OpenAPI contract drift
node scripts/check-integration-contract.mjs

# Run contract tests
npm run test:contract

# Run Rocket.Chat App unit & E2E tests
npm run test:unit

# Run backend unit & integration tests
pnpm --dir backend run test:ci
```

### 2. Full-Stack Compatibility Verification Harness

Run the automated compatibility matrix against an isolated Docker Compose environment:

```powershell
# Automated PowerShell runner: spins up isolated stack, verifies health, auth, async queues, ingestion, isolation
powershell -ExecutionPolicy Bypass -File tests/compat/run-compatibility.ps1
```

---

## License

This project is licensed under the [MIT License](LICENSE).