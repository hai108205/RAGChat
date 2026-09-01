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

RAGChat operates on an **Integration-Only** architecture designed specifically for Rocket.Chat Apps-Engine. The backend maintains internal service identities for Rocket.Chat users (`rc_<workspace>_<user>`), securing all integration traffic via a shared Bearer Integration Token without public login/registration overhead.

```
+---------------------------------------------------------------------------+
|                              Rocket.Chat                                  |
|  +-----------------------+  +------------------+  +--------------------+  |
|  | Channel / DM / Thread |  |   File Uploads   |  |   Slash Commands   |  |
|  | (@bot, direct queries)|  | (.pdf, .md, ...) |  | (/rag, /ask, etc.) |  |
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
                                   | HTTPS / REST (Bearer Token)
                                   v
+---------------------------------------------------------------------------+
|                        RAGChat Backend (Express)                          |
|  - Integration Router: /api/v1/integrations/rocketchat/*                  |
|  - Real-time Chunking & Ingestion Pipeline                                |
|  - Vector Embedding Generation & Cosine Similarity Retrieval              |
|  - Asynchronous Worker Queue (BullMQ) & Webhook Callbacks                 |
|  - Observability: Prometheus /metrics & /healthz                          |
+-------+--------------------------+----------------------------+-----------+
        |                          |                            |
        v                          v                            v
+--------------+          +-----------------+          +-----------------+
|  PostgreSQL  |          |      Redis      |          |     Qdrant      |
|   (Prisma)   |          | (BullMQ Worker  |          |   (Vector DB    |
| Scope & Chat |          |   & Cache)      |          |   Collections)  |
+--------------+          +-----------------+          +-----------------+
```

---

## Key Features

- **Room & Workspace Scoped Knowledge Base**:
  - Documents uploaded in a channel/room are automatically scoped to that room.
  - Every team member in the room can immediately query the room's shared knowledge base.
- **Real-time Vector Ingestion**:
  - Drops of Markdown, PDF, text, and other documents are chunked, embedded, and indexed directly into Qdrant vector collections with detailed chunk metadata.
- **Conversational RAG & In-thread Citations**:
  - Immediate visual feedback placeholder in Rocket.Chat while the AI processes queries asynchronously.
  - Answers include source citations with relevance scores and snippet references.
- **Interactive UIKit Actions**:
  - **`/rag docs`**: Renders an interactive document list where users can view indexed documents and click **Delete** to safely remove the document from PostgreSQL and Qdrant.
  - **Feedback Buttons**: Thumbs Up / Thumbs Down buttons on AI answers log feedback into backend `AuditEvent` telemetry.
- **Rich Slash Commands**:
  - `/rag docs` - List and manage indexed knowledge base documents in the current room.
  - `/rag help` - Help guidance for RAG commands.
  - `/ask <query>` - Ask a question against the room's knowledge base.
  - `/summarize <text>` - Summarize long messages or documents.
  - `/explain <concept>` - Explain complex concepts with simple analogies.
  - `/translate <text>` - Translate text to target languages (e.g. Vietnamese).
  - `/search <query>` - Keyword search across indexed document pages.
- **Enterprise Telemetry & Monitoring**:
  - `/healthz` liveness & readiness check.
  - Prometheus `/metrics` endpoint with authentication.
  - Token usage cost tracking and audit event logging.

---

## Repository Structure

```
RAGChat/
├── RagChatApp.ts                   # Rocket.Chat App main entrypoint
├── app.json                        # App manifest & permissions
├── src/                            # Rocket.Chat App source code
│   ├── api/                        # Webhook endpoints (CallbackEndpoint.ts)
│   ├── commands/                   # Slash commands (RagCommand, AskCommand, etc.)
│   ├── constants/                  # Command strings & error constants
│   ├── handlers/                   # Interaction & event handlers (BlockAction, FileUpload)
│   ├── lib/                        # BackendClient & BackendTypes (SDK)
│   ├── persistence/                # Session store & Rocket.Chat storage helpers
│   ├── settings/                   # App administration settings
│   └── utils/                      # MessageHelper, Formatter, Validator, Logger
├── backend/                        # Node.js & Express RAG Backend
│   ├── controllers/                # Express controllers (rocketchatIntegration.controller.ts)
│   ├── routers/                    # API routers (rocketchatIntegration.route.ts)
│   ├── middlewares/                # Auth, validation, rate limiting
│   ├── prisma/                     # Prisma schema, migrations & config
│   ├── utils/                      # RAG utilities, Qdrant/Redis clients, Identity helpers
│   ├── tests/                      # Vitest unit & integration test suites
│   ├── Dockerfile                  # Production backend container image
│   └── docker-compose.test.yml     # Test database compose setup
├── docker/                         # Full-stack Docker Compose runtime
│   └── docker-compose.yml          # Complete stack (Postgres, Redis, Qdrant, Backend, Rocket.Chat)
├── docs/                           # Documentation & Refactoring Specifications
│   └── Backend_MODIFY.md           # Refactoring implementation details & checklist
└── Makefile                        # Project automation targets
```

---

## Quick Start with Docker Compose

The fastest way to spin up the entire environment (Rocket.Chat + Postgres + Redis + Qdrant + Backend + Worker):

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

# Shared secret token for Rocket.Chat integration
ROCKETCHAT_INTEGRATION_TOKEN="your_secure_integration_token_here"

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

### 2. Setup Backend

```bash
cd backend
pnpm install
pnpm prisma generate
pnpm prisma migrate dev

# Run in development mode
pnpm run dev

# (In a second terminal) Run background worker
pnpm run dev:worker
```

### 3. Setup Rocket.Chat App

In the project root:

```bash
# Install App dependencies
npm install

# Verify TypeScript compilation
npx tsc --noEmit
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
| `POST` | `/messages/async` | Asynchronously enqueue a RAG question; delivers answer via webhook callback. |
| `GET` | `/sources` | Retrieve indexed documents filtered by `workspaceId` and `roomId`. |
| `POST` | `/sources/base64` | Upload, chunk, embed, and index a base64 encoded document into Qdrant. |
| `DELETE`| `/sources/:id` | Safely delete a source from PostgreSQL and clean up Qdrant vector collections. |
| `POST` | `/feedback` | Record user feedback rating (`positive` / `negative`) for an answer into audit telemetry. |
| `POST` | `/utilities/completion` | Fast AI text utility completion (`summarize`, `explain`, `translate`, `search`). |
| `GET` | `/stats` | Aggregate document counts and token usage statistics. |
| `GET` | `/healthz` | Unauthenticated liveness and database/Redis health check. |
| `GET` | `/metrics` | Prometheus metrics scrape endpoint. |

---

## Testing & Verification

Run the comprehensive test suites:

```bash
# Run backend unit & integration tests (Vitest)
make test-ci

# Typecheck both Rocket.Chat App and Backend
make typecheck

# Run backend typecheck individually
cd backend && pnpm tsc --noEmit

# Run Rocket.Chat App typecheck individually
npx tsc --noEmit
```

---

## License

This project is licensed under the [MIT License](LICENSE).