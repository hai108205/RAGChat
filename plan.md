# SDK–Backend Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đồng bộ toàn bộ contract và execution logic giữa Rocket.Chat SDK trong `src/` với integration backend trong `backend/`, lấy hành vi người dùng của SDK làm yêu cầu nguồn, đồng thời bảo đảm cô lập workspace/room/thread, xử lý bất đồng bộ bền vững và có bộ kiểm thử tương thích end-to-end.

**Architecture:** Giữ nguyên 7 integration endpoint hiện có để không phá SDK, nhưng chuẩn hóa request/response/callback bằng một OpenAPI contract duy nhất. Controller backend chỉ xác thực, kiểm tra scope và enqueue; BullMQ worker xử lý RAG/ingestion và gửi callback có retry/idempotency. Mọi truy vấn source, search, stats, feedback và delete dùng chung một scope policy dựa trên `workspaceId`, `roomId`, `threadId`.

**Tech Stack:** Rocket.Chat Apps-Engine 1.44, TypeScript, Express 5, Zod 4, Prisma/PostgreSQL, BullMQ/Redis, Qdrant, OpenAI-compatible API, Vitest/Supertest, Docker Compose.

---

## 1. Phạm vi và nguyên tắc quyết định

- `src/` là SDK/Rocket.Chat App và là nguồn yêu cầu cho hành vi người dùng: slash command, DM/mention, upload, UIKit action và callback.
- `backend/` phải đáp ứng các integration flow mà SDK thực sự gọi. Các web route JWT (`/api/v1/user`, `/chat`, `/usage`, `/admin`, ...) không được SDK gọi và nằm ngoài phạm vi thay đổi chức năng, trừ khi chia sẻ data model bị migration tác động.
- Không đổi path của 7 endpoint hiện tại và không đổi public method signature của `BackendClient` nếu không thật sự cần thiết.
- Contract chuẩn dùng camelCase ở request/response API và snake_case ở callback event hiện có để tương thích `CallbackEndpoint`; SDK tiếp tục đọc alias cũ trong một chu kỳ chuyển tiếp.
- Mọi thay đổi symbol phải chạy GitNexus `impact(..., direction: upstream)` ngay trước khi sửa. Nếu kết quả HIGH/CRITICAL, dừng và cảnh báo người dùng trước khi tiếp tục.
- Trước mỗi commit phải chạy `detect_changes({scope: "compare", base_ref: "main"})` hoặc CLI tương đương và xác nhận chỉ có symbol/flow dự kiến.

## 2. Bản đồ contract hiện tại

| SDK method / flow | Backend endpoint | Trạng thái hiện tại | Vấn đề chính |
|---|---|---:|---|
| `BackendClient.askAsync` | `POST /messages/async` | Khớp một phần | 202 dùng `setImmediate`, không phải queue bền vững; model/temperature setting không được truyền; lỗi LLM vẫn trả `chat_completed` |
| `listDocuments` | `GET /stats` | Sai logic scope | Backend nhận `workspaceId/roomId/threadId` nhưng bỏ qua và trả tối đa 50 source + usage toàn hệ thống |
| `listSources` | `GET /sources` | Gần khớp | Scope cơ bản có, nhưng default limit 50 có thể làm duplicate detection thiếu; chưa có contract test cách ly tenant/thread đầy đủ |
| `deleteSource` | `DELETE /sources/:id` | Gần khớp | Room mode có ownership check; global mode quá rộng; không có actor/authorization policy ngoài shared token |
| `submitFeedback` | `POST /feedback` | Khớp shape, thiếu integrity | Không xác minh `chatMessageId` thuộc workspace/room/user gửi feedback |
| `uploadBase64` | `POST /sources/base64` | Sai chức năng với file binary | SDK cho phép PDF/DOCX/PPTX/XLSX nhưng backend luôn `Buffer.toString("utf8")`; 202 không bền vững; không validate base64/size/magic bytes; response không có `sourceId` như tài liệu cũ mô tả |
| `summarize/explain/translate/search` | `POST /utilities/completion` | Khớp shape một phần | Validation không bắt field theo operation; utility LLM có thể vượt timeout 8s; search bỏ qua workspace/room và chỉ tìm heading trong PostgreSQL, không semantic/Qdrant |
| `CallbackEndpoint` | Backend POST callback URL | Khớp happy path | Dedup bằng RAM; callback URL chưa chống SSRF/allowlist; event-specific body không được schema hóa; retry không bền vững |
| SDK settings | Backend model/embedding config | Không khớp | `model`, `embedding-model`, `temperature` được khai báo trong SDK nhưng không được đọc để gọi backend; backend dùng env/hard-code |
| Response envelope | `ApiResponse` / error middleware | Drift | `ApiResponse` phát `statuscode`, docs/type kỳ vọng `statusCode`; error envelope không có `success: false`, `data: null` nhất quán |

## 3. Các phát hiện theo mức độ ưu tiên

### P0 — phải xử lý trước rollout

1. **Rò rỉ scope:** `/stats` và `/utilities/completion` operation `search` có thể trả dữ liệu ngoài workspace/room đang gọi.
2. **Upload binary không đúng:** PDF, DOCX, PPTX, XLSX được SDK quảng bá là hỗ trợ nhưng backend index chuỗi UTF-8 rác.
3. **Async không bền vững:** controller trả 202 rồi chạy `setImmediate`; process restart sau 202 làm mất job và placeholder treo vĩnh viễn.
4. **Auth fail-open:** `verifyIntegrationToken` cho phép request khi env token thiếu mà không kiểm tra `NODE_ENV`; cấu hình production sai có thể mở toàn bộ integration API.
5. **Timeout SDK không phù hợp:** async enqueue đang dùng `HTTP_TIMEOUT.DEFAULT = 60000`, trong khi Apps-Engine handler có budget khoảng 10 giây.

### P1 — cần có trước khi coi là tương thích hoàn chỉnh

1. Settings model/embedding/temperature của SDK không ảnh hưởng backend.
2. Callback và request idempotency chỉ nằm trong RAM; restart hoặc multi-replica gây xử lý trùng.
3. Feedback không kiểm tra quan hệ `chatMessageId` với scope caller.
4. Callback URL do request cung cấp được backend `fetch` trực tiếp; cần trusted-origin policy.
5. Lỗi LLM trong async flow bị đổi thành text xin lỗi và gửi `chat_completed`, làm telemetry và UX hiểu sai trạng thái.
6. Utility schema cho phép `summarize` không có `text`, `search` không có `query`, v.v.

### P2 — contract/quality drift

1. `statuscode`/`statusCode`, `jobId`/`job_id`, `requestId`/`request_id` đang tồn tại song song.
2. `docs/api/rocketchat-integration-contract.md` mô tả upload 202 có `sourceId`, nhưng backend chưa tạo source tại thời điểm trả 202.
3. Test dùng `mimeType` trong khi SDK type dùng `contentType`.
4. Root SDK typecheck kéo backend qua `tests/server/RealBackendHarness.ts` và compile bằng tsconfig ES2017/CommonJS, gây hàng trăm lỗi giả; mock Apps-Engine cũng đã lệch interface 1.44.
5. README nói có BullMQ worker cho integration flow, nhưng message/upload integration hiện không dùng worker đó.

## 4. Blast radius đã đo

GitNexus index được refresh tại commit `b502fb0` (3.587 nodes, 7.078 edges, 246 flows). FTS/BM25 không khả dụng, nhưng call-graph impact vẫn hoạt động.

| Symbol | Risk | Direct / total impact | Flow đáng chú ý |
|---|---:|---:|---|
| `BackendClient` | **CRITICAL** | 29 trực tiếp / 42 tổng | 22 flow: toàn bộ slash commands, DM/mention, upload, Block/Action/View handlers |
| `CallbackEndpoint` | LOW | 4 trực tiếp / 9 tổng | App registration và callback E2E tests |
| `sendRocketChatCallback` | LOW | 2 trực tiếp / 2 tổng | async chat và base64 ingestion |
| Controller exports (`handleAsyncMessage`, `getStats`, `listSources`, `handleBase64Source`, `handleUtilityCompletion`) | Graph báo ambiguous Function/Const, max LOW | Router import chưa được graph nối đầy đủ | Phải chạy lại bằng UID `Function:<path>:<name>` trước khi sửa |

Do `BackendClient` là CRITICAL, ưu tiên thêm overload/options ở cuối hoặc tự đọc setting bên trong client; không dịch chuyển positional parameters hiện hữu.

## 5. Baseline kiểm thử ngày 2026-09-02

- `node .gitnexus/run.cjs status`: PASS, index up-to-date ở `b502fb0`.
- `pnpm.cmd exec tsc --noEmit -p backend/tsconfig.json`: PASS.
- `backend/tests/integration/rocketchat.integration.test.ts`: 21 PASS / 3 FAIL. Ba fail là expectation cũ `"Mocked AI response"` không khớp test fallback hiện trả `"AI completion response for: ..."`.
- `npm.cmd run test:sdk-fix`: PASS.
- Root `npx.cmd tsc --noEmit -p tsconfig.json`: FAIL do test mocks lệch Apps-Engine và `RealBackendHarness` kéo source backend vào SDK tsconfig.
- `tests/04_E2E_Commands_And_Handlers.test.ts` và `tests/06_E2E_Full_App_Workflow.test.ts`: PASS runtime.
- `tests/01_BackendClient.test.ts`: 4 PASS / 6 FAIL vì Postgres/Redis local không chạy hoặc schema chưa sẵn sàng; đây là lỗi test orchestration, không phải bằng chứng endpoint tương thích.

---

## Task 1: Đóng băng contract chuẩn và thêm contract drift gate

**Files:**
- Create: `contracts/rocketchat-integration.openapi.yaml`
- Create: `scripts/check-integration-contract.mjs`
- Create: `.github/workflows/compatibility.yml`
- Create: `src/lib/generated/IntegrationApi.ts`
- Create: `backend/types/generated/IntegrationApi.ts`
- Create: `backend/utils/generated/rocketchatSchemas.ts`
- Modify: `package.json`
- Modify: `backend/package.json`
- Modify: `src/lib/BackendTypes.ts`
- Modify: `backend/utils/validationSchemas.ts`
- Modify: `backend/utils/ApiResponse.ts`
- Modify: `backend/app.ts`
- Modify: `docs/api/rocketchat-integration-contract.md`
- Test: `tests/contract/sdk-backend-contract.test.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Chạy impact trước khi sửa**

  Chạy impact cho `BackendResponseEnvelope`, `ApiResponse`, `validate`, từng Zod schema Rocket.Chat và error middleware. Ghi direct callers, affected processes và risk vào commit note.

- [x] **Step 2: Viết test đỏ cho envelope và 7 endpoint**

  Contract chuẩn:

  ```json
  { "statusCode": 202, "success": true, "data": {}, "message": "..." }
  ```

  Error chuẩn:

  ```json
  { "statusCode": 400, "success": false, "data": null, "message": "...", "errors": [] }
  ```

  Test phải kiểm tra method/path, Bearer header, `X-Request-Id`, request schema, response schema và status 200/202/400/401/403/404/409/422/500/504.

- [x] **Step 3: Tạo OpenAPI 3.1 source of truth và chọn codegen cụ thể**

  Khai báo đủ 7 endpoint, 4 callback event, discriminator `event`, operation-specific utility payload và alias migration. Không ghi `sourceId` trong upload 202; `sourceId` chỉ có trong `indexing_complete` callback sau khi source được tạo. Dùng `openapi-typescript` để sinh type cho SDK/backend và `openapi-zod-client` để sinh Zod request/response schema cho backend; router phải dùng schema sinh ra thay vì duy trì bản Zod Rocket.Chat thứ hai bằng tay.

- [x] **Step 4: Chuẩn hóa casing**

  Đổi backend `ApiResponse.statuscode` thành `statusCode`. SDK giữ đọc cả `statusCode` và `statuscode` trong một version để backward compatibility; response mới chỉ phát camelCase.

- [x] **Step 5: Tạo drift check có tính cơ học**

  Thêm dev dependencies `openapi-typescript`, `openapi-zod-client` và OpenAPI linter. Script `generate:contract` sinh ba file generated; `check:contract` chạy lint + generate rồi `git diff --exit-code` trên generated files, đồng thời Supertest gọi mọi operation ID để xác nhận router thực sự mount đúng method/path. Thêm `test:contract` vào cả hai package manifest và `.github/workflows/compatibility.yml`; CI phải fail nếu OpenAPI, generated TS/Zod hoặc Express router drift.

- [x] **Step 6: Chạy test**

  ```powershell
  npx.cmd vitest run tests/contract/sdk-backend-contract.test.ts
  pnpm.cmd --dir backend vitest run tests/integration/rocketchat.integration.test.ts
  node scripts/check-integration-contract.mjs
  ```

  Expected: contract test pass; utility test cũ được sửa expectation theo behavior thực, không hard-code mock text sai.

- [x] **Step 7: Chạy `detect_changes` và commit**

  Commit: `test(contract): freeze Rocket.Chat integration API`

## Task 2: Fail-closed authentication, trusted callbacks và request correlation

**Files:**
- Modify: `backend/middlewares/integrationAuth.middleware.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `backend/utils/validateEnv.ts`
- Modify: `backend/.env.example`
- Modify: `docker/docker-compose.yml`
- Modify: `src/lib/BackendClient.ts`
- Modify: `RagChatApp.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`
- Test: `tests/01_BackendClient.test.ts`
- Test: `tests/06_E2E_Full_App_Workflow.test.ts`

- [x] **Step 1: Impact gate** cho `verifyIntegrationToken`, `sendRocketChatCallback`, `BackendClient.executeHttp`, `RagChatApp.onEnable`.
- [x] **Step 2: Viết test đỏ** cho production thiếu token/trusted callback config phải làm `validateEnv()` throw trước khi `app.listen` được gọi; request thiếu/sai Bearer phải 401; development fail-open chỉ khi có flag explicit; callback origin ngoài allowlist bị reject. Readiness 503 chỉ là tín hiệu bổ sung cho dependency runtime, không thay thế startup failure.
- [x] **Step 3: Sửa auth policy**: production luôn yêu cầu `ROCKETCHAT_INTEGRATION_TOKEN` và trusted callback config; `validateEnv()` phải throw/abort trước khi HTTP listener bind. Chỉ cho unauthenticated khi `NODE_ENV !== "production"` và `ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true`. So sánh token bằng `crypto.timingSafeEqual` sau khi chuẩn hóa Buffer length.
- [x] **Step 4: Validate callback URL**: chỉ `http/https`; production phải khớp `ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS` hoặc `ROCKETCHAT_CALLBACK_BASE_URL`; reject credentials, fragment và origin lạ. Cho phép hostname container nội bộ qua allowlist explicit, không dựa vào heuristic.
- [x] **Step 5: Correlation**: SDK gửi `X-Request-Id` trên mọi request; backend dùng header ID làm canonical và kiểm tra body `requestId` nếu endpoint có body. Response và callback luôn mang cùng ID.
- [x] **Step 6: Đồng bộ cấu hình** trong `.env.example` và Compose; thêm startup log không lộ secret.
- [x] **Step 7: Test, `detect_changes`, commit**: `fix(security): close Rocket.Chat integration auth and callback gaps`.

## Task 3: Tạo scope policy dùng chung và migration dữ liệu

**Files:**
- Create: `backend/utils/rocketchatScope.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_rocketchat_scope/migration.sql`
- Create: `backend/scripts/backfillRocketChatScope.ts`
- Modify: `backend/utils/rocketchatIdentity.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `backend/tests/rocketchatScope.test.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Impact gate** cho Prisma models `Chat`, `ChatSource`, `UsageEvents`, `getOrCreateRocketChatChat`, `getStats`, `listSources`, `deleteSource`, `submitFeedback`.
- [x] **Step 2: Viết isolation/concurrency tests đỏ** với 2 workspace × 2 room × 2 thread. Mỗi request chỉ được thấy source/usage/message thuộc scope hợp lệ; room request có thread phải thấy source room-level (`threadId=null`) cộng source đúng thread, không thấy thread khác. Thêm case upload cùng filename ở hai thread, chọn "keep both versions", và hai worker đồng thời get-or-create cùng user/scope chỉ tạo một chat.
- [x] **Step 3: Thêm scope columns, reconcile duplicate và khóa duy nhất concurrency-safe cho `Chat`**: thêm nullable columns trước, backfill scope key canonical từ `userId + workspaceId + roomId + (threadId || "")`, nhưng chưa tạo unique constraint. Với duplicate legacy key, chọn row cũ nhất làm canonical; relink toàn bộ `ChatMessage`, `UsageEvents`, `AuditEvent`, `IngestionRun` và join `ChatToChatSource` sang canonical bằng transaction, merge trạng thái an toàn, rồi soft-delete/xóa duplicate. Chạy query chứng minh không còn duplicate, sau đó mới add `rocketchatScopeKey String? @unique`; `getOrCreate` dùng `upsert` theo key. Row không parse được phải log/export riêng và giữ key null, không tự gán nhầm tenant.
- [x] **Step 4: Sửa identity của `ChatSource` và backfill legacy rows**: parse `rocketchat://` legacy để điền workspace/room; thread chỉ backfill khi có dữ liệu đáng tin, còn lại `null` (room-level). URL mới phải chứa scope + source UUID + encoded filename, ví dụ `rocketchat://<workspace>/<room>/<thread-or-_room>/<sourceId>/<filename>`, nên cùng filename/keep-both không collision. Bỏ `@@unique([documentationUrl, isVectorLess])`; nếu web ingestion còn cần dedupe, thêm `dedupeKey String? @unique` chỉ được set cho web source, không dùng filename làm identity Rocket.Chat.
- [x] **Step 5: Tạo `RocketChatScope`** và helper tạo Prisma where clause duy nhất. Không tự default workspace ngoài boundary parser; bên trong domain luôn có workspace chuẩn hóa.
- [x] **Step 6: Áp dụng policy** cho stats, source list/delete, feedback ownership, RAG retrieval và search. `mode=global` chỉ cho phép khi một cấu hình admin explicit bật; SDK tiếp tục dùng `mode=room`.
- [x] **Step 7: Pagination**: `/sources` trả `sources`, `nextCursor`, `hasMore`; SDK hiện vẫn dùng `sources`. Duplicate detection phải gọi theo filename hoặc paginate thay vì chỉ kiểm tra 50 bản ghi đầu.
- [x] **Step 8: Cập nhật contract pagination và migration test**: sửa OpenAPI, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`; test DB snapshot gồm duplicate Chat key, legacy URL, duplicate filenames và row không parse được; chạy reconcile/backfill idempotent, uniqueness/concurrency test, rollback rehearsal, `detect_changes`, commit: `feat(scope): enforce Rocket.Chat workspace room and thread isolation`.

## Task 4: Truyền đầy đủ SDK settings mà không phá public call signature

**Files:**
- Create: `src/utils/BackendRuntimeSettings.ts`
- Modify: `src/lib/BackendTypes.ts`
- Modify: `src/lib/BackendClient.ts`
- Modify: `backend/utils/validationSchemas.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `backend/utils/ragUtilities.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_source_embedding_metadata/migration.sql`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `tests/01_BackendClient.test.ts`
- Test: `tests/04_E2E_Commands_And_Handlers.test.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Cảnh báo CRITICAL và impact gate** cho `BackendClient` cùng từng method bị sửa.
- [x] **Step 2: Viết test đỏ** chứng minh `model`, `embeddingModel`, `temperature`, `workspaceId` được lấy từ app settings và xuất hiện đúng trong ask/upload/utility request.
- [x] **Step 3: Tạo settings reader tập trung** với default duy nhất; loại bỏ các block đọc `workspace-id` lặp lại ở command/handler khi có thể.
- [x] **Step 4: Không dịch chuyển 9 positional args của `askAsync`**. Client tự bổ sung runtime settings vào payload; nếu cần mở rộng thì chỉ thêm object `options?` ở cuối và giữ overload cũ.
- [x] **Step 5: Backend validate allowlist/range**: model hợp lệ, temperature 0–2, embedding model được hỗ trợ. Không tin trực tiếp model arbitrary từ client.
- [x] **Step 6: Lưu embedding identity theo source/collection**: thêm `embeddingModel` và `embeddingDimensions` vào `ChatSource`, backfill collection cũ bằng model/dimension đang deploy (mặc định small/1536 nhưng phải cấu hình xác nhận). Không coi vector của hai model khác nhau là cùng vector space, kể cả cùng dimension. Collection mới bất biến model/dimension sau khi đã index.
- [x] **Step 7: Regenerate contract và test**: sửa OpenAPI payload, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`, package SDK, migration test, `detect_changes`, commit: `feat(config): honor Rocket.Chat model and embedding settings`.

## Task 5: Thay `setImmediate` bằng durable integration jobs

**Files:**
- Create: `backend/utils/rocketchatQueue.ts`
- Create: `backend/workers/rocketchatIntegrationWorker.ts`
- Create: `backend/services/rocketchatChat.service.ts`
- Create: `backend/services/rocketchatIngestion.service.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `backend/index.ts`
- Modify: `backend/package.json`
- Modify: `backend/Dockerfile`
- Modify: `docker/docker-compose.yml`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_rocketchat_integration_jobs/migration.sql`
- Test: `backend/tests/rocketchatQueue.test.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [ ] **Step 1: Impact gate** cho `handleAsyncMessage`, `handleBase64Source`, queue shutdown và Docker worker entrypoint.
- [ ] **Step 2: Viết test đỏ**: 202 chỉ sau khi job đã persist/enqueue; duplicate `(workspaceId, requestId, type)` không enqueue lần hai; process controller restart không mất job; retry không tạo duplicate DB message/source.
- [ ] **Step 3: Thêm model `RocketChatIntegrationJob`** gồm `id`, `type`, scope, `requestId`, `status`, payload JSON, attempt, error, timestamps và unique composite.
- [ ] **Step 4: Controller mỏng**: validate → create/find job idempotent → `queue.add` với deterministic job ID → trả 202 trong budget. Không gọi LLM/Qdrant/Prisma heavy work sau response.
- [ ] **Step 5: Worker riêng** xử lý `chat` và `ingestion`, concurrency/env riêng, exponential backoff + jitter, dead-letter status và graceful shutdown.
- [ ] **Step 6: Tách service thuần** để unit test không cần HTTP server. Lỗi LLM phải throw và tạo `chat_failed`, không phát `chat_completed` với apology text.
- [ ] **Step 7: Compose** chạy worker mới; readiness backend kiểm tra Redis queue; worker health/metrics riêng.
- [ ] **Step 8: Test restart/retry, `detect_changes`, commit**: `feat(queue): make Rocket.Chat async jobs durable and idempotent`.

## Task 6: Parse đúng toàn bộ định dạng file SDK hỗ trợ

**Files:**
- Create: `backend/services/documentParser.ts`
- Create: `backend/utils/uploadPolicy.ts`
- Modify: `backend/services/rocketchatIngestion.service.ts`
- Modify: `backend/utils/validationSchemas.ts`
- Modify: `backend/app.ts`
- Modify: `backend/package.json`
- Modify: `src/handlers/FileUploadHandler.ts`
- Modify: `src/lib/BackendTypes.ts`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `backend/tests/documentParser.test.ts`
- Test fixtures: `backend/tests/fixtures/uploads/*`
- Test: `tests/04_E2E_Commands_And_Handlers.test.ts`

- [x] **Step 1: Impact gate** cho `FileUploadHandler.executePreFileUpload`, `handleBase64Source`/ingestion service và `splitDocumentationContent`.
- [x] **Step 2: Tạo fixtures thực** cho `.txt`, `.md`, `.csv`, `.html`, `.pdf`, `.docx`, `.pptx`, `.xlsx`; test parser phải tìm thấy câu sentinel trong output, không chỉ kiểm tra số chunk.
- [x] **Step 3: Implement parser dispatch** theo magic bytes + extension + content type. Text/Markdown/CSV decode UTF-8 có BOM; HTML dùng Cheerio; PDF dùng parser PDF; DOCX dùng Mammoth; XLSX đọc cell text; PPTX đọc slide XML qua ZIP parser.
- [x] **Step 4: Upload policy nhất quán**: default max raw file 7 MiB, base64 strict validation, filename sanitize, MIME/extension allowlist, empty/encrypted/corrupt file trả callback `indexing_failed` với error code ổn định.
- [x] **Step 5: SDK preflight** từ chối file quá giới hạn trước khi base64; backend giữ enforcement authoritative. Đảm bảo `JSON_BODY_LIMIT` đủ cho base64 overhead và không được cấu hình thấp hơn contract.
- [x] **Step 6: Tạo source sau khi parse tối thiểu thành công** hoặc đánh dấu job/source FAILED rõ ràng; nếu Qdrant create/upsert lỗi phải cleanup collection/source partial.
- [x] **Step 7: Regenerate contract và test**: đưa MIME/extension/size/error-code constraints vào OpenAPI, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`, parser fixtures, `detect_changes`, commit: `feat(ingestion): parse every SDK-supported document format`.

## Task 7: Semantic search thật và RAG retrieval dùng chung scope

**Files:**
- Create: `backend/services/scopedVectorSearch.ts`
- Modify: `backend/services/rocketchatChat.service.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `backend/utils/rocketchatIdentity.ts`
- Modify: `src/lib/BackendTypes.ts`
- Modify: `src/lib/BackendClient.ts`
- Modify: `src/commands/SearchCommand.ts`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `backend/tests/scopedVectorSearch.test.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`
- Test: `tests/04_E2E_Commands_And_Handlers.test.ts`

- [ ] **Step 1: Cảnh báo CRITICAL và impact gate** cho retrieval hiện tại, `handleUtilityCompletion`, `getOrCreateRocketChatChat`, `BackendClient.search` và `SearchCommand.executor`.
- [ ] **Step 2: Viết test đỏ**: query semantically gần nhưng không trùng heading vẫn có kết quả; source khác room/workspace/thread tuyệt đối không xuất hiện; topK áp dụng sau khi merge tất cả collection. Test SDK phải assert request body chứa chính xác `workspaceId`, `roomId`, `threadId`.
- [ ] **Step 3: Mở rộng search tương thích ngược**: giữ 5 positional args hiện tại và thêm arg thứ 6 `options?: { workspaceId?: string; threadId?: string }`; nếu workspace thiếu thì client đọc app setting. `SearchCommand` truyền `context.getThreadId()` qua options. Backend types/OpenAPI/Zod thêm `threadId`; không đổi ý nghĩa `_userId` trong cùng commit.
- [ ] **Step 4: Tạo service dùng chung**: lấy source IDs theo `RocketChatScope`, group collection theo cặp `(embeddingModel, embeddingDimensions)`, embed query đúng một lần cho mỗi nhóm model/dimension, chỉ query collection cùng vector space, rồi normalize score trong từng model group, merge/sort/dedupe có calibration được test, trả `title`, `snippet`, `pageUrl`, `relevance`, `metadata`. Không query một embedding qua collection của model khác.
- [ ] **Step 5: Dùng cùng service** cho `/search` và async RAG answer để tránh hai logic retrieval lệch nhau.
- [ ] **Step 6: Fallback rõ ràng**: nếu Qdrant tạm lỗi, trả 503/`chat_failed` hoặc keyword fallback có cờ `retrievalMode`; không âm thầm trả `[]`.
- [ ] **Step 7: Benchmark** p95 search < 5s với số collection mục tiêu; test relevance range 0–1 đúng với `Formatter`.
- [ ] **Step 8: Regenerate contract và test**: sửa OpenAPI cho search scope/thread, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`, semantic/mixed-model tests, `detect_changes`, commit: `feat(search): add scoped semantic retrieval for SDK search and RAG`.

## Task 8: Sửa stats, feedback và delete theo contract/integrity

**Files:**
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Create: `backend/services/rocketchatStats.service.ts`
- Create: `backend/services/rocketchatFeedback.service.ts`
- Create: `backend/services/qdrantCleanupOutbox.service.ts`
- Create: `backend/workers/qdrantCleanupWorker.ts`
- Modify: `backend/utils/rocketchatQueue.ts`
- Modify: `backend/index.ts`
- Modify: `backend/app.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_qdrant_cleanup_outbox/migration.sql`
- Modify: `docker/docker-compose.yml`
- Modify: `src/lib/BackendTypes.ts`
- Modify: `src/lib/BackendClient.ts`
- Modify: `src/handlers/BlockActionHandler.ts`
- Modify: `src/handlers/ViewSubmitHandler.ts`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`
- Test: `tests/01_BackendClient.test.ts`

- [ ] **Step 1: Impact gate** cho `getStats`, `submitFeedback`, `deleteSource`, `listDocuments`, `submitFeedback`, `deleteSource` phía SDK.
- [ ] **Step 2: Stats tests đỏ** với hai tenant; document count, chunk count và token usage phải chỉ thuộc scope request.
- [ ] **Step 3: Định nghĩa và test actor policy**: feedback cho phép bất kỳ actor được SDK xác nhận đang tương tác trong cùng workspace/room, kể cả khác người hỏi, nhưng message khác scope trả 403; lưu `rocketUserId` actor riêng. Delete mặc định chỉ uploader; actor khác trong cùng room trả 403 trừ khi SDK gửi capability `canManageSources=true` được suy ra từ role/moderator context. Thêm `actorRocketUserId` và capability vào delete contract bằng options/query append-only; shared integration token xác thực app là bên assertion. Test same-room cross-user cho cả deny và moderator allow.
- [ ] **Step 4: Delete dùng durable cleanup outbox**: trong một DB transaction xác minh scope/actor, đánh dấu source deleted và ghi `QdrantCleanupOutbox` unique khi collection không còn source live. Worker cleanup riêng retry Qdrant với backoff, idempotent delete, trạng thái pending/success/dead; restart không mất cleanup. HTTP response nói DB deletion accepted và cleanup status, không tuyên bố `vectorsRemoved=true` trước khi outbox success.
- [ ] **Step 5: Chuẩn hóa response data và request logging**: cập nhật SDK types, giữ boolean return public để tránh breaking change nhưng log structured result. Đổi middleware trong `backend/app.ts` từ `req.originalUrl` sang route template + allowlisted query-key names; tuyệt đối không log raw `actorRocketUserId`, token, callback URL hoặc query value.
- [ ] **Step 6: Regenerate contract và test**: sửa OpenAPI cho actor fields và delete cleanup response, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`, outbox restart/dead-letter tests, `detect_changes`, commit: `fix(integration): scope stats feedback and source deletion`.

## Task 9: Callback contract, persistence idempotency và delivery retry

**Files:**
- Create: `src/types/CallbackEvents.ts`
- Create: `src/persistence/callbackReceiptStore.ts`
- Modify: `src/persistence/sessionStore.ts`
- Modify: `src/api/CallbackEndpoint.ts`
- Modify: `src/lib/BackendClient.ts`
- Modify: `src/commands/AskCommand.ts`
- Modify: `src/handlers/MentionHandler.ts`
- Modify: `src/handlers/BotMessageHandler.ts`
- Modify: `src/handlers/BlockActionHandler.ts`
- Modify: `src/handlers/FileUploadHandler.ts`
- Modify: `src/handlers/ActionButtonHandler.ts`
- Modify: `src/lib/BackendTypes.ts`
- Create: `backend/services/rocketchatCallback.service.ts`
- Create: `backend/services/rocketchatCallbackOutbox.service.ts`
- Create: `backend/scripts/replayRocketChatCallbacks.ts`
- Modify: `backend/workers/rocketchatIntegrationWorker.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_rocketchat_callback_outbox/migration.sql`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `tests/01_BackendClient.test.ts`
- Test: `tests/04_E2E_Commands_And_Handlers.test.ts`
- Test: `tests/05_E2E_UIKit_And_Persistence.test.ts`
- Test: `tests/06_E2E_Full_App_Workflow.test.ts`
- Test: `backend/tests/rocketchatCallback.test.ts`

- [ ] **Step 1: Impact gate** cho `CallbackEndpoint.post`, `authorize`, `sendRocketChatCallback` và session/message persistence helpers.
- [ ] **Step 2: Viết typed discriminated union** cho `chat_completed`, `chat_failed`, `indexing_complete`, `indexing_failed`; validate required fields theo event trước khi đọc user/room.
- [ ] **Step 3: Loại crash window bằng side effects idempotent + checkpoint**: receipt key theo `jobId` (fallback `requestId`) và state `PENDING/CLAIMED/COMPLETED/FAILED` với per-effect checkpoints. `BackendClient.askAsync` và mọi ask callsite phải tạo `placeholderId` trước; nếu không tạo được placeholder hoặc enqueue trả lỗi thì gửi/update lỗi đồng bộ và không để một message pending vô chủ. Upload/index action cũng tạo indexing placeholder trước khi enqueue, truyền `placeholderId`, và update lỗi đồng bộ nếu enqueue thất bại. Callback chỉ update đúng placeholder (idempotent), không send message mới. Session entries mang `turnId=requestId` và `SessionStore.addMessagesOnce(turnId, ...)` kiểm tra persistence trước khi append. Claim/checkpoint được persist trước/sau mỗi effect để retry tiếp tục an toàn. Terminal event đầu tiên thắng; event cùng loại lặp trả 200, event đối nghịch sau terminal trả 409/audit và không mutate. Legacy callback không có placeholder dùng at-most-once fallback sau khi persist CLAIMED và được ghi telemetry, không hứa exactly-once.
- [ ] **Step 4: Tách xử lý business khỏi callback delivery bằng outbox**: integration worker hoàn tất RAG/ingestion đúng một lần, trong transaction ghi terminal result + một `RocketChatCallbackOutbox` unique theo job. Worker/queue delivery riêng chỉ đọc outbox và POST callback; retry timeout/408/429/5xx, không retry 400/401/403. Retry delivery không được gọi lại LLM, parser, Qdrant hoặc tạo DB message/source.
- [ ] **Step 4a: Không làm mất callback khi lỗi kéo dài**: sau khi hết retry hoặc gặp 401/403, giữ bản ghi outbox ở `BLOCKED/DEAD` cùng payload tối thiểu cần thiết, attempt/error metadata và audit; không xóa payload terminal. Thêm `replayRocketChatCallbacks.ts --job-id <id>` và `--all-blocked` để operator requeue riêng delivery sau khi sửa token/network. Replay phải tiếp tục từ outbox, không chạy lại RAG/LLM/parser/Qdrant hay tạo source/message mới. Test chuỗi fail → sửa cấu hình → replay → cùng placeholder và session turn chỉ được hoàn tất một lần.
- [ ] **Step 5: Bổ sung callback fields ổn định**: `job_id`, `request_id`, `source_id` cho indexing success, `error_code` cho failure, model và citations cho chat success.
- [ ] **Step 6: Test enqueue thất bại trước khi tạo job, duplicate cùng event, completed-then-failed, failed-then-completed, out-of-order, delivery retry, worker/app restart, token mismatch, missing user/room và manual replay sau recovery; assert placeholder được giải quyết và business side effects vẫn đúng một lần**.
- [ ] **Step 7: Regenerate contract và test**: sửa OpenAPI cho upload placeholder/callback fields, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`; crash-injection test tại mọi checkpoint (trước/sau message update, trước/sau session append, trước/sau terminal receipt), `detect_changes`, commit: `fix(callback): make SDK callbacks typed durable and idempotent`.

## Task 10: Timeout, retry và error semantics phía SDK

**Files:**
- Modify: `src/lib/BackendClient.ts`
- Modify: `src/constants/Errors.ts`
- Modify: `backend/services/rocketchatChat.service.ts`
- Modify: `backend/controllers/rocketchatIntegration.controller.ts`
- Modify: `contracts/rocketchat-integration.openapi.yaml`
- Regenerate: `src/lib/generated/IntegrationApi.ts`
- Regenerate: `backend/types/generated/IntegrationApi.ts`
- Regenerate: `backend/utils/generated/rocketchatSchemas.ts`
- Test: `tests/01_BackendClient.test.ts`
- Test: `tests/03_Observability.test.ts`
- Test: `backend/tests/integration/rocketchat.integration.test.ts`

- [x] **Step 1: Cảnh báo CRITICAL và impact gate** cho `BackendClient.executeHttp`, `assertSuccess`, các method timeout.
- [x] **Step 2: Định nghĩa budget**: enqueue/search 5s, utility 8s, list/delete/feedback 8s; không dùng default 60s trên interactive path. Backend utility LLM phải abort sớm hơn SDK timeout và trả 504 chuẩn.
- [x] **Step 3: Chỉ retry GET/idempotent request** hoặc POST có `requestId` + idempotency backend; exponential backoff phải còn nằm trong Apps-Engine budget.
- [x] **Step 4: Parse error typed** gồm `statusCode`, `errorCode`, `requestId`, retryable; UI vẫn hiển thị message an toàn, log giữ correlation nhưng không lộ token/body.
- [x] **Step 5: Test timeout, malformed JSON, body-only response, 429, 500, duplicate 202 và callback absence**.
- [x] **Step 6: Regenerate contract và test**: đưa `errorCode`, `requestId`, retryable status và timeout responses vào OpenAPI, regenerate toàn bộ TS/Zod outputs, chạy `check:contract`, package SDK, `detect_changes`, commit: `fix(sdk): enforce Apps-Engine HTTP budgets and typed errors`.

## Task 11: Sửa test architecture và tạo compatibility matrix tự động

**Files:**
- Create: `tsconfig.sdk.json`
- Create: `tsconfig.tests.json`
- Modify: `tsconfig.json`
- Modify: `tests/mocks/MockHttp.ts`
- Modify: `tests/mocks/MockRead.ts`
- Modify: `tests/mocks/MockModify.ts`
- Modify: `tests/mocks/MockPersistence.ts`
- Modify: `tests/mocks/TestAppHarness.ts`
- Modify: `tests/server/RealBackendHarness.ts`
- Create: `tests/contract/compatibility-matrix.test.ts`
- Modify: `package.json`
- Modify: `backend/package.json`

- [x] **Step 1: Impact gate** cho shared test harness exports và test scripts.
- [x] **Step 2: Tách typecheck**: SDK production source compile độc lập khỏi backend; test tsconfig dùng Node types; backend luôn dùng `backend/tsconfig.json`. Không che lỗi bằng `skipLibCheck`/exclude bừa.
- [x] **Step 3: Cập nhật Apps-Engine mocks 1.44**: đầy đủ method bắt buộc, `IHttpResponse.url/method`, đúng RequestMethod enum và type-only imports.
- [x] **Step 4: Test harness không tự start real backend** khi infra chưa sẵn sàng. Dùng explicit project/tag `integration:docker`; health preflight fail nhanh với thông báo actionable thay vì timeout 30s và log Redis lặp.
- [x] **Step 5: Compatibility matrix data-driven** chạy cho cả 7 endpoint × auth cases × success/error envelope × scope cases × callback events.
- [x] **Step 6: Thêm CI commands**:

  ```powershell
  npm.cmd run typecheck:sdk
  npm.cmd run test:unit
  npm.cmd run test:contract
  pnpm.cmd --dir backend run typecheck
  pnpm.cmd --dir backend vitest run
  npm.cmd run package:sdk
  ```

- [x] **Step 7: `detect_changes`, commit**: `test: establish SDK backend compatibility gates`.

## Task 12: Full-stack verification, rollout và tài liệu vận hành

**Files:**
- Modify: `docker/docker-compose.yml`
- Create: `docker/docker-compose.compat.yml`
- Create: `tests/compat/run-compatibility.ps1`
- Modify: `README.md`
- Modify: `docs/api/rocketchat-integration-contract.md`
- Create: `docs/runbooks/rocketchat-integration.md`

- [ ] **Step 1: Dựng clean stack** PostgreSQL/Redis/Qdrant/backend/worker/Rocket.Chat bằng volume test riêng; chạy migration từ zero.
- [ ] **Step 2: Dùng fake OpenAI-compatible server** để response deterministic và không phụ thuộc network/API key trong CI.
- [ ] **Step 3: Chạy smoke matrix thực**: auth, ask 202→callback, DM/mention, summarize/explain/translate, scoped semantic search, upload đủ 8 định dạng, list/stats, feedback, delete, duplicate request, worker restart giữa 202 và callback.
- [ ] **Step 4: Kiểm tra cô lập** bằng hai workspace và room; truy vấn sentinel của tenant A từ tenant B phải không có kết quả ở search, RAG, stats, list, feedback và delete.
- [ ] **Step 5: Kiểm tra SLO**: enqueue p95 < 1s, search p95 < 5s, utility hoàn tất hoặc 504 < 8s, callback delivery success/retry observable. Dead-letter do lỗi business phải phát `*_failed`; callback delivery `BLOCKED/DEAD` do token/network phải có alert, giữ outbox và được replay sau recovery để giải quyết placeholder.
- [ ] **Step 6: Package/deploy SDK vào Rocket.Chat test**, xác minh callback public path từ `app.json` ID, Bearer token hai chiều và networking permission.
- [ ] **Step 7: Rollout canary** một workspace; theo dõi queue depth, job failure, callback latency, 401/403, Qdrant errors và scope-denied logs. Rollback app/backend độc lập nhờ SDK đọc alias envelope cũ.
- [ ] **Step 8: Cập nhật runbook**: cấu hình token/callback allowlist/body limit/model, rotate token, drain queue, replay business job chỉ khi business chưa đạt terminal state, replay riêng callback delivery `BLOCKED/DEAD` từ outbox sau khi sửa token/network, cleanup partial collection, backup/rollback migration.
- [ ] **Step 9: Final gates**:

  ```powershell
  node .gitnexus/run.cjs analyze
  node .gitnexus/run.cjs detect-changes --scope compare --base-ref main -r RAGChat
  npm.cmd run test:contract
  npm.cmd run test:unit
  pnpm.cmd --dir backend run test:ci
  npm.cmd run package:sdk
  docker compose -f docker/docker-compose.compat.yml up --build --abort-on-container-exit
  ```

  Expected: tất cả pass; không có HIGH/CRITICAL impact chưa được review; compatibility matrix xanh 100%.

- [ ] **Step 10: Commit docs/rollout**: `docs: publish Rocket.Chat integration compatibility runbook`.

---

## 6. Acceptance criteria bắt buộc

- Cả SDK và backend tuân theo cùng OpenAPI contract; CI phát hiện drift path, method, field, casing và callback event.
- Không endpoint nào trả source/message/usage ngoài workspace/room/thread của request.
- Tất cả định dạng SDK quảng bá đều được parse bằng fixture thật; định dạng không hỗ trợ bị từ chối trước khi enqueue.
- Sau HTTP 202, job không mất khi backend/worker restart; duplicate request không tạo duplicate message/source/session history. Với request contract mới có placeholder/turn ID, crash tại mọi callback checkpoint vẫn cho hiệu ứng quan sát được đúng một lần; callback legacy không placeholder được ghi rõ là at-most-once.
- Search là semantic retrieval trên Qdrant và dùng cùng scope/retrieval pipeline với RAG answer.
- Model, temperature, embedding model trong SDK settings có hiệu lực hoặc bị reject rõ ràng nếu không được backend hỗ trợ.
- Production không thể khởi động integration API trong trạng thái thiếu token; callback chỉ gửi tới trusted origin.
- SDK handler không chờ quá Apps-Engine budget; enqueue failure được update lỗi đồng bộ. Với job đã nhận HTTP 202, placeholder được giải quyết ngay khi callback channel reachable; callback `BLOCKED/DEAD` giữ nguyên terminal payload trong outbox và có thể replay sau khi khôi phục token/network, không chạy lại business logic.
- Backend typecheck, SDK production typecheck, unit tests, contract tests, worker tests, package SDK và full-stack compatibility tests đều pass từ clean checkout.

## 7. Thứ tự triển khai khuyến nghị

1. Task 1–3: khóa contract, security và scope trước.
2. Task 4: settings propagation, vẫn giữ API tương thích.
3. Task 5–7: durable queue, parser và semantic retrieval.
4. Task 8–10: integrity, callback và timeout/error semantics.
5. Task 11–12: hoàn thiện test architecture, full-stack verification và rollout.

Không triển khai song song Task 3, 5 và 8 trên cùng Prisma/controller files. Task 6 và Task 7 có thể làm song song sau khi Task 3/5 đã merge; Task 9 có thể bắt đầu sau contract Task 1 và job model Task 5 ổn định.
