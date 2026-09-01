  Dưới đây là bản kế hoạch chi tiết (Isolated Testing Plan) giúp bạn kiểm thử độc lập (cô lập) cả 2 service ragchat-backend và ragchat-rocketchat (Rocket.Chat Apps-
  Engine App) nhằm xác minh tính chính xác của toàn bộ logic nghiệp vụ mà không cần phụ thuộc chéo hoặc dựng toàn bộ hệ sinh thái phức tạp.
  ──────
  ### 1. Kiến Trúc & Luồng Tương Tác Giữa 2 Service

    +-------------------------------------------------------------------------+
    |                SERVICE 2: ragchat-rocketchat (App Engine)               |
    |                                                                         |
    |  [Slash Commands]   [File Upload]   [Bot DM / @Mention]   [UI Action]   |
    |         │                 │                  │                 │        |
    |         ▼                 ▼                  ▼                 ▼        |
    |  +───────────────────────────────────────────────────────────────────+  |
    |  |             BackendClient (HTTP Client + Bearer Auth)             |  |
    |  +─────────────────────────────────┬─────────────────────────────────+  |
    |                                    │ REST API (Bearer Token)            |
    |                                    ▼                                    |
    |  +───────────────────────────────────────────────────────────────────+  |
    |  |     CallbackEndpoint (/api/apps/public/<appId>/callback)          |  |
    |  |     (Cập nhật Placeholder Message, Render Citations, UI Blocks)   |  |
    |  +─────────────────────────────────▲─────────────────────────────────+  |
    +────────────────────────────────────┼────────────────────────────────────+
                                         │ Webhook Callback
    +────────────────────────────────────┼────────────────────────────────────+
    |                                    │                                    |
    |                SERVICE 1: ragchat-backend (Express + RAG)               |
    |                                                                         |
    |  +─────────────────────────────────┴─────────────────────────────────+  |
    |  |  Integration Router (/api/v1/integrations/rocketchat/*)           |  |
    |  |  (Auth Middleware, Zod Validation, Identity Mapping rc_<ws>_<usr>)|  |
    |  +──────────────────┬───────────────────────────────┬────────────────+  |
    |                     ▼                               ▼                   |
    |        [BullMQ Queue / Worker]             [Qdrant / Postgres]          |
    |  (RAG Retrieval -> LLM -> Webhook)     (Chunking, Embedding, Search)    |
    +-------------------------------------------------------------------------+
  ──────
  ### 2. Kế Hoạch Test Cô Lập Service 1: ragchat-backend

  Backend hiện đã có sẵn nền tảng vitest.config.ts với 10 test suites (60 tests passed). Kế hoạch kiểm thử cô lập cho Backend sẽ bao gồm 3 tầng:

  #### Tầng 1: API Route & Controller Isolation (Supertest + Mocks)

  Kiểm thử toàn bộ endpoints trong rocketchatIntegration.route.ts với Mock DB, Mock Redis, Mock Qdrant, Mock LLM.

   Nhóm Kiểm Thử               │ Endpoint                              │ Ca Kiểm Thử Cô Lập (Test Cases)
  ─────────────────────────────┼───────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────
   Authentication & Middleware │ All /api/v1/integrations/rocketchat/* │ • Không có header Authorization → 401 Unauthorized• Token sai → 401 Unauthorized• Token hợp
                               │                                       │ lệ Bearer <token> → 200/202
   Async Question Answering    │ POST /messages/async                  │ • Payload hợp lệ → Enqueue BullMQ job, trả về 202 Accepted kèm jobId, requestId• Trùng
                               │                                       │ requestId (Idempotency) → Trả về cache/bỏ qua job trùng• Thiếu query, roomId, rocketUserId
                               │                                       │ → 400 Validation Error
   Base64 Document Ingestion   │ POST /sources/base64                  │ • Upload file Markdown/Text/PDF base64 → Chunking + Embedding + Lưu DocumentPage/ChatSource
                               │                                       │ + Index Qdrant• Dữ liệu base64 lỗi/rỗng → 400 Bad Request
   Document Management         │ GET /sourcesDELETE /sources/:id       │ • Lọc theo roomId, workspaceId• Xóa source → Xóa trong Postgres và dọn dẹp Qdrant vector
                               │                                       │ collection
   Feedback & Telemetry        │ POST /feedbackGET /stats              │ • Gửi rating (positive / negative) → Ghi vào bảng AuditEvent• Thống kê số lượng doc và
                               │                                       │ token usage theo workspace
   Fast AI Utilities           │ POST /utilities/completion            │ • Kiểm thử 4 operations: summarize, explain, translate, search

  #### Tầng 2: Worker & RAG Pipeline Isolation (chatWorker.ts)

  Kiểm thử worker xử lý job RAG và gửi Webhook trả lời mà không cần Rocket.Chat thật:

  • Job Consumption: Mock dữ liệu job trong hàng đợi Redis (query, history, roomId, callbackUrl).
  • Context Builder & Retrieval: Đảm bảo thuật toán lấy đúng top-k chunks từ Qdrant theo room scope.
  • LLM Prompt Generation: Mock OpenAI/OpenRouter API để kiểm tra prompt template và token tracking.
  • Webhook Callback Dispatcher: Sử dụng HTTP Mock Server (hoặc msw/nock) để chặn và xác thực request do hàm rocketchatIntegration.controller.ts:47 phát ra:
      • Event chat_completed: Trả về answer, sources, metrics.
      • Event chat_failed: Trả về thông báo lỗi chi tiết khi LLM / Qdrant gặp sự cố.


  #### Tầng 3: Database & Vector Store Integration Test (docker-compose.test.yml)

  Chạy container test độc lập để xác minh dữ liệu thực tế:

  • Khởi động DB test: pnpm run db:test:up (Postgres, Redis).
  • Chạy Prisma migrations: pnpm prisma migrate deploy.
  • Kiểm tra tính toàn vẹn của Identity Mapping: hàm rocketchatIdentity.ts tạo đúng rc_<workspace>_<userId>.
  ──────
  ### 3. Kế Hoạch Test Cô Lập Service 2: ragchat-rocketchat (Rocket.Chat App)

  │ Important
  │ Hiện trạng: App Rocket.Chat tại thư mục gốc có sẵn khung thư mục tests nhưng chưa cấu hình Test Runner (Vitest/Jest) và chưa có Mock Engine cho @rocket.chat/apps-
  │ engine.

  #### Tầng 1: Xây Dựng Test Harness & Mock Accessors cho Apps-Engine

  Xây dựng Mock Factory cho các interface cốt lõi của Rocket.Chat Apps-Engine:

  • IHttpMock: Mock các HTTP call gửi sang Backend (post, get, del).
  • IReadMock: Mock đọc Room, User, Settings, Environment (getEnvironmentReader, getUserReader, getRoomReader).
  • IModifyMock: Mock tạo/cập nhật tin nhắn (getMessageExtender, getMessageBuilder, getUpdater).
  • IPersistenceMock: Mock lưu trữ Session/Request history (sessionStore.ts).

  #### Tầng 2: Unit Test Cho Từng Component Trong App

    tests/
    ├── mocks/                          # Mock Accessors (IRead, IModify, IHttp, IPersistence)
    │   ├── MockHttp.ts
    │   ├── MockModify.ts
    │   └── MockRead.ts
    ├── lib/
    │   └── BackendClient.test.ts       # Test HTTP Client, Header, Error Parsing
    ├── commands/
    │   ├── AskCommand.test.ts          # Test slash /ask
    │   ├── RagCommand.test.ts          # Test /rag docs, /rag stats, /rag help
    │   └── SummarizeCommand.test.ts    # Test /summarize, /explain, /translate
    ├── handlers/
    │   ├── FileUploadHandler.test.ts   # Test intercept file -> Base64 -> Backend
    │   ├── BotMessageHandler.test.ts   # Test 1-on-1 DM message
    │   ├── MentionHandler.test.ts      # Test @bot mention trong Channel
    │   └── BlockActionHandler.test.ts  # Test Button Thumbs Up/Down & Delete Doc
    ├── api/
    │   └── CallbackEndpoint.test.ts    # Test Webhook nhận tin từ Backend Worker
    └── utils/
        ├── Formatter.test.ts           # Test format citation, markdown
        └── Validator.test.ts           # Test validation logic

  #### Chi tiết các ca test trọng tâm của Rocket.Chat App:

  1. **BackendClient.ts**:
      • Gắn đúng Authorization: Bearer <token> từ App Settings.
      • Xử lý định dạng URL (loại bỏ trailing slash, validate host).
      • Unwrap đúng chuẩn { success, data, message } từ Backend.
      • Parse lỗi chính xác khi Backend trả về 401, 400, 429, 500 hoặc Timeout.
  2. **FileUploadHandler.ts**:
      • Nhận file upload (.pdf, .md, .txt) → đọc buffer → chuyển đổi sang base64 → gọi uploadBase64().
      • Bỏ qua các file không hỗ trợ hoặc vượt quá dung lượng cho phép.
  3. **AskCommand.ts / MentionHandler.ts**:
      • Tạo tin nhắn Placeholder: "⏳ Đang tìm kiếm tài liệu và suy nghĩ..."
      • Gửi payload bất đồng bộ qua askAsync().
      • Lưu trữ trạng thái vào sessionStore.ts.
  4. **CallbackEndpoint.ts**:
      • Xác thực token webhook gửi từ backend.
      • Nhận chat_completed → Cập nhật Placeholder Message ban đầu thành nội dung câu trả lời hoàn chỉnh kèm Citations và nút Feedback (Thumbs Up / Down).
      • Nhận chat_failed → Cập nhật thông báo lỗi thân thiện cho người dùng.
  5. **BlockActionHandler.ts**:
      • Khi người dùng bấm Thumbs Up / Down → gọi submitFeedback().
      • Khi người dùng bấm Xóa tài liệu trong /rag docs → hiển thị modal xác nhận → gọi deleteSource().

  ──────
  ### 4. Kế Hoạch Test Hợp Đồng Giao Tiếp (Contract Testing Matrix)

  Để đảm bảo 2 service khi ghép nối không bị lệch Schema:

   Event / Endpoint │ Payload do App gửi đi                         │ Dữ liệu Backend mong đợi & phản hồi           │ Webhook Backend gửi ngược lại
  ──────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────
   Async Question   │ { workspaceId, rocketUserId, roomId, query,   │ Backend trả về: 202 Accepted { status:        │ Backend gửi: { event: "chat_completed",
                    │ history, callbackUrl }                        │ "accepted", jobId, requestId }                │ room_id, user_id, message, sources, request_id
                    │                                               │                                               │ }
   Upload Document  │ { workspaceId, roomId, rocketUserId,          │ Backend trả về: 202 Accepted { status:        │ Backend gửi: { event: "indexing_complete",
                    │ fileName, fileContentBase64, mimeType }       │ "accepted", sourceId, jobId }                 │ room_id, user_id, document_name, chunks_count
                    │                                               │                                               │ }
   Feedback         │ { workspaceId, roomId, rocketUserId,          │ Backend trả về: 200 OK { success: true }      │ (Không có)
                    │ messageId, rating: "positive"|"negative" }    │                                               │
   Utilities        │ { operation: "summarize", text: "..." }       │ Backend trả về: 200 OK { result: "..." }      │ (Không có)
  ──────
  ### 5. Lộ Trình Triển Khai Từng Bước (Execution Roadmap)

      ┌────────────────────────────────────────────────────────┐
      │ Phase 1: Mở rộng Test Suite cho Backend Worker         │
      │ • Viết test cô lập cho chatWorker.ts & Callback sender │
      │ • Kiểm tra độ phủ các router integration               │
      └──────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
      ┌────────────────────────────────────────────────────────┐
      │ Phase 2: Setup Test Harness cho Rocket.Chat App (Root) │
      │ • Cấu hình Vitest & Mock Objects cho Apps-Engine       │
      │ • Viết Unit Test cho BackendClient & Utilities         │
      └──────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
      ┌────────────────────────────────────────────────────────┐
      │ Phase 3: Viết Test Commands, Handlers & Webhook        │
      │ • Test Slash Commands, File Upload, UI Actions         │
      │ • Test CallbackEndpoint cập nhật placeholder message   │
      └──────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
      ┌────────────────────────────────────────────────────────┐
      │ Phase 4: Tự động hóa CI & Scripts                      │
      │ • Cập nhật Makefile: make test-all, make test-app      │
      │ • Chạy trọn vẹn CI test suite không cần live instance  │
      └────────────────────────────────────────────────────────┘
  ──────
  ### Bạn muốn bắt đầu triển khai từ phần nào trước?

  1. Khởi tạo môi trường Test & Mocks cho Rocket.Chat App (Cài đặt Vitest ở root, viết bộ Mock Accessors và test cho BackendClient, CallbackEndpoint, AskCommand).
  2. Bổ sung Test cô lập cho Backend Worker & Webhook Dispatcher (chatWorker.ts và sendRocketChatCallback).
  3. Triển khai trọn gói theo từng Phase từ Phase 1 đến Phase 4.
