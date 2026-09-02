# Rocket.Chat Integration Operations Runbook

## 1. Overview & Architecture

The RAGChat Rocket.Chat integration is an **Integration-Only** architecture connecting the Rocket.Chat Apps-Engine app (`src/`) to the core RAG platform (`backend/`).

### System Topology

```
+-------------------------------------------------------------------------------+
|                                Rocket.Chat Server                             |
|  +-------------------------------------------------------------------------+  |
|  |                        RAGChat App (Apps-Engine)                        |  |
|  |   - Slash Commands (/ask, /rag, /summarize, /search)                    |  |
|  |   - Event Handlers (FileUploadHandler, BlockActionHandler)              |  |
|  |   - CallbackEndpoint (POST /api/apps/public/<app-id>/callback)          |  |
|  +------------------------------------+------------------------------------+  |
+---------------------------------------|---------------------------------------+
                                        | HTTPS (Bearer Token Auth)
                                        v
+-------------------------------------------------------------------------------+
|                            RAGChat Express API                                |
|  - Ingress Router: /api/v1/integrations/rocketchat/*                          |
|  - Fail-Closed Auth Middleware (timingSafeEqual)                              |
|  - Enqueue 202 Accepted -> BullMQ Queue (rocketchat-integration-jobs)         |
+-------------------+---------------------------------------+-------------------+
                    |                                       |
                    v                                       v
         +--------------------+                  +--------------------+
         |     PostgreSQL     |                  |       Redis        |
         |  - Scope & Sources |                  |  - BullMQ Queue    |
         |  - Jobs Outbox     |                  |  - Dedupe Locks    |
         +--------------------+                  +---------+----------+
                                                           |
                                                           v
+-------------------------------------------------------------------------------+
|                         Integration Worker Service                            |
|  - BullMQ Worker: rocketchatIntegrationWorker.ts                              |
|  - RAG Ingestion Pipeline (Cheerio, pdf-parse, mammoth, xlsx, jszip)          |
|  - Scoped Vector Retrieval & Qdrant Collections                               |
|  - Outbox Webhook Dispatcher (POST to Rocket.Chat CallbackEndpoint)           |
+-------------------+---------------------------------------+-------------------+
                    |                                       |
                    v                                       v
         +--------------------+                  +--------------------+
         |       Qdrant       |                  |    LLM Provider    |
         |  Vector Embeddings |                  | (OpenRouter/OpenAI)|
         +--------------------+                  +--------------------+
```

---

## 2. Production Environment Configuration

### Required Environment Variables

| Variable | Requirement | Recommended Value / Format | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Mandatory** | `production` | Enforces production hardening and strict validation |
| `ROCKETCHAT_INTEGRATION_TOKEN` | **Mandatory** | High-entropy secret (min 32 chars hex) | Shared Bearer token used between Rocket.Chat App and Backend |
| `ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS` | **Mandatory** | `https://chat.yourcompany.com` | Comma-separated allowlist of trusted callback origins |
| `ROCKETCHAT_CALLBACK_BASE_URL` | Optional | `https://chat.yourcompany.com` | Primary fallback origin for webhook callbacks |
| `ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV` | **Mandatory** | `false` | Must NEVER be `true` in staging or production |
| `ROCKETCHAT_WORKER_CONCURRENCY` | Optional | `5` to `20` (Default: `5`) | Number of concurrent async jobs per worker replica |

### Generating Secure Secrets

Use a cryptographically secure random generator:

```bash
# Generate high-entropy integration token (64 hex characters)
openssl rand -hex 32
```

### Execution Budgets & Timeouts

1. **Rocket.Chat Deno Runtime Budget**:
   - The Rocket.Chat Apps-Engine execution environment has a strict **10-second ceiling** per handler execution.
   - Long-running operations (`/ask`, file ingestion) MUST return `HTTP 202 Accepted` immediately.

2. **SDK HTTP Timeouts (`src/constants/Timeouts.ts`)**:
   - `ENQUEUE`: 5,000 ms (Fast path for async message and file ingestion job enqueue)
   - `SEARCH`: 5,000 ms (Direct vector search queries)
   - `UTILITY`: 8,000 ms (Fast completions: summarize, explain, translate)
   - `MANAGEMENT`: 8,000 ms (Stats retrieval, document deletion, feedback)

3. **Body & Payload Limits**:
   - **Upload File Size Limit**: 7 MiB raw file (`backend/utils/uploadPolicy.ts`).
   - **Base64 Payload Size**: ~9.33 MiB encoded string.
   - **Express Body Parser Limit**: `20mb` (`backend/app.ts`) to accommodate JSON wrapper and base64 documents.
   - Any upload exceeding 7 MiB is rejected preflight by the SDK and fail-fast checked by the backend.

---

## 3. Zero-Downtime Token Rotation Procedure

Because the backend performs constant-time cryptographic verification (`crypto.timingSafeEqual`) against `ROCKETCHAT_INTEGRATION_TOKEN`, rotating the token requires coordinated deployment.

### Protocol Steps

```
[Phase 1: Dual Config]      [Phase 2: App Update]       [Phase 3: Finalize]
Backend allows New & Old -> Update RC App Setting    -> Backend allows New only
```

#### Step 1: Pre-generate New Token
```bash
NEW_TOKEN=$(openssl rand -hex 32)
echo "New Token: $NEW_TOKEN"
```

#### Step 2: Configure Reverse Proxy / API Gateway (or Dual-Token Backend)
If using an API Gateway (Envoy/Nginx/Kong), configure the gateway to accept both `$OLD_TOKEN` and `$NEW_TOKEN`, mapping the Authorization header to the backend.
If rotating directly on the backend container:
1. Update `ROCKETCHAT_INTEGRATION_TOKEN` in the backend environment.
2. Deploy backend service replicas with rolling restart.

#### Step 3: Update Rocket.Chat App Settings
1. Log in to Rocket.Chat with an Administrator account.
2. Navigate to: **Administration > Workspace > Apps > RAGChat > Settings**.
3. Under **Integration Token**, paste `$NEW_TOKEN`.
4. Click **Save Changes**.

#### Step 4: Verify Live Traffic
Monitor backend access logs:
```bash
# Verify requests succeed with HTTP 200/202 and no 401s
docker compose logs -f --tail=50 backend | grep -E "integrations/rocketchat|HTTP 401"
```

#### Step 5: Decommission Old Token
Ensure the old token is removed from all infrastructure secret stores and rotation documentation.

---

## 4. BullMQ Queue Monitoring & Troubleshooting

All asynchronous Rocket.Chat jobs (RAG queries and file ingestions) flow through BullMQ.

### Queue Specification
- **Queue Name**: `rocketchat-integration-jobs`
- **Redis Key Prefix**: `bull:rocketchat-integration-jobs:*`
- **Deterministic Job ID Format**: `rc-job-${workspaceId}-${type}-${requestId}`
- **Database Tracking Table**: `RocketChatIntegrationJob` in PostgreSQL.

### Key Redis Inspection Commands

Connect to the Redis instance:
```bash
docker compose exec redis redis-cli
```

Check queue status:
```redis
# Check pending (waiting) jobs
LLEN bull:rocketchat-integration-jobs:wait

# Check currently running (active) jobs
SCARD bull:rocketchat-integration-jobs:active

# Check failed jobs
ZCARD bull:rocketchat-integration-jobs:failed

# Check delayed/retry jobs
ZCARD bull:rocketchat-integration-jobs:delayed

# Inspect the last 5 failed jobs
ZREVRANGE bull:rocketchat-integration-jobs:failed 0 4 WITHSCORES
```

### Database Job Tracking (`RocketChatIntegrationJob`)

Every job is persisted in PostgreSQL to guarantee durability and state auditing:

```sql
-- Check job distribution by status in the last 24 hours
SELECT status, count(*) 
FROM "RocketChatIntegrationJob" 
WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Find stuck or failing jobs
SELECT id, type, "workspaceId", "requestId", attempts, error, "createdAt", "updatedAt"
FROM "RocketChatIntegrationJob"
WHERE status = 'FAILED' OR (status = 'PROCESSING' AND "updatedAt" < NOW() - INTERVAL '10 minutes')
ORDER BY "updatedAt" DESC
LIMIT 20;
```

### Common Failure Symptoms & Triage

1. **Job Status `FAILED` with `Connection to Qdrant failed`**:
   - Cause: Qdrant service is down or network partitioned.
   - Triage: Check `docker compose ps qdrant`, inspect Qdrant logs: `docker compose logs qdrant`.
   - Resolution: Restart Qdrant; BullMQ will automatically retry with exponential backoff (up to 3 attempts).

2. **Job Status `FAILED` with `LLM Provider Timeout`**:
   - Cause: Upstream model provider (OpenRouter/OpenAI) exceeded latency threshold.
   - Triage: Check provider status page and backend outbound connectivity.
   - Note: The worker dispatches a `chat_failed` callback to Rocket.Chat to clear user placeholder messages.

3. **Stalled Jobs (`status = 'PROCESSING'` indefinitely)**:
   - Cause: Worker process crashed hard (e.g. OOM) during job execution.
   - Triage: BullMQ automatically detects stalled locks after `lockDuration` (30 seconds) and reassigns the job to an available worker replica.

---

## 5. Queue Draining & Graceful Shutdown

Before applying application upgrades, scaling down worker instances, or performing host maintenance, follow the queue draining protocol to ensure no active jobs are lost.

### Graceful Termination Mechanics
`rocketchatIntegrationWorker.ts` listens for `SIGINT` and `SIGTERM`:
```typescript
async function shutdownWorker() {
    await closeRocketChatWorker();     // Pauses worker and awaits in-flight jobs
    await redis.quit();                 // Closes Redis connection cleanly
    await prisma.$disconnect();         // Disconnects PostgreSQL client
    process.exit(0);
}
```

### Draining Protocol

1. **Check Active Jobs**:
   ```bash
   docker compose exec redis redis-cli SCARD bull:rocketchat-integration-jobs:active
   ```

2. **Pause Ingress (Optional for maintenance windows)**:
   - Temporarily stop accepting new HTTP 202 requests by scaling API or redirecting traffic.

3. **Send SIGTERM to Worker Container**:
   ```bash
   # Docker sends SIGTERM and waits up to 30s before SIGKILL
   docker compose stop --timeout 30 integration-worker
   ```

4. **Verify Zero Active Jobs in Redis**:
   ```bash
   docker compose exec redis redis-cli SCARD bull:rocketchat-integration-jobs:active
   # Output must be 0
   ```

5. **Proceed with Deployment / Maintenance**.

---

## 6. Replaying Callback Delivery (`BLOCKED`/`DEAD`) from Outbox

When Rocket.Chat is temporarily unavailable (network blip, server restart, 5xx gateway error), callbacks to `CallbackEndpoint` can fail.
The system implements a durable delivery outbox. **Replaying callbacks does NOT re-run RAG retrieval or LLM inference**, saving cost and avoiding duplicate message loops.

### Diagnosing Blocked Callbacks

Query the callback outbox table:
```sql
SELECT id, "jobId", "callbackUrl", status, attempts, "lastError", "createdAt"
FROM "RocketChatCallbackOutbox"
WHERE status IN ('BLOCKED', 'DEAD')
ORDER BY "createdAt" DESC;
```

### Executing Callback Replay

Run the callback replay utility script:

```bash
# Replay a specific callback by Job ID
pnpm --dir backend run script:replay-callbacks --job-id rc-job-default-chat-ask-1788192000-abc123

# Replay all BLOCKED or DEAD callbacks from the last 2 hours
pnpm --dir backend run script:replay-callbacks --all-blocked --since 2h
```

### Manual Replay via cURL (Emergency Fallback)

If the script runner is unavailable, grab the terminal callback payload from the `RocketChatIntegrationJob` or `RocketChatCallbackOutbox` and POST directly to Rocket.Chat:

```bash
curl -X POST "https://chat.yourcompany.com/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "chat_completed",
    "request_id": "ask-1788192000-abc123",
    "user_id": "user-123",
    "room_id": "GENERAL",
    "placeholder_id": "msg-placeholder-123",
    "query": "How do I configure OAuth in Rocket.Chat?",
    "answer": "To configure OAuth, navigate to Administration > Settings > OAuth...",
    "sources": []
  }'
```

---

## 7. Cleaning Orphaned Qdrant Collections

Orphaned collections in Qdrant can occur if:
1. Ingestion crashed after creating the Qdrant collection but before persisting the `ChatSource` record in PostgreSQL.
2. A document was deleted in PostgreSQL during a network partition where Qdrant deletion timed out.

### Automated Cleanup Outbox
The backend writes deletion intent to `QdrantCleanupOutbox`. The worker retries deletion until confirmed.

### Auditing & Reconciliation Procedure

#### Step 1: List Collections in Qdrant
```bash
curl -s "http://localhost:6333/collections" | jq -r '.result.collections[].name' | sort > /tmp/qdrant_collections.txt
```

#### Step 2: List Active Collections in PostgreSQL
```bash
docker compose exec postgres psql -U ragchat -d ragchat -t -c \
  "SELECT DISTINCT \"collectionName\" FROM \"ChatSource\" WHERE \"collectionName\" IS NOT NULL;" | \
  tr -d ' ' | sort > /tmp/db_collections.txt
```

#### Step 3: Identify Orphaned Collections
```bash
# Collections present in Qdrant but absent in PostgreSQL
comm -23 /tmp/qdrant_collections.txt /tmp/db_collections.txt > /tmp/orphaned_collections.txt
cat /tmp/orphaned_collections.txt
```

#### Step 4: Safely Delete Orphaned Collections
```bash
while read -r collection; do
  if [[ -n "$collection" ]]; then
    echo "Deleting orphaned collection: $collection"
    curl -X DELETE "http://localhost:6333/collections/$collection"
  fi
done < /tmp/orphaned_collections.txt
```

---

## 8. Safe Database Migration, Backup & Rollback

### Pre-Migration Backup Protocol
**ALWAYS** perform a physical/logical backup before deploying database schema migrations.

```bash
# Create compressed logical database backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
docker compose exec -T postgres pg_dump -U ragchat -d ragchat -Fc > "ragchat_backup_${TIMESTAMP}.dump"
echo "Backup saved to: ragchat_backup_${TIMESTAMP}.dump"
```

### Applying Migrations
In production, Prisma migrations are applied using the dedicated migration container:
```bash
docker compose run --rm backend-migrate
```
Or directly from the backend host:
```bash
pnpm --dir backend prisma migrate deploy
```

### Rollback Strategy

Prisma Migrate does not generate down-migrations automatically. Rollback is performed via compensating migration or snapshot restoration:

#### Option A: Rollback via Pre-Migration Dump
```bash
# 1. Stop backend and worker services to prevent writes
docker compose stop backend integration-worker

# 2. Restore database from dump
docker compose exec -T postgres dropdb -U ragchat ragchat
docker compose exec -T postgres createdb -U ragchat ragchat
docker compose exec -T postgres pg_restore -U ragchat -d ragchat "ragchat_backup_${TIMESTAMP}.dump"

# 3. Restart application services
docker compose up -d backend integration-worker
```

#### Option B: Compensating Migration (Zero Downtime)
1. Write a compensating SQL script in `backend/prisma/migrations/rollback_<migration_name>/migration.sql`.
2. Apply using `pnpm --dir backend prisma migrate deploy`.
3. Verify Prisma migration status:
   ```bash
   pnpm --dir backend prisma migrate status
   ```

---

## 9. Compatibility Verification Checklist

Before certifying any deployment, run the compatibility verification harness:

```powershell
# Run full-stack compatibility suite against local test harness
powershell -ExecutionPolicy Bypass -File tests/compat/run-compatibility.ps1
```

Expected output:
```
================================================================
       RAGChat Compatibility Test Suite Results Summary        
================================================================
 Total Matrix Checks: 10
 Passed:              10
 Failed:              0
----------------------------------------------------------------
 OVERALL STATUS: ALL COMPATIBILITY TESTS PASSED [SUCCESS]
================================================================
```
