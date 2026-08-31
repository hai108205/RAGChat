# Knowledge Base: RAGChat Frontend / Apps-Engine Layer (`src/`)

## 1. Overview & Architecture Role

Thư mục `D:\Work\Study\RAGChat\src\` chứa toàn bộ mã nguồn **TypeScript của Rocket.Chat App** (xây dựng dựa trên `@rocket.chat/apps-engine`).

### Vai trò kiến trúc
RAGChat áp dụng mô hình **Hybrid 2 lớp**:
1. **Frontend Adapter Layer (`src/` & `RagChatApp.ts`)**: Chạy bên trong môi trường Rocket.Chat Apps-Engine (Deno/Node runtime). Chịu trách nhiệm tương tác người dùng, xử lý slash command, bắt sự kiện tin nhắn/mention/upload tệp, quản lý lịch sử hội thoại trên Rocket.Chat Persistence, và chuyển tiếp yêu cầu sang Python Backend qua HTTP REST API.
2. **Backend RAG Service (`backend/src/`)**: Dịch vụ FastAPI độc lập chịu trách nhiệm nặng về AI: phân tích tài liệu, chunking, embedding, vector store (pgVector), hybrid search, query refinement và LLM synthesis.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Rocket.Chat Server                              │
│                                                                        │
│  [RagChatApp.ts] (App Entry Point)                                     │
│         │                                                              │
│         ├─── src/commands/    ──> Slash Commands (/ask, /search, ...)  │
│         ├─── src/handlers/    ──> DM, Mention & Upload Listeners       │
│         ├─── src/persistence/ ──> SessionStore (Compound Key Storage)  │
│         ├─── src/settings/    ──> App Settings Definition              │
│         ├─── src/api/         ──> Webhook CallbackEndpoint             │
│         └─── src/lib/         ──> BackendClient (IHttp REST wrapper)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP (JSON / Base64)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Python Backend (FastAPI - backend/src/)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Cấu trúc thư mục `src/`

```
src/
├── index.ts                      # Re-export RagChatApp
├── api/
│   ├── CallbackEndpoint.ts       # Webhook nhận thông báo async từ Backend (/api/app/callback)
│   └── CallbackEndpoint.js
├── commands/                     # Triển khai ISlashCommand của Rocket.Chat
│   ├── AskCommand.ts             # Lệnh /ask "câu hỏi"
│   ├── SearchCommand.ts          # Lệnh /search "từ khóa"
│   ├── SummarizeCommand.ts       # Lệnh /summarize "văn bản"
│   ├── ExplainCommand.ts         # Lệnh /explain "khái niệm"
│   ├── TranslateCommand.ts       # Lệnh /translate [lang] "văn bản"
│   └── *.js
├── constants/
│   ├── Commands.ts               # Danh sách tên lệnh, prefix @ai, bot sub-commands
│   ├── Errors.ts                 # Chuẩn hóa các thông báo lỗi người dùng
│   └── *.js
├── handlers/                     # Event Handlers lắng nghe sự kiện từ Rocket.Chat
│   ├── BotMessageHandler.ts      # IPostMessageSentToBot: Tin nhắn trực tiếp (DM) tới Bot
│   ├── MentionHandler.ts         # IPostMessageSent: Nhắc tên @bot / @ai trong Channel
│   ├── FileUploadHandler.ts      # IPreFileUpload: Đón tệp tải lên và đẩy sang Backend RAG
│   └── *.js
├── lib/
│   ├── BackendClient.ts          # Wrapper HTTP client gọi sang Python FastAPI Backend
│   └── BackendClient.js
├── persistence/
│   ├── sessionStore.ts           # Quản lý bộ nhớ hội thoại phân lập (User + Room + Thread)
│   └── sessionStore.js
├── settings/
│   ├── Settings.ts               # Khai báo cấu hình App (Backend URL, API Key, Model, v.v.)
│   └── Settings.js
└── utils/                        # Các helper utilities
    ├── Formatter.ts              # Format Markdown, trích dẫn tài liệu (Citations), bảng biểu
    ├── MessageHelper.ts          # Gửi tin nhắn, placeholder loader (typing feedback), cập nhật tin nhắn
    ├── SettingReader.ts          # Ép kiểu an toàn dữ liệu cấu hình
    ├── Validator.ts              # Kiểm tra URL, kiểm tra chuỗi hợp lệ, sanitize input
    ├── Logger.ts                 # Structured logger bọc ILogger với context prefix
    └── *.js
```

---

## 3. Chi tiết từng Module & Thành phần

### 3.1 `src/lib/BackendClient.ts`
* **Mục đích**: Lớp client duy nhất đóng gói tất cả các cuộc gọi HTTP REST API từ Rocket.Chat App sang Python Backend.
* **Các phương thức chính**:
  - `ask(query, userId, roomId, history?)`: Gửi `POST /api/chat`, trả về `{ answer, sources, model }`.
  - `search(query, topK, userId?, roomId?)`: Gửi `POST /api/search`, trả về danh sách `SearchResult[]`.
  - `summarize(text)`: Gửi `POST /api/summarize`, trả về chuỗi tóm tắt.
  - `explain(concept)`: Gửi `POST /api/explain`, trả về nội dung giải thích khái niệm.
  - `translate(text, targetLang)`: Gửi `POST /api/translate`, dịch sang ngôn ngữ đích.
  - `listDocuments()`: Gửi `GET /api/documents`, lấy danh sách tài liệu đã index.
  - `post(path, data)` & `get(path)`: Xử lý request, thêm header `Authorization: Bearer <api-key>` nếu có cấu hình.
* **Cơ chế an toàn**:
  - `assertSuccess(response)`: Kiểm tra mã HTTP `200 <= statusCode < 300`.
  - `asData(response)`: Ép kiểu dữ liệu an toàn, tránh lỗi runtime `TypeError` khi Backend trả về body rỗng.

---

### 3.2 `src/persistence/sessionStore.ts`
* **Mục đích**: Quản lý lịch sử hội thoại (Chat History) của người dùng trên bộ nhớ lưu trữ `IPersistence` của Rocket.Chat.
* **Đặc điểm kiến trúc nổi bật**:
  1. **Compound Key Isolation (Phân lập theo 3 chiều)**:
     - Khóa lưu trữ kết hợp: `USER` + `ROOM` + `thread:<threadId>` (nếu có) + `MISC: chat_history`.
     - Đảm bảo hội thoại trong các kênh, phòng riêng hoặc từng thread riêng biệt **hoàn toàn không bị lẫn lộn**.
  2. **In-Process Concurrency Serialization (Promise Chain Queue)**:
     - Xây dựng hàng đợi `SessionStore.chains = new Map<string, Promise<unknown>>()`.
     - Giúp tuần tự hóa quá trình Read-Modify-Write, ngăn chặn race condition khi người dùng gửi nhiều tin nhắn liên tiếp trong cùng một phiên.
  3. **Data Normalization & Auto Truncate**:
     - Cắt tỉa lịch sử theo cấu hình `max-history` (giữ lại N lượt tương tác gần nhất).
     - Loại bỏ các bản ghi không đúng định dạng `ChatMessage`.

---

### 3.3 `src/handlers/` (Bộ xử lý sự kiện)

#### A. `BotMessageHandler.ts` (`IPostMessageSentToBot`)
* Lắng nghe mọi tin nhắn người dùng chat 1-1 (Direct Message) với Bot.
* **Xử lý lệnh điều khiển `@ai <subcommand>`**:
  - `@ai start`: Gửi thông điệp chào mừng & hướng dẫn bắt đầu.
  - `@ai stats`: Lấy số lượng tài liệu & tổng số chunk đang có trong cơ sở tri thức.
  - `@ai clear`: Xóa lịch sử hội thoại của người dùng trong phiên hiện tại.
  - `@ai help`: Hiển thị danh sách các lệnh hỗ trợ.
* **Xử lý câu hỏi thông thường**:
  - Tự động hiển thị placeholder `🔍 Đang tra cứu tài liệu và suy nghĩ câu trả lời...` để phản hồi tức thì cho người dùng.
  - Gọi `BackendClient.ask()` kèm lịch sử hội thoại.
  - Cập nhật lại placeholder bằng câu trả lời hoàn chỉnh kèm thẻ trích dẫn tài liệu (Citations).

#### B. `MentionHandler.ts` (`IPostMessageSent`)
* Lắng nghe các tin nhắn nhắc tên Bot (`@RAGChat` hoặc prefix `@ai`) trong các kênh chung (Channels) hoặc nhóm (Groups).
* Bỏ qua Direct Message (để tránh trùng với `BotMessageHandler`).
* Hỗ trợ đầy đủ cả việc chạy lệnh (`@ai stats`, `@ai clear`) và hỏi đáp tài liệu theo ngữ cảnh phòng.

#### C. `FileUploadHandler.ts` (`IPreFileUpload`)
* Bắt sự kiện người dùng tải tệp lên Rocket.Chat.
* Kiểm tra phần mở rộng tệp với 8 định dạng được hỗ trợ: `.pdf`, `.docx`, `.txt`, `.md`, `.pptx`, `.csv`, `.xlsx`, `.html`.
* Mã hóa tệp thành **Base64** và gửi bất đồng bộ sang Backend qua `POST /api/documents/base64` kèm theo `room_id` và `user_id` để phân quyền dữ liệu.
* Không chặn luồng tải tệp gốc của người dùng (non-blocking).

---

### 3.4 `src/commands/` (Slash Commands)

Tất cả lệnh đều tích hợp cơ chế **Placeholder Feedback** (tạo tin nhắn loading trước rồi update kết quả sau khi Backend trả về) để tránh timeout và tăng trải nghiệm người dùng:
1. **`AskCommand.ts` (`/ask "câu hỏi"`)**: Tra cứu tài liệu và trả lời câu hỏi bằng mô hình RAG.
2. **`SearchCommand.ts` (`/search "từ khóa"`)**: Tìm kiếm ngữ nghĩa / hybrid trong vector store và hiển thị danh sách trích đoạn liên quan nhất.
3. **`SummarizeCommand.ts` (`/summarize "văn bản"`)**: Tóm tắt đoạn văn bản do người dùng cung cấp.
4. **`ExplainCommand.ts` (`/explain "khái niệm"`)**: Giải thích khái niệm kỹ thuật hoặc nghiệp vụ một cách dễ hiểu.
5. **`TranslateCommand.ts` (`/translate [lang] "văn bản"`)**: Dịch văn bản sang ngôn ngữ chỉ định (mặc định tiếng Việt `vi`, hỗ trợ `en`, `fr`, `ja`, `ko`, `zh`, `de`, `es`).

---

### 3.5 `src/api/CallbackEndpoint.ts`
* **Đường dẫn**: `/api/app/callback` (public endpoint).
* **Mục đích**: Nhận webhook callback từ Python Backend khi các tác vụ nền hoàn tất (ví dụ: ARQ worker hoàn thành index tài liệu nặng).
* **Xác thực**: Kiểm tra token trong header `Authorization: Bearer <api-key>` khớp với cấu hình `api-key` của App.
* **Các sự kiện xử lý**:
  - `indexing_complete`: Gửi tin nhắn thông báo tài liệu `docName` đã được index thành công (kèm số lượng chunk).
  - `indexing_failed`: Gửi cảnh báo tài liệu index thất bại kèm lý do lỗi.

---

### 3.6 `src/settings/Settings.ts`
Khai báo danh mục cấu hình của Rocket.Chat App trong giao diện quản trị:

| Setting ID | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `backend-url` | `STRING` | `http://backend:8000` | Địa chỉ URL của FastAPI backend service (Bắt buộc) |
| `api-key` | `PASSWORD` | `""` | API Key xác thực Bearer token giữa App và Backend |
| `model` | `SELECT` | `gpt-4o` | Mô hình LLM được ưu tiên (`gpt-4o`, `claude-3-5-sonnet`, `gemini-2.0-flash`,...) |
| `embedding-model` | `SELECT` | `text-embedding-3-small` | Mô hình embedding (`text-embedding-3-small`, `bge-large-en`,...) |
| `max-history` | `NUMBER` | `10` | Số lượng tin nhắn tối đa lưu trữ trong lịch sử hội thoại |
| `temperature` | `NUMBER` | `0.7` | Độ sáng tạo của LLM (0.0: chính xác, 1.0: sáng tạo) |
| `enable-citations`| `BOOLEAN` | `true` | Hiển thị nguồn trích dẫn tài liệu đính kèm câu trả lời |

---

### 3.7 `src/utils/` (Tiện ích hỗ trợ)

* **`Formatter.ts`**:
  - `formatSources(sources)`: Tạo `IMessageAttachment` hiển thị thẻ nguồn tài liệu với thanh màu xanh `#1d74f5`, tên tài liệu, số trang, điểm số tương đồng `relevance %` và đoạn trích dẫn (snippet).
  - `formatHelpMessage()`, `formatWelcomeMessage()`, `formatStats()`: Chuẩn hóa giao diện phản hồi dạng Markdown.
* **`MessageHelper.ts`**:
  - `sendMessage(...)`: Gửi tin nhắn thông thường vào phòng/thread từ danh nghĩa Bot.
  - `sendPlaceholderMessage(...)`: Gửi tin nhắn trạng thái chờ xử lý (loading) và trả về `messageId`.
  - `updateMessage(...)`: Ghi đè tin nhắn placeholder bằng nội dung kết quả thực tế.
* **`SettingReader.ts`**:
  - `readMaxHistory(value)`: Đọc số lượng history an toàn, fallback về 10 nếu null/invalid.
  - `readBoolean(value, fallback)`: Đọc boolean an toàn.
* **`Validator.ts`**:
  - `isValidUrl(url)`: Kiểm tra giao thức URL (http/https).
  - `sanitizeInput(input)`: Cắt gọn chuỗi tối đa 4000 ký tự và loại bỏ khoảng trắng thừa.
* **`Logger.ts`**:
  - Bọc đối tượng `ILogger` với tiền tố ngữ cảnh `[ContextName]` giúp trace log dễ dàng trên server.

---

## 4. Luồng dữ liệu chính (Data Flows)

### 4.1 Luồng Hỏi đáp RAG (`/ask` hoặc Chat DM)
```
User (Rocket.Chat) 
  ──> SlashCommand / DM Message
  ──> Handler bắt sự kiện & gửi Placeholder Message ("🔍 Đang tra cứu...")
  ──> SessionStore lấy ChatHistory (theo User + Room + Thread)
  ──> BackendClient gửi POST /api/chat { query, user_id, room_id, history }
  ──> Python Backend: Query Refinement -> Hybrid Search -> Context Synthesis
  ──> BackendClient nhận kết quả { answer, sources, model }
  ──> SessionStore cập nhật thêm lượt Q&A mới vào Persistence
  ──> Formatter tạo Citation Card đính kèm
  ──> MessageHelper cập nhật lại Placeholder Message ban đầu thành câu trả lời hoàn chỉnh
```

### 4.2 Luồng Upload & Index Tài liệu
```
User tải file (.pdf, .docx, .md, ...) vào phòng chat
  ──> FileUploadHandler (IPreFileUpload) chặn sự kiện
  ──> Mã hóa nội dung file sang Base64
  ──> BackendClient gửi POST /api/documents/base64 { filename, content_base64, room_id, user_id }
  ──> Python Backend lưu trữ, parse, clean, chunk, embed và lưu vào pgVector
  ──> (Nếu chế độ Async) Backend gửi Webhook về /api/app/callback
  ──> CallbackEndpoint nhận event 'indexing_complete' -> Gửi tin nhắn thông báo vào Room
```

---

## 5. Nguyên tắc phát triển & Best Practices cho `src/`

1. **Không thực thi logic nặng trong App-Engine**:
   - Rocket.Chat Apps-Engine có timeout giới hạn trên mỗi request handler. Mọi tác vụ nặng (embedding, search, LLM) phải đẩy về Python Backend.
2. **Luôn sử dụng Placeholder cho các lệnh AI**:
   - Quá trình RAG có thể mất từ 2 đến 10 giây. Luôn gọi `sendPlaceholderMessage` ngay khi nhận lệnh để người dùng biết hệ thống đang xử lý.
3. **Phân lập dữ liệu triệt để**:
   - Mọi truy vấn và lưu trữ phiên phải đính kèm đủ bộ ba `(userId, roomId, threadId)` để đảm bảo tính riêng tư và đúng ngữ cảnh giữa các kênh/nhóm.
4. **Xử lý lỗi mềm (Graceful Degradation)**:
   - Khi Backend gián đoạn, luôn bắt lỗi và hiển thị thông báo thân thiện từ `ERRORS.BACKEND_UNAVAILABLE` thay vì để crash App.
