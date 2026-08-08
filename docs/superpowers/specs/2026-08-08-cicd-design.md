# CI/CD Design — RAGChat

Date: 2026-08-08

## Purpose

Split the existing backend-only CI into dedicated workflows and add a
tag-triggered CD that verifies both Docker images build.

## Workflows

### 1. `ci-backend.yaml` (rename from `ci.yaml`)

- Triggers: push/PR to `main`, `paths: ["backend/**"]`, `paths-ignore: [".github/**"]`.
- Job: postgres (pgvector/pg16) + redis services, Python 3.12, `pip install -e ".[dev]"`.
- Steps: `ruff check src/ tests/` → `ruff format --check src/ tests/` → `pytest --cov=src --cov-fail-under=60`.

### 2. `ci-app.yaml` (new)

- Triggers: push/PR to `main`, `paths: ["src/**", "RagChatApp.ts", "app.json", "package.json", "tsconfig.json", ".rcappsconfig"]`.
- Job: Node 20, `npm ci`, `npx tsc --noEmit`.
- No `rc-apps package` build — typecheck is sufficient for CI.

### 3. `cd.yaml` (new)

- Triggers: `push: tags: ["v*"]`.
- Job: checkout → `docker build -f backend/Dockerfile -t ragchat-backend:${{ github.ref_name }} .` → `docker build -f docker/Dockerfile.app -t ragchat-app:${{ github.ref_name }} .`.
- Build only; no push, no registry login.

## Notes

- Both Dockerfiles use repo root as build context (`.`) — confirmed via COPY paths.
- No secrets required.
