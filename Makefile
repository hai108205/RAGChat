.PHONY: help install test test-ci build start start-worker migrate docker-config docker-up docker-down docker-logs docker-test-up docker-test-down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install project dependencies (app and backend)
	npm install
	cd backend && pnpm install

test: ## Run backend unit and integration tests
	cd backend && pnpm test

test-ci: ## Run backend test suite in CI mode
	cd backend && pnpm run test:ci

typecheck: ## Typecheck Rocket.Chat app & Backend TypeScript
	npx tsc --noEmit
	cd backend && pnpm run typecheck

build: ## Compile TypeScript files
	npx tsc
	cd backend && pnpm run build

migrate: ## Run Prisma database migrations
	cd backend && npx prisma migrate deploy

generate: ## Generate Prisma client
	cd backend && npx prisma generate

start: ## Start the Node.js backend server
	cd backend && node dist/index.js

start-worker: ## Start the BullMQ background worker
	cd backend && node dist/chatWorker.js

docker-up: ## Start all services via Docker Compose
	docker compose -f docker/docker-compose.yml up -d --remove-orphans

docker-config: ## Validate the full-stack Docker Compose file
	docker compose -f docker/docker-compose.yml config --quiet

docker-down: ## Stop all services
	docker compose -f docker/docker-compose.yml down --remove-orphans

docker-logs: ## Show logs from all services
	docker compose -f docker/docker-compose.yml logs -f

docker-test-up: ## Start backend test database
	cd backend && docker compose -f docker-compose.test.yml up -d

docker-test-down: ## Stop backend test database
	cd backend && docker compose -f docker-compose.test.yml down -v

clean: ## Remove build artifacts and caches
	rm -rf dist node_modules backend/node_modules backend/dist backend/generated 2>/dev/null || true
