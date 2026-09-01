# RAGChat

A Rocket.Chat app and AI service that answers questions from documentation and uploaded documents using RAG (Retrieval-Augmented Generation).

The app runs inside Rocket.Chat and communicates with a Node.js/Express backend that indexes documents into a vector database (Qdrant), manages conversational contexts in PostgreSQL (via Prisma), and generates answers via LLMs (OpenRouter/OpenAI/Anthropic/Google).

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────────┐
│  Rocket.Chat    │      │  RAGChat App     │      │  RAGChat Backend (API)  │
│  (bot @mention, │◄────►│  (TypeScript)    │◄────►│  Express + Node.js      │
│   DM, uploads)  │      │  handlers,       │      │  /api/v1/integrations/  │
└─────────────────┘      │  commands,       │      │  rocketchat/*           │
                         │  IHttp client    │      └──────────┬──────────────┘
                         └──────────────────┘                 │
                                                   ┌──────────┴──────────────┐
                                                   │  PostgreSQL (Prisma)    │
                                                   │  Redis (BullMQ worker)  │
                                                   │  Qdrant Vector DB       │
                                                   └─────────────────────────┘
```

- **Rocket.Chat App** (`src/`, TypeScript): listens for DMs to the bot, `@mention`s in channels, and file uploads; calls backend integration endpoints and receives webhook callbacks.
- **Backend** (`backend/`, Node.js/Express): Prisma ORM, BullMQ workers, Qdrant vector database, usage tracking, and audit logging.

## Features

- **DM with the bot** — ask questions directly in a direct message.
- **Channel `@mention`** — mention the bot (`@RAGChat your question`) to get answers in-thread.
- **File upload indexing** — drop a supported document (`.pdf`, `.docx`, `.txt`, `.md`, `.pptx`, `.csv`, `.xlsx`, `.html`) to index it into the vector store.
- **RAG Q&A with citations** — answers reference source documents with relevance scores.
- **Slash commands** — `/ask`, `/search`, `/summarize`, `/explain`, `/translate`.
- **Bot sub-commands** — `@ai start`, `@ai help`, `@ai stats`, `@ai clear`.
- **Async processing** — instant placeholder feedback in Rocket.Chat with background worker execution and webhook callbacks.
- **Monitoring** — `/healthz` check, Prometheus `/metrics`, and usage analytics.

## Repository layout

```
RagChatApp.ts              App entrypoint (implements IPostMessageSentToBot, IPostMessageSent, IPreFileUpload)
app.json                   App manifest (permissions, interfaces)
src/                       Rocket.Chat App source (handlers, commands, lib, settings, utils)
backend/                   Node.js RAG backend
  controllers/             Express route controllers
  routers/                 API routers (user, chat, message, integrations)
  middlewares/             Auth, rate limiting, and validation middlewares
  utils/                   RAG utilities, Prisma client, Qdrant client, metrics
  prisma/                  Prisma schema and migrations
  tests/                   Unit and integration tests
  Dockerfile               Backend production image used by the full-stack compose
  docker-compose.test.yml  Backend-only PostgreSQL test database
docker/                    Full-stack Docker Compose runtime
docs/api/                  Integration contract documentation
```

## Prerequisites

- Node.js 18+ and pnpm / npm
- Docker with the Compose plugin (for PostgreSQL, Redis, Qdrant, backend, worker, and Rocket.Chat)
- OpenRouter API key (or OpenAI / Anthropic key)

## Running the project

### 1. Configuration

Copy the backend environment template and configure secrets:

```bash
cp backend/.env.example backend/.env
```

The full-stack Docker Compose file reads `backend/.env.example` first and then
overrides it with `backend/.env` when that file exists. Container hostnames for
PostgreSQL, Redis, and Qdrant are set in `docker/docker-compose.yml`.

Key environment variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Backend HTTP port (default `8000`) |
| `DATABASE_URL` | PostgreSQL connection URL |
| `REDIS_HOST` / `REDIS_PORT` | Redis server for BullMQ and caching |
| `QDRANT_URL` | Qdrant vector database URL (e.g. `http://localhost:6333`) |
| `OPENROUTER_LLM_API_KEY` | OpenRouter LLM API key |
| `OPENROUTER_EMBEDDING_API_KEY` | OpenRouter embedding API key |
| `ROCKETCHAT_INTEGRATION_TOKEN` | Shared secret token for authenticating integration requests |

### 2. Full Stack with Docker Compose

```bash
make docker-up            # Starts Postgres, Redis, Qdrant, backend, BullMQ worker, and Rocket.Chat
make docker-config        # Validate the full-stack compose file
make docker-logs          # Tail service logs
make docker-down          # Stop all containers
```

`docker/docker-compose.yml` is the only full-stack runtime compose file. The
backend keeps `backend/docker-compose.test.yml` only for backend test database
setup.

### 3. Local Development

```bash
# 1. Start infrastructure services (Postgres, Redis, Qdrant)
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant

# 2. Install dependencies and generate Prisma client
make install
make generate

# 3. Apply database migrations
make migrate

# 4. Start backend server
make start

# 5. Start BullMQ background worker (in a separate terminal)
make start-worker
```

## Rocket.Chat App Setup

Install dependencies and typecheck:

```bash
npm install
npx tsc --noEmit
```

Deploy the app to your Rocket.Chat instance:

```bash
rc-apps deploy --url http://localhost:3001 --username admin --password admin
```

Configure App Settings (Administration → Apps → RAGChat → Settings):
- **Backend URL** — `http://backend:8000` (or `http://localhost:8000`)
- **Integration Token** — Must match `ROCKETCHAT_INTEGRATION_TOKEN` configured on the backend

## Testing

```bash
make test-ci               # Run backend unit and integration test suite
npx tsc --noEmit           # Typecheck Rocket.Chat app
```

Backend test database helpers:

```bash
make docker-test-up
make docker-test-down
```

## Integration API Reference

Full specification available in [`docs/api/rocketchat-integration-contract.md`](docs/api/rocketchat-integration-contract.md).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/integrations/rocketchat/messages/async` | Enqueue asynchronous RAG Q&A query |
| `GET` | `/api/v1/integrations/rocketchat/stats` | Retrieve indexed document stats and usage |
| `POST` | `/api/v1/integrations/rocketchat/sources/base64` | Upload and index base64 encoded document |
| `POST` | `/api/v1/integrations/rocketchat/utilities/completion` | Text utilities (`summarize`, `explain`, `translate`, `search`) |
| `GET` | `/healthz` | Health check endpoint |
| `GET` | `/metrics` | Prometheus metrics |

## License

MIT
