# RAGChat

A Rocket.Chat bot that answers questions from uploaded documents using a RAG (Retrieval-Augmented Generation) system.

The app runs inside Rocket.Chat and talks to a Python backend that indexes documents into a vector database (pgVector) and generates answers via LLMs (OpenAI / Anthropic Claude).

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────────┐
│  Rocket.Chat    │      │  RAGChat App     │      │  RAGChat Backend (API)  │
│  (bot @mention, │◄────►│  (TypeScript)    │◄────►│  FastAPI + RAG pipeline │
│   DM, uploads)  │      │  handlers,       │      │                         │
└─────────────────┘      │  commands,       │      └──────────┬──────────────┘
                         │  IHttp client    │                 │
                         └──────────────────┘      ┌──────────┴──────────────┐
                                                   │  Postgres + pgVector    │
                                                   │  Redis (ARQ worker)     │
                                                   │  MinIO (optional)       │
                                                   └─────────────────────────┘
```

- **Rocket.Chat App** (`src/`, TypeScript): listens for DMs to the bot, `@mention`s in channels, and file uploads; calls the backend over HTTP.
- **Backend** (`backend/src/`, Python): FastAPI service. Loads → parses → chunks → embeds documents, stores chunks in pgVector, and answers questions with citations.

## Features

- **DM with the bot** — ask questions directly in a direct message.
- **Channel `@mention`** — mention the bot (`@RAGChat your question`) to get answers in-thread.
- **File upload indexing** — drop a supported document (`.pdf`, `.docx`, `.txt`, `.md`, `.pptx`, `.csv`, `.xlsx`, `.html`) and it is indexed automatically.
- **RAG Q&A with citations** — answers reference the source documents.
- **Slash commands** — `/ask`, `/search`, `/summarize`, `/explain`, `/translate`.
- **Bot sub-commands** — `@ai start`, `@ai help`, `@ai stats`, `@ai clear`.
- **Async indexing** — optional ARQ background jobs with status and Rocket.Chat webhook callbacks.
- **Monitoring** — Prometheus `/metrics` + Grafana dashboards.

## Repository layout

```
RagChatApp.ts              App entrypoint (implements IPostMessageSentToBot, IPostMessageSent, IPreFileUpload)
app.json                   App manifest (permissions, interfaces)
src/                       Rocket.Chat App source (handlers, commands, lib, settings, utils)
backend/                   Python RAG backend
  src/api/                 FastAPI routers (chat, documents)
  src/rag/                 document loaders, LLM adapters, RAG pipeline
  src/services/            chat history, ingest service, app callback
  src/taskqueue/           ARQ background worker
  src/storage/             vector store (pgVector), object store (MinIO)
  src/models/              SQLModel registry
  tests/                   unit + integration tests
docker/                    docker-compose stack, Dockerfiles, Prometheus/Grafana config
.github/workflows/         CI/CD
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.12+
- Docker (optional, for the full stack)
- OpenAI API key (or Anthropic API key)

## Backend setup

```bash
cd backend
pip install -e ".[dev]"

# Copy environment variables (see backend/src/config.py for all settings)
export OPENAI_API_KEY=your-key
export DATABASE_URL=postgresql://ragchat:ragchat@localhost:5432/ragchat
```

Create the registry tables:

```bash
make migrate
```

Start the API server:

```bash
make start          # uvicorn src.main:app on :8000
```

Start the ARQ worker (optional, for async indexing):

```bash
make start-worker   # arq src.taskqueue.WorkerSettings
```

### Backend configuration

All settings are read from environment variables (`backend/src/config.py`, pydantic-settings). Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI key (embedding + LLM) |
| `ANTHROPIC_API_KEY` | — | Anthropic key (Claude LLM) |
| `LLM_PROVIDER` | `openai` | `openai` or `claude` |
| `DATABASE_URL` | `postgresql://ragchat:ragchat@localhost:5432/ragchat` | pgVector DB |
| `REDIS_URL` | `redis://localhost:6379/0` | Queue / chat history |
| `USE_ASYNC_INDEXING` | `false` | Use ARQ background jobs |
| `API_KEY` | `""` | Bearer token required on `/api/*` (empty = open) |
| `APP_CALLBACK_URL` | `""` | Rocket.Chat webhook for job notifications |
| `USE_MINIO` | `false` | Store uploads in MinIO |
| `SIMILARITY_THRESHOLD` | `0.3` | Retrieval relevance cutoff |

## Rocket.Chat App setup

Install dependencies and typecheck:

```bash
npm ci
npx tsc --noEmit
```

Deploy the app to a Rocket.Chat instance:

```bash
rc-apps deploy --url http://localhost:3000 --username admin --password admin
```

Then configure the app settings (Admin → Apps → RAGChat → Settings):

- **Backend URL** — e.g. `http://localhost:8000`
- **API Key** — must match the backend `API_KEY` if set
- **LLM Model / Embedding Model** — model selection

## Run the full stack with Docker Compose

```bash
cp .env.example .env   # or set environment variables
make docker-up
```

Services started (`docker/docker-compose.yml`):

| Service | Purpose |
|---------|---------|
| `postgres` | pgVector vector database |
| `redis` | Queue + chat history cache |
| `minio` | Object storage for uploads (optional) |
| `backend` | FastAPI RAG API on `:8000` |
| `worker` | ARQ background indexing worker |
| `prometheus` | Metrics collection |
| `grafana` | Dashboards |

Useful commands:

```bash
make docker-logs   # tail logs
make docker-down   # stop the stack
```

## Development

```bash
make test          # run backend tests
make test-cov      # run with coverage (threshold 60%)
make lint          # ruff check
make format        # ruff format
make tidy          # format + lint --fix
```

Pre-commit hooks (ruff + whitespace checks) run automatically on commit — `pre-commit install` to enable locally.

### CI/CD

`.github/workflows/`:

- **CI Backend** (`ci-backend.yaml`) — ruff lint/format + pytest coverage on `backend/**` changes.
- **CI App** (`ci-app.yaml`) — `tsc --noEmit` on app changes.
- **CD** (`cd.yaml`) — builds the backend and app Docker images when a `v*` tag is pushed (no push of images).

## API reference

Base URL `http://localhost:8000`. Requires `Authorization: Bearer <API_KEY>` when `API_KEY` is set.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | RAG Q&A (query + history) |
| `DELETE` | `/api/chat/history` | Clear server-side chat history |
| `POST` | `/api/search` | Semantic search over chunks |
| `POST` | `/api/summarize` | Summarize text |
| `POST` | `/api/explain` | Explain a concept |
| `POST` | `/api/translate` | Translate text |
| `POST` | `/api/generate-reply` | Suggest a chat reply |
| `POST` | `/api/documents` | Upload document (multipart) |
| `POST` | `/api/documents/base64` | Upload document (base64 JSON, for the app's IHttp) |
| `GET` | `/api/documents` | List indexed documents |
| `DELETE` | `/api/documents/{id}` | Delete a document |
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics |

## License

MIT
