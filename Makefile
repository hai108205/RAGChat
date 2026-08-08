.PHONY: help install test test-cov lint format tidy migrate start clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install project dependencies
	cd backend && pip install -e ".[dev]"

test: ## Run tests
	cd backend && python -m pytest tests/ -v

test-cov: ## Run tests with coverage
	cd backend && python -m pytest tests/ -v --cov=src --cov-report=term-missing --cov-fail-under=60

test-unit: ## Run unit tests only
	cd backend && python -m pytest tests/unit/ -v

test-integration: ## Run integration tests only
	cd backend && python -m pytest tests/integration/ -v

lint: ## Run linting checks
	cd backend && ruff check src/ tests/

format: ## Format code
	cd backend && ruff format src/ tests/

tidy: ## Format + lint + fix
	cd backend && ruff format src/ tests/ && ruff check --fix src/ tests/

migrate: ## Create registry tables (SQLModel create_all; no alembic yet)
	cd backend && python -c "from sqlmodel import SQLModel, create_engine; from src.models import DocumentRecord; from src.config import settings; e = create_engine(settings.registry_url); SQLModel.metadata.create_all(e); print('registry tables ready')"

start: ## Start the backend server
	cd backend && uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

start-worker: ## Start the ARQ worker
	cd backend && arq src.taskqueue.WorkerSettings

docker-up: ## Start all services via Docker Compose
	docker compose -f docker/docker-compose.yml up -d

docker-down: ## Stop all services
	docker compose -f docker/docker-compose.yml down

docker-logs: ## Show logs from all services
	docker compose -f docker/docker-compose.yml logs -f

clean: ## Remove build artifacts and cache
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name *.egg-info -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/.ruff_cache 2>/dev/null || true
	rm -rf backend/htmlcov 2>/dev/null || true
	rm -rf backend/.coverage 2>/dev/null || true