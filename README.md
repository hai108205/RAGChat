# RAGChat — Hệ Thống Trợ Lý AI & Tri Thức RAG Doanh Nghiệp Cho Rocket.Chat

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rocket.Chat Apps-Engine](https://img.shields.io/badge/Apps--Engine-1.44+-CC0000.svg?logo=rocketchat&logoColor=white)](https://developer.rocket.chat)
[![Express](https://img.shields.io/badge/Express-5.x-000000.svg?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748.svg?logo=prisma&logoColor=white)](https://www.prisma.io)
[![Qdrant](https://img.shields.io/badge/Vector_DB-Qdrant_v1.13-DC2626.svg?logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Redis](https://img.shields.io/badge/Redis-7.x-DC382D.svg?logo=redis&logoColor=white)](https://redis.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![BullMQ](https://img.shields.io/badge/Queue-BullMQ-FF4500.svg)](https://bullmq.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B.svg)](LICENSE)

**RAGChat** là giải pháp trợ lý ảo thông minh ứng dụng mô hình RAG (Retrieval-Augmented Generation), được thiết kế chuyên biệt để tích hợp trực tiếp vào nền tảng **Rocket.Chat** thông qua Rocket.Chat Apps-Engine. 

Hệ thống cho phép các phòng ban, nhóm làm việc tải tài liệu trực tiếp vào kênh chat (Channel/Room), tự động bóc tách, lập chỉ mục vector ngữ nghĩa theo thời gian thực và trả lời các truy vấn của thành viên kèm theo trích dẫn nguồn (citations), điểm liên quan (relevance score) và các nút tương tác trực quan (UIKit).

---

## 📑 Mục Lục

- [1. Tính Năng Nổi Bật](#1-tính-năng-nổi-bật)
- [2. Kiến Trúc Hệ Thống (System Architecture)](#2-kiến-trúc-hệ-thống-system-architecture)
  - [2.1. Sơ đồ khối tổng thể (Topology)](#21-sơ-đồ-khối-tổng-thể-topology)
  - [2.2. Luồng xử lý Hỏi đáp RAG Bất đồng bộ (Async Query Flow)](#22-luồng-xử-lý-hỏi-đáp-rag-bất-đồng-bộ-async-query-flow)
  - [2.3. Luồng nạp & Lập chỉ mục Tài liệu (Ingestion Pipeline)](#23-luồng-nạp--lập-chỉ-mục-tài-liệu-ingestion-pipeline)
  - [2.4. Cơ chế Đa Người Thuê & Phạm vi Cách ly (Multi-tenant Scope Isolation)](#24-cơ-chế-đa-người-thuê--phạm-vi-cách-ly-multi-tenant-scope-isolation)
- [3. Cấu Trúc Thư Mục Dự Án](#3-cấu-trúc-thư-mục-dự-án)
- [4. Yêu Cầu Hệ Thống (Prerequisites)](#4-yêu-cầu-hệ-thống-prerequisites)
- [5. Hướng Dẫn Cài Đặt & Khởi Chạy](#5-hướng-dẫn-cài-đặt--khởi-chạy)
  - [5.1. Khởi chạy nhanh bằng Docker Compose (Khuyên dùng)](#51-khởi-chạy-nhanh-bằng-docker-compose-khuyên-dùng)
  - [5.2. Cấu hình Môi trường (.env)](#52-cấu-hình-môi-trường-env)
  - [5.3. Khởi chạy thủ công cho môi trường Development](#53-khởi-chạy-thủ-công-cho-môi-trường-development)
  - [5.4. Đóng gói & Triển khai App lên Rocket.Chat](#54-đóng-gói--triển-khai-app-lên-rocketchat)
- [6. Hướng Dẫn Sử Dụng Chi Tiết](#6-hướng-dẫn-sử-dụng-chi-tiết)
  - [6.1. Hỏi đáp & Tra cứu Tri thức (RAG Q&A)](#61-hỏi-đáp--tra-cứu-tri-thức-rag-qa)
  - [6.2. Nạp và Quản lý Tài liệu Knowledge Base](#62-nạp-và-quản-lý-tài-liệu-knowledge-base)
  - [6.3. Danh mục Slash Commands](#63-danh-mục-slash-commands)
  - [6.4. Nút Thao Tác Trực Tiếp Trên Tin Nhắn (Context Actions)](#64-nút-thao-tác-trực-tiếp-trên-tin-nhắn-context-actions)
  - [6.5. Lệnh Quản Trị Trực Tiếp Với Bot (@ai)](#65-lệnh-quản-trị-trực-tiếp-với-bot-ai)
- [7. Tham Chiếu API Tích Hợp (API Contract)](#7-tham-chiếu-api-tích-hợp-api-contract)
- [8. Đảm Bảo An Toàn & Vận Hành (Operations & Security)](#8-đảm-bảo-an-toàn--vận-hành-operations--security)
- [9. Kiểm Thử Hệ Thống (Testing & QA)](#9-kiểm-thử-hệ-thống-testing--qa)
- [10. Giấy Phép (License)](#10-giấy-phép-license)

---

## 1. Tính Năng Nổi Bật

- **Phân tách Tri thức Đa tầng (Multi-Tenant Room Scoping)**:
  - Tài liệu tải lên phòng nào sẽ được lập chỉ mục và bảo vệ trong phạm vi phòng chat đó (`WorkspaceId` -> `RoomId` -> `ThreadId`).
  - Tuyệt đối không rò rỉ dữ liệu chéo giữa các phòng ban hoặc giữa các Workspace khác nhau.
- **Xử lý Bất đồng bộ Bền vững (Durable Asynchronous Processing)**:
  - Vượt qua giới hạn thời gian thực thi nghiêm ngặt 10 giây của Rocket.Chat Apps-Engine (Deno runtime) bằng cơ chế Fast Enqueue (`HTTP 202 Accepted`) kết hợp hàng đợi **BullMQ** và **Redis**.
  - Trạng thái tác vụ được lưu trữ an toàn trong PostgreSQL (`RocketChatIntegrationJob`).
- **Nạp Tài liệu Đa định dạng (Real-Time Multi-Format Ingestion)**:
  - Hỗ trợ đầy đủ: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.md`, `.txt`, `.html`.
  - Tích hợp kiểm tra Magic Byte xác thực tệp thực tế, giới hạn an toàn 7 MiB và tự động phát hiện phiên bản tài liệu cũ để đề xuất dọn dẹp.
- **Phản hồi Tức thì & Cập nhật Tin nhắn (Real-Time In-place Updates)**:
  - Tạo tin nhắn giữ chỗ (placeholder `⏳ Đang xử lý...`) ngay lập tức khi người dùng đặt câu hỏi.
  - Sau khi LLM hoàn tất sinh nội dung, worker gọi Webhook Callback để cập nhật trực tiếp tin nhắn giữ chỗ kèm theo nguồn trích dẫn (`citations`), văn bản trích dẫn (`snippet`) và điểm tương đồng (`relevance score`).
- **Tương tác Nâng cao qua UIKit**:
  - Xem danh sách tài liệu phòng chat dạng thẻ tương tác trực quan (`/rag docs`).
  - Nút xóa tài liệu 1-click kèm xác nhận an toàn và tự động dọn sạch vector tương ứng trong Qdrant.
  - Thu thập phản hồi chất lượng câu trả lời bằng nút Thích 👍 / Không thích 👎 (lưu trữ phục vụ thống kê & audit).
- **Tiện ích Tác vụ Thông minh Trên Tin nhắn (Context Action Buttons)**:
  - Chuột phải hoặc bấm menu 3 chấm trên bất kỳ tin nhắn/thread nào để: Tóm tắt luồng trao đổi (*Summarize Thread*), Hỏi AI về ngữ cảnh tin nhắn (*Ask AI*), Dịch tin nhắn (*Translate Message*), hoặc Nạp nội dung tin nhắn vào kho tri thức (*Index Message*).
- **Bảo mật Doanh nghiệp Chuẩn Fail-Closed**:
  - Xác thực Bearer Token ở mức microsecond bằng hàm so sánh an toàn `crypto.timingSafeEqual`, triệt tiêu rủi ro Timing Attacks.
  - Khóa chặt callback chỉ cho phép các domain tin cậy (`ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS`).

---

## 2. Kiến Trúc Hệ Thống (System Architecture)

### 2.1. Sơ đồ khối tổng thể (Topology)

RAGChat áp dụng mô hình kiến trúc **Integration-Only**: Rocket.Chat App đảm nhiệm vai trò UI/UX Interface trong môi trường giao tiếp của người dùng, còn RAGChat Backend và Background Worker xử lý toàn bộ tác vụ tính toán nặng (parsing, embedding, vector search, LLM completion).

```
+-----------------------------------------------------------------------------------------+
|                                    ROCKET.CHAT SERVER                                   |
|                                                                                         |
|  [Channels / Groups / DMs]       [File Attachments]        [Slash Commands & Actions]   |
|   - @bot message queries          - .pdf, .docx, .xlsx...   - /ask, /rag, /summarize... |
|            |                               |                             |              |
|            +-------------------------------+-----------------------------+              |
|                                            |                                            |
|                                            v                                            |
|  +-----------------------------------------------------------------------------------+  |
|  |                       RAGChat App (Rocket.Chat Apps-Engine)                       |  |
|  |  - Handlers: BotMessageHandler, FileUploadHandler, MentionHandler, ActionButtons  |  |
|  |  - UIKit: BlockActionHandler (Feedback 👍/👎, Delete Doc), Document Modal          |  |
|  |  - Public Webhook: CallbackEndpoint (POST /api/apps/public/<app-id>/callback)    |  |
|  +-----------------------------------------+-----------------------------------------+  |
+--------------------------------------------|--------------------------------------------+
                                             | HTTPS / Bearer Token Auth
                                             | (Header: Authorization & X-Request-Id)
                                             v
+-----------------------------------------------------------------------------------------+
|                                  RAGCHAT BACKEND (Express 5)                            |
|                                                                                         |
|  - Ingress Router: /api/v1/integrations/rocketchat/*                                    |
|  - Fail-Closed Auth Middleware (crypto.timingSafeEqual)                                 |
|  - Request Validation (Zod schemas) & Correlation ID Injection                          |
|  - Fast Enqueue (HTTP 202 Accepted) -> BullMQ (Queue: rocketchat-integration-jobs)      |
|  - Liveness & Readiness: /healthz | Metrics: /metrics (Prometheus)                      |
+--------------------+-----------------------------------------------+--------------------+
                     |                                               |
                     v                                               v
          +--------------------+                          +--------------------+
          | PostgreSQL 16 (DB) |                          |   Redis 7 (Queue)  |
          |  - Scopes & Chats  |                          |  - BullMQ Queue    |
          |  - Sources Metadata|                          |  - Job Locks       |
          |  - Jobs Outbox     |                          |  - Deduplication   |
          +--------------------+                          +---------+----------+
                                                                    |
                                                                    v
+-----------------------------------------------------------------------------------------+
|                             INTEGRATION WORKER SERVICE (BullMQ)                         |
|                                                                                         |
|  - Processor: rocketchatIntegrationWorker.ts (Concurrency: 5-20)                        |
|  - Document Parsers: pdf-parse, mammoth, xlsx, jszip, cheerio                           |
|  - Text Splitter & Chunker (LangChain RecursiveCharacterTextSplitter)                   |
|  - Scoped Retrieval Engine: Tìm kiếm vector chính xác theo Workspace + Room Scope       |
|  - Webhook Dispatcher: Gửi kết quả hoàn tất về CallbackEndpoint của Rocket.Chat        |
+--------------------+-----------------------------------------------+--------------------+
                     |                                               |
                     v                                               v
          +--------------------+                          +--------------------+
          |    Qdrant v1.13    |                          |    LLM Provider    |
          | (Vector Database)  |                          | (OpenRouter/OpenAI)|
          | Collections scoped |                          | GPT-4o, Claude 3.5,|
          | per Workspace/Room |                          | Gemini 2.0 Flash   |
          +--------------------+                          +--------------------+
```

---

### 2.2. Luồng xử lý Hỏi đáp RAG Bất đồng bộ (Async Query Flow)

Nhằm đảm bảo giao diện Rocket.Chat luôn mượt mà và không bao giờ bị timeout (Rocket.Chat Deno engine giới hạn tối đa 10s), toàn bộ quá trình hỏi đáp RAG được xử lý bất đồng bộ theo trình tự sau:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant RC as Rocket.Chat UI
    participant App as RAGChat App
    participant Backend as Backend API
    participant Redis as Redis / BullMQ
    participant Worker as Integration Worker
    participant Qdrant as Qdrant Vector DB
    participant LLM as OpenRouter / LLM

    User->>RC: Gửi câu hỏi (/ask hoặc @mention)
    RC->>App: Kích hoạt Command / Message Hook
    App->>RC: Tạo tin nhắn giữ chỗ "⏳ Đang suy nghĩ và tra cứu..."
    RC-->>User: Hiển thị placeholder với ID tin nhắn
    App->>Backend: POST /messages/async (Kèm placeholderId, query, scope, callbackUrl)
    Backend->>Redis: Đẩy Job vào Queue (ID: rc-job-{ws}-{type}-{reqId})
    Backend-->>App: Trả về HTTP 202 Accepted (kèm jobId)
    
    Note over Worker,Redis: Worker nhận tác vụ từ hàng đợi
    Worker->>Worker: Tạo Embedding cho truy vấn
    Worker->>Qdrant: Tìm kiếm Vector tương đồng theo scope (WorkspaceId & RoomId)
    Qdrant-->>Worker: Trả về top chunks phù hợp nhất
    Worker->>LLM: Gửi Prompt (System Context + Top Chunks + History + Query)
    LLM-->>Worker: Trả về câu trả lời hoàn chỉnh
    
    Worker->>App: POST Webhook Callback (/callback, event: chat_completed)
    App->>RC: Cập nhật tin nhắn placeholderId thành câu trả lời thực tế kèm Citations & Nút 👍/👎
    RC-->>User: Người dùng nhìn thấy câu trả lời hoàn chỉnh được cập nhật tại chỗ!
```

---

### 2.3. Luồng nạp & Lập chỉ mục Tài liệu (Ingestion Pipeline)

Khi người dùng tải lên một tệp đính kèm vào phòng chat, quy trình bóc tách và tạo vector diễn ra hoàn toàn tự động:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant RC as Rocket.Chat Room
    participant App as FileUploadHandler
    participant Backend as Backend API
    participant Worker as Integration Worker
    participant Qdrant as Qdrant Vector DB

    User->>RC: Kéo thả tệp (.pdf, .docx, .xlsx, .md...)
    RC->>App: Kích hoạt IPreFileUpload
    App->>App: Kiểm tra định dạng hợp lệ & dung lượng (<= 7 MiB)
    App->>Backend: POST /sources/base64 (Tệp mã hóa Base64)
    Backend-->>App: Trả về HTTP 202 Accepted
    App-->>RC: Cho phép tệp hoàn tất tải lên giao diện chat
    
    Note over Worker: Worker nhận job xử lý tệp
    Worker->>Worker: Kiểm tra Magic Bytes & bóc tách văn bản thô
    Worker->>Worker: Phân mảnh văn bản (Chunking ~1000 chars, overlap 200)
    Worker->>Worker: Gọi Embedding Model tạo vector cho từng chunk
    Worker->>Qdrant: Upsert các vector vào Collection theo Scope phòng
    Worker->>Backend: Cập nhật metadata tài liệu vào PostgreSQL (ChatSource)
    Worker->>App: Gửi Webhook Callback (event: indexing_complete)
    App->>RC: Gửi thông báo: "✅ Đã nạp thành công tài liệu: [tên tệp] (x chunks)"
```

---

### 2.4. Cơ chế Đa Người Thuê & Phạm vi Cách ly (Multi-tenant Scope Isolation)

Để ngăn chặn việc rò rỉ dữ liệu giữa các phòng ban hoặc workspace, RAGChat áp dụng hệ thống định danh scope nghiêm ngặt:

- **Phạm vi Scope (`RocketChatScope`)**:
  - `workspaceId`: Định danh Rocket.Chat Workspace (mặc định: `default`).
  - `roomId`: Mã phòng chat (Channel, Private Group, hoặc DM).
  - `threadId`: Mã luồng tin nhắn (tùy chọn).
- **Khóa Định danh Duy nhất (Dedupe & Scope Keys)**:
  - Bản ghi Chat: `rocketchatScopeKey = rc:<workspaceId>:<roomId>:<threadId>`
  - Bản ghi Tài liệu (ChatSource): `dedupeKey = rc:<workspaceId>:<roomId>:<threadId>:<filename>`
  - Bản ghi Người dùng: `username = rc_<workspaceId>_<rocketUserId>`
- **Bộ lọc Vector Qdrant**: Mọi truy vấn tìm kiếm đều được gán điều kiện lọc cứng:
  ```json
  {
    "must": [
      { "key": "rocketchatWorkspaceId", "match": { "value": "default" } },
      { "key": "rocketchatRoomId", "match": { "value": "GENERAL" } }
    ]
  }
  ```

---

## 3. Cấu Trúc Thư Mục Dự Án

```
RAGChat/
├── RagChatApp.ts                   # Điểm khởi nhập chính của Rocket.Chat App (Lifecycle hooks)
├── app.json                        # Manifest khai báo App ID, quyền hạn (permissions) và sự kiện
├── Makefile                        # Bộ công cụ dòng lệnh tự động hóa (build, test, docker, logs)
│
├── src/                            # Mã nguồn Rocket.Chat App (Rocket.Chat Apps-Engine)
│   ├── api/
│   │   └── CallbackEndpoint.ts     # Webhook Endpoint nhận kết quả trả về từ Backend Worker
│   ├── commands/                   # Các Slash Commands (/ask, /rag, /search, /summarize, ...)
│   ├── constants/                  # Hằng số định danh lệnh, timeouts và thông báo lỗi
│   ├── handlers/                   # Bộ xử lý sự kiện:
│   │   ├── ActionButtonHandler.ts  # Xử lý nút thao tác chuột phải trên tin nhắn
│   │   ├── BlockActionHandler.ts   # Xử lý nút UIKit (Nút xóa tài liệu, nút đánh giá 👍/👎)
│   │   ├── BotMessageHandler.ts    # Xử lý tin nhắn 1-1 gửi trực tiếp cho Bot
│   │   ├── FileUploadHandler.ts    # Đón bắt và kiểm tra tệp đính kèm trước khi upload
│   │   ├── MentionHandler.ts       # Xử lý khi có người @bot trong kênh chat
│   │   └── ViewSubmitHandler.ts    # Xử lý tương tác Modal hộp thoại
│   ├── lib/
│   │   ├── BackendClient.ts        # Client HTTP chuẩn kết nối với Backend Express
│   │   └── BackendTypes.ts         # TypeScript Interfaces định nghĩa request/response
│   ├── persistence/                # Tầng lưu trữ bộ nhớ đệm tạm thời trên Rocket.Chat
│   ├── settings/                   # Khai báo cài đặt cấu hình App trong trang Quản trị viên
│   ├── uikit/                      # Các khối giao diện tương tác BlockBuilder
│   └── utils/                      # Tiện ích: Format markdown, Logger, Request ID, Validator
│
├── backend/                        # Mã nguồn RAG Backend (Node.js, Express, Prisma, BullMQ)
│   ├── app.ts                      # Cấu hình Express app, middlewares, CORS, Body limits
│   ├── index.ts                    # Điểm khởi động HTTP API Server (Port 8000)
│   ├── chatWorker.ts               # Worker dự phòng xử lý tác vụ chung
│   ├── workers/
│   │   └── rocketchatIntegrationWorker.ts # Worker chính xử lý RAG & Ingestion cho Rocket.Chat
│   ├── controllers/                # Controller điều hướng API tích hợp
│   ├── routers/                    # Khai báo Route API (/api/v1/integrations/rocketchat)
│   ├── middlewares/                # Middleware xác thực Bearer Token, kiểm tra Origin, Rate Limit
│   ├── prisma/
│   │   └── schema.prisma           # Định nghĩa cấu trúc Database (PostgreSQL)
│   ├── services/                   # Logic nghiệp vụ RAG, bóc tách tài liệu, tìm kiếm vector
│   ├── utils/                      # Quản lý kết nối Qdrant, Redis, BullMQ Queue, Upload Policy
│   ├── tests/                      # Bộ kiểm thử Unit test & Integration test (Vitest)
│   └── Dockerfile                  # Containerfile đóng gói Backend & Worker
│
├── docker/                         # Cấu hình Docker & Docker Compose
│   ├── docker-compose.yml          # Môi trường chạy hoàn chỉnh (Postgres, Redis, Qdrant, Rocket.Chat)
│   ├── docker-compose.compat.yml   # Môi trường kiểm thử tương thích độc lập
│   └── init/                       # Script bootstrap MongoDB ReplicaSet cho Rocket.Chat
│
├── docs/                           # Tài liệu kỹ thuật & Đặc tả hệ thống
│   ├── api/
│   │   └── rocketchat-integration-contract.md # Hợp đồng API chi tiết giữa App và Backend
│   └── runbooks/
│       └── rocketchat-integration.md          # Sổ tay hướng dẫn vận hành production, token rotation
│
└── tests/                          # Kịch bản kiểm thử E2E & Matrix tương thích
    ├── compat/run-compatibility.ps1 # Script tự động kiểm tra toàn diện hệ thống trên Windows/PowerShell
    └── contract/                   # Bộ kiểm thử đối soát hợp đồng OpenAPI
```

---

## 4. Yêu Cầu Hệ Thống (Prerequisites)

Trước khi tiến hành cài đặt, hãy đảm bảo máy chủ hoặc môi trường phát triển đáp ứng:

- **Docker & Docker Compose**: Docker Engine >= 24.0, Compose V2 >= 2.20.
- **Node.js**: Phiên bản 18.x hoặc 20.x LTS trở lên.
- **Package Manager**: `pnpm` (khuyến nghị >= 10.x cho backend) và `npm` (cho Rocket.Chat App).
- **Rocket.Chat Apps CLI**: Công cụ triển khai ứng dụng Rocket.Chat:
  ```bash
  npm install -g @rocket.chat/apps-cli
  ```
- **Tài khoản LLM**: API Key từ [OpenRouter](https://openrouter.ai) (hoặc OpenAI trực tiếp).

---

## 5. Hướng Dẫn Cài Đặt & Khởi Chạy

### 5.1. Khởi chạy nhanh bằng Docker Compose (Khuyên dùng)

Toàn bộ hệ sinh thái RAGChat (gồm Rocket.Chat, PostgreSQL, Redis, Qdrant, Backend API và Integration Worker) có thể được khởi động chỉ với 1 câu lệnh:

```bash
# 1. Sao chép tệp biến môi trường mẫu
cp backend/.env.example backend/.env

# 2. Chỉnh sửa backend/.env và điền API key OpenRouter cùng Integration Token bí mật
# (Xem chi tiết ở mục 5.2 bên dưới)

# 3. Khởi chạy toàn bộ hệ thống
make docker-up
# Hoặc: docker compose -f docker/docker-compose.yml up -d --remove-orphans
```

Sau khi khởi động thành công, các dịch vụ sẽ hoạt động tại các địa chỉ:

| Dịch vụ | Địa chỉ truy cập | Tài khoản / Ghi chú |
| :--- | :--- | :--- |
| **Rocket.Chat** | `http://localhost:3001` | Mở trình duyệt để khởi tạo tài khoản Admin lần đầu |
| **RAGChat Backend** | `http://localhost:8000` | Endpoint sức khỏe: `http://localhost:8000/healthz` |
| **Qdrant Vector DB** | `http://localhost:6333` | Bảng điều khiển Web: `http://localhost:6333/dashboard` |
| **PostgreSQL** | `localhost:5432` | User: `ragchat` \| Password: `ragchat` \| DB: `ragchat` |
| **Redis** | `localhost:6379` | Quản lý BullMQ và Cache |

Để theo dõi nhật ký hoạt động của tất cả các container:
```bash
make docker-logs
```

Để dừng toàn bộ hệ thống:
```bash
make docker-down
```

---

### 5.2. Cấu hình Môi trường (.env)

Tạo tệp `backend/.env` với các tham số quan trọng sau:

```env
# Cấu hình Cổng & Môi trường
PORT="8000"
NODE_ENV="production"
CORS_ORIGIN="http://localhost:3001"
CORS_METHODS="GET,POST,PUT,DELETE"

# Cơ sở dữ liệu PostgreSQL
DATABASE_URL="postgresql://ragchat:ragchat@postgres:5432/ragchat?schema=public"

# Redis & Hàng đợi
REDIS_HOST="redis"
REDIS_PORT=6379

# Vector Database Qdrant
QDRANT_URL="http://qdrant:6333"
QDRANT_API_KEY=""

# Bảo mật Tích hợp Rocket.Chat (BẮT BUỘC)
# Mã Token bí mật dùng chung giữa Rocket.Chat App và Backend (tối thiểu 32 ký tự hex)
ROCKETCHAT_INTEGRATION_TOKEN="9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e"

# Địa chỉ Rocket.Chat để Backend Worker gọi Webhook Callback
ROCKETCHAT_CALLBACK_BASE_URL="http://rocketchat:3000"
ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS="http://localhost:3001,http://rocketchat:3000"
ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV="false"

# Khóa API AI & Mô hình (OpenRouter)
OPENROUTER_LLM_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
OPENROUTER_EMBEDDING_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
DEFAULT_LLM_MODEL="openai/gpt-4o-mini"
DEFAULT_EMBEDDING_MODEL="openai/text-embedding-3-small"

# Điều chỉnh Worker & Giới hạn tải
ROCKETCHAT_WORKER_CONCURRENCY=5
EMBEDDING_BATCH_SIZE=500
QDRANT_BATCH_SIZE=500
```

> [!TIP]
> Bạn có thể sinh mã `ROCKETCHAT_INTEGRATION_TOKEN` bảo mật cao bằng lệnh:
> ```bash
> openssl rand -hex 32
> ```

---

### 5.3. Khởi chạy thủ công cho môi trường Development

Nếu bạn muốn chạy trực tiếp mã nguồn backend để debug và phát triển:

#### Bước 1: Khởi động các dịch vụ cơ sở hạ tầng qua Docker
```bash
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant
```

#### Bước 2: Cài đặt và chạy Backend API
```bash
cd backend
pnpm install

# Sinh mã Prisma Client và chạy migration
pnpm prisma generate
pnpm prisma migrate dev

# Khởi động Backend API ở chế độ Watch/Hot-reload
pnpm run dev
```

#### Bước 3: Khởi động Integration Worker (ở Terminal riêng biệt)
```bash
cd backend
pnpm run worker:integration
```

---

### 5.4. Đóng gói & Triển khai App lên Rocket.Chat

Khi Rocket.Chat server và Backend đã chạy, tiến hành triển khai RAGChat App vào Rocket.Chat:

#### Bước 1: Cài đặt thư viện và kiểm tra kiểu dữ liệu
Tại thư mục gốc của dự án:
```bash
# Cài đặt dependencies cho App
npm install

# Kiểm tra tính hợp lệ của TypeScript
npm run typecheck:sdk
```

#### Bước 2: Triển khai App vào Rocket.Chat
Đảm bảo bạn đã cài `rc-apps`:
```bash
# Triển khai trực tiếp lên server Rocket.Chat
rc-apps deploy --url http://localhost:3001 --username <admin_username> --password <admin_password>
```

#### Bước 3: Cấu hình App trong Quản trị Rocket.Chat
Sau khi deploy thành công, đăng nhập vào Rocket.Chat với quyền Admin:
1. Vào **Administration** (Quản trị) -> **Apps** (Ứng dụng) -> Chọn **RAGChat** -> Chuyển sang tab **Settings** (Cài đặt).
2. Điền các thông số:
   - **Backend URL**: Địa chỉ backend mà Rocket.Chat có thể kết nối tới (Ví dụ trong mạng Docker: `http://backend:8000`, hoặc chạy ngoài: `http://localhost:8000` hoặc IP máy chủ).
   - **Integration Token**: Nhập đúng chuỗi bí mật đã thiết lập trong biến `ROCKETCHAT_INTEGRATION_TOKEN` ở file `.env`.
   - **Callback Base URL**: Địa chỉ gốc của Rocket.Chat mà Backend có thể gọi ngược lại (Ví dụ: `http://rocketchat:3000` hoặc `http://localhost:3001`).
   - **LLM Model**: Chọn mô hình mặc định (ví dụ: `openai/gpt-4o-mini`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`).
   - **Embedding Model**: Chọn `openai/text-embedding-3-small`.
   - **Max Conversation History**: Số lượng tin nhắn ngữ cảnh lịch sử lưu nhớ (mặc định: `10`).
   - **Enable Citations**: Bật hiển thị nguồn trích dẫn (`true`).
3. Nhấn **Save Changes** (Lưu thay đổi). Lúc này App sẽ tự kích hoạt và sẵn sàng hoạt động!

---

## 6. Hướng Dẫn Sử Dụng Chi Tiết

### 6.1. Hỏi đáp & Tra cứu Tri thức (RAG Q&A)

Bạn có thể tương tác với RAGChat theo 3 cách linh hoạt:

#### Cách 1: Hỏi đáp trực tiếp 1-1 với Bot (Direct Message)
- Mở danh sách Direct Messages trong Rocket.Chat, tìm và chọn người dùng bot **`ragchat.bot`** (hoặc tên bot bạn đã đặt).
- Gõ câu hỏi tự nhiên bất kỳ:
  ```text
  Làm thế nào để xin nghỉ phép năm theo quy định công ty?
  ```
- Bot sẽ ngay lập tức gửi một tin nhắn giữ chỗ `⏳ Đang tìm kiếm và xử lý câu trả lời...`. Sau vài giây, tin nhắn sẽ được thay thế bằng câu trả lời chi tiết, trích xuất chính xác từ các tài liệu đã nạp trong phạm vi DM hoặc phòng bạn được cấp quyền.

#### Cách 2: Gọi Bot trong Kênh công khai hoặc Nhóm kín (@mention)
- Trong bất kỳ channel hoặc private group nào có bot tham gia, hãy `@` tên bot kèm câu hỏi:
  ```text
  @ragchat Cho tôi biết tóm tắt các tính năng chính của sản phẩm trong tài liệu mới tải lên?
  ```
- Bot sẽ đọc tài liệu trong phòng đó, phân tích và trả lời ngay trong luồng thảo luận (Thread) hoặc kênh chat.

#### Cách 3: Sử dụng lệnh `/ask`
- Trong khung chat, gõ:
  ```text
  /ask Quy trình xử lý sự cố bảo mật thông tin gồm những bước nào?
  ```

> [!NOTE]
> **Đặc điểm câu trả lời của RAGChat:**
> - Kèm theo **Trích dẫn nguồn (Sources / Citations)** hiển thị rõ tên tài liệu, số trang hoặc link tài liệu, đoạn trích dẫn ngữ cảnh (`snippet`) và độ tương đồng (`relevance score`).
> - Tích hợp 2 nút đánh giá: **Thích (👍)** và **Không thích (👎)** ở cuối câu trả lời. Khi người dùng bấm nút, phản hồi sẽ được ghi lại vào cơ sở dữ liệu để phục vụ việc tối ưu hóa chất lượng câu trả lời.

---

### 6.2. Nạp và Quản lý Tài liệu Knowledge Base

#### 1. Nạp tài liệu mới vào phòng chat
- Kéo và thả trực tiếp tệp tài liệu vào phòng chat Rocket.Chat mong muốn.
- **Định dạng hỗ trợ**: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.md`, `.txt`, `.html`.
- **Dung lượng tối đa**: **7 MiB** mỗi tệp.
- Hệ thống sẽ tự động bắt sự kiện tải lên (`IPreFileUpload`), gửi tệp sang RAGChat Backend để bóc tách văn bản, cắt đoạn và nạp vector vào Qdrant.
- Sau khi hoàn thành, bot sẽ gửi thông báo:
  ```text
  ✅ Đã nạp thành công tài liệu: Quy_che_lam_viec_2026.pdf (48 chunks được đánh chỉ mục)
  ```

#### 2. Xem danh sách tài liệu hiện có trong phòng (`/rag docs`)
- Gõ lệnh:
  ```text
  /rag docs
  ```
- Rocket.Chat sẽ hiển thị danh sách toàn bộ các tài liệu đã được nạp vào phòng chat này dưới dạng thẻ trực quan (UIKit Blocks):
  - Tên tệp tài liệu và thời điểm nạp.
  - Số lượng đoạn vector (`chunks`).
  - Nút màu đỏ **[🗑️ Xóa tài liệu]**: Bấm vào để xóa tài liệu khỏi kho tri thức phòng chat. Hệ thống sẽ tự động dọn sạch bản ghi cơ sở dữ liệu và thu hồi toàn bộ vector liên quan trong Qdrant.

#### 3. Quét dọn tài liệu rác hoặc lỗi (`/rag prune`)
- Gõ lệnh:
  ```text
  /rag prune
  ```
- Hệ thống sẽ quét toàn bộ tài liệu trong phòng chat hiện tại để phát hiện các tệp rỗng (0 chunks) hoặc bị lỗi trong quá trình xử lý, đồng thời đưa ra danh sách đề xuất để người dùng dọn dẹp chỉ với một cú nhấp chuột.

---

### 6.3. Danh mục Slash Commands

| Lệnh | Cú pháp ví dụ | Mô tả chức năng |
| :--- | :--- | :--- |
| `/ask` | `/ask Làm sao để cấu hình SSO?` | Truy vấn kho tài liệu của phòng chat và sinh câu trả lời RAG có trích dẫn. |
| `/rag docs` | `/rag docs` | Xem danh sách tài liệu tri thức trong phòng chat và quản lý xóa tài liệu. |
| `/rag prune`| `/rag prune` | Rà soát và đề xuất dọn dẹp các tài liệu rỗng hoặc lập chỉ mục thất bại. |
| `/rag help` | `/rag help` | Hiển thị hướng dẫn sử dụng các lệnh RAG. |
| `/search` | `/search chính sách làm việc từ xa` | Tìm kiếm ngữ nghĩa trực tiếp (semantic search) trả về các đoạn trích liên quan nhất. |
| `/summarize`| `/summarize <văn bản dài>` | Tóm tắt nhanh một đoạn văn bản hoặc nội dung được dán vào. |
| `/explain` | `/explain Kiến trúc Microservices` | Giải thích một khái niệm chuyên môn phức tạp một cách đơn giản, dễ hiểu. |
| `/translate`| `/translate Welcome to our team!` | Dịch nội dung văn bản sang tiếng Việt (hoặc ngôn ngữ đích). |

---

### 6.4. Nút Thao Tác Trực Tiếp Trên Tin Nhắn (Context Actions)

Khi bạn nhấp chuột phải (hoặc bấm vào biểu tượng dấu 3 chấm góc phải của bất kỳ tin nhắn nào trong Rocket.Chat), menu ngữ cảnh sẽ xuất hiện 4 hành động nhanh:

1. **Summarize Thread (Tóm tắt luồng trao đổi)**:
   - Tự động tập hợp toàn bộ các tin nhắn trong thread hiện tại, gửi về AI để tóm tắt thành các ý chính và thông báo riêng cho bạn.
2. **Ask AI (Hỏi AI dựa trên tin nhắn)**:
   - Sử dụng nội dung tin nhắn được chọn làm ngữ cảnh truy vấn và đặt câu hỏi cho RAG bot.
3. **Translate Message (Dịch tin nhắn)**:
   - Dịch tức thì nội dung tin nhắn đó sang tiếng Việt một cách riêng tư.
4. **Index Message (Lập chỉ mục tin nhắn)**:
   - Chuyển đổi nội dung của tin nhắn thành một tài liệu văn bản và nạp trực tiếp vào kho tri thức của phòng chat.

---

### 6.5. Lệnh Quản Trị Trực Tiếp Với Bot (@ai)

Khi nhắn tin riêng 1-1 với bot hoặc gõ lệnh có tiền tố `@ai` trong kênh chat:

- `@ai start`: Khởi tạo phiên làm việc và hiển thị lời chào kèm các gợi ý truy vấn nhanh.
- `@ai stats`: Thống kê tổng hợp số lượng tài liệu đã nạp trong phòng, tổng số tin nhắn và mức tiêu thụ token AI.
- `@ai clear`: Xóa ngữ cảnh bộ nhớ lịch sử hội thoại của bạn với bot trong phòng chat hiện tại.
- `@ai help`: Hiển thị bảng trợ giúp đầy đủ các chức năng.

---

## 7. Tham Chiếu API Tích Hợp (API Contract)

Toàn bộ các endpoint giao tiếp giữa Rocket.Chat App và Backend được bảo vệ bởi tiền tố `/api/v1/integrations/rocketchat` và yêu cầu header xác thực:
```http
Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN>
```

| Method | Endpoint | Mã HTTP | Chức năng |
| :--- | :--- | :--- | :--- |
| `POST` | `/messages/async` | `202 Accepted` | Đưa câu hỏi vào hàng đợi BullMQ để xử lý RAG bất đồng bộ. |
| `POST` | `/sources/base64` | `202 Accepted` | Tiếp nhận tài liệu mã hóa Base64 để đưa vào pipeline lập chỉ mục. |
| `GET` | `/sources` | `200 OK` | Lấy danh sách tài liệu tri thức đã nạp theo `workspaceId` và `roomId` (phân trang bằng cursor). |
| `DELETE`| `/sources/:id` | `200 OK` | Xóa tài liệu khỏi PostgreSQL và kích hoạt dọn dẹp vector trong Qdrant. |
| `POST` | `/feedback` | `200 OK` | Ghi nhận đánh giá của người dùng (rating: `positive` / `negative`). |
| `POST` | `/utilities/completion` | `200 OK` | Xử lý nhanh các tác vụ chuyển đổi văn bản (`summarize`, `explain`, `translate`, `search`). |
| `GET` | `/stats` | `200 OK` | Truy xuất số liệu thống kê tài liệu và lượng token đã sử dụng. |
| `GET` | `/healthz` | `200 OK` | Kiểm tra trạng thái hoạt động (Liveness/Readiness) của Backend, DB và Redis. |
| `GET` | `/metrics` | `200 OK` | Cung cấp số liệu giám sát định dạng Prometheus. |

Đặc tả chi tiết payload mẫu và schema dữ liệu có thể tham khảo tại tài liệu: [Rocket.Chat Integration Contract](docs/api/rocketchat-integration-contract.md).

---

## 8. Đảm Bảo An Toàn & Vận Hành (Operations & Security)

### 8.1. Quy trình Xoay vòng Token Không Gián Đoạn (Zero-Downtime Token Rotation)
Khi cần đổi `ROCKETCHAT_INTEGRATION_TOKEN` trên môi trường Production:
1. Tạo mã token mới bảo mật cao (`openssl rand -hex 32`).
2. Cập nhật biến môi trường trên Backend và thực hiện rolling restart backend replicas.
3. Ngay sau đó, cập nhật token mới vào phần cài đặt App trong **Rocket.Chat Admin** -> **Apps** -> **RAGChat** -> **Settings**.
4. Kiểm tra sức khỏe hệ thống qua `/healthz` và thực hiện một truy vấn test `/ask`.

### 8.2. Giám sát & Quản lý Hàng đợi (BullMQ Queue Maintenance)
- Khi bảo trì hoặc nâng cấp hệ thống, hàng đợi có thể được tạm dừng hoặc xả sạch an toàn thông qua CLI hoặc kịch bản bảo trì.
- Các tác vụ gửi callback thất bại sẽ được ghi nhận vào outbox và có thể chạy cơ chế phát lại (replay) mà không cần phải thực hiện lại toàn bộ pipeline RAG tốn kém.
- Chi tiết các kịch bản sự cố và cứu hộ dữ liệu được ghi chép đầy đủ tại: [Operations Runbook](docs/runbooks/rocketchat-integration.md).

---

## 9. Kiểm Thử Hệ Thống (Testing & QA)

Dự án bao gồm hệ thống kiểm thử tự động nhiều tầng nhằm đảm bảo độ ổn định cao nhất:

### 1. Kiểm thử Unit & Integration Backend
```bash
# Chạy toàn bộ test backend với Vitest
pnpm --dir backend run test:ci

# Chạy riêng integration test cho luồng Rocket.Chat
pnpm --dir backend run test:contract
```

### 2. Kiểm thử Rocket.Chat App (SDK & Handlers)
```bash
# Chạy bộ test unit cho client và handlers
npm run test:unit

# Kiểm tra tính tương thích của hợp đồng API (OpenAPI drift check)
npm run check:contract
```

### 3. Kiểm thử Tương thích Toàn Diện (Full-Stack Compatibility Harness)
Kịch bản PowerShell tự động dựng một môi trường Docker cô lập, khởi chạy backend, worker, mock Rocket.Chat server và tự động kiểm thử toàn bộ ma trận chức năng (Health check, Auth constant-time, Async Queue, Ingestion, Scope isolation):

```powershell
powershell -ExecutionPolicy Bypass -File tests/compat/run-compatibility.ps1
```

---

## 10. Giấy Phép (License)

Dự án được phát hành và phân phối theo các điều khoản của giấy phép mã nguồn mở **[MIT License](LICENSE)**.