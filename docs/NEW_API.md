   📑 TỔNG QUAN KIẾN TRÚC KẾT NỐI (ARCHITECTURE OVERVIEW)

  Kiến trúc tương tác giữa SDK và Backend tuân theo mô hình Hybrid Sync/Async:

  1. Outgoing Calls (SDK → Backend): SDK thông qua BackendClient.ts gọi tới các endpoint được mount tại prefix /api/v1/integrations/rocketchat trên Backend
  (rocketchatIntegration.route.ts).
  2. Incoming Webhook Callbacks (Backend → SDK): Backend xử lý các tác vụ RAG nặng (vector retrieval, embeddings, LLM generation, document parsing) bất đồng bộ trong
  background, sau đó bắn webhook callback về SDK qua CallbackEndpoint.ts.

    sequenceDiagram
        autonumber
        actor User as User (Rocket.Chat)
        participant SDK as Rocket.Chat App (SDK)
        participant Backend as Express Backend
        participant Worker as Background Task / LLM / Qdrant

        User->>SDK: Gửi tin nhắn / Lệnh Slash (/ask, Upload File)
        SDK->>SDK: Tạo placeholder message & requestId
        SDK->>Backend: POST /messages/async hoặc /sources/base64 (Bearer Token)
        Backend-->>SDK: HTTP 202 Accepted { status: "accepted", jobId, requestId }
        SDK-->>User: Hiển thị trạng thái đang xử lý ⏳

        Backend->>Worker: Dispatch background job (setImmediate)
        Worker->>Worker: Embedding / Qdrant Search / LLM Completion
        Worker->>SDK: POST /api/apps/public/{appId}/callback { event, answer, sources, ... }
        SDK->>User: Cập nhật Placeholder Message với câu trả lời Markdown + Action Buttons 👍👎
  ──────
   🔐 CƠ CHẾ XÁC THỰC VÀ HEADER CHUẨN (AUTH & HEADERS)

  ### 1. Chiều SDK → Backend

  • Header:
      • Content-Type: application/json
      • Authorization: Bearer <INTEGRATION_TOKEN>
  • Cấu hình:
      • SDK: Lấy từ Setting integration-token (ưu tiên) hoặc fallback về api-key trong BackendClient.ts:384-398.
      • Backend: Kiểm tra qua middleware integrationAuth.middleware.ts khớp với process.env.ROCKETCHAT_INTEGRATION_TOKEN.


  ### 2. Chiều Backend → SDK (Webhook Callback)

  • Header:
      • Content-Type: application/json
      • Authorization: Bearer <ROCKETCHAT_INTEGRATION_TOKEN> (Gửi từ rocketchatIntegration.controller.ts:62-70)
  • Cấu hình:
      • SDK: Xác thực qua CallbackEndpoint.ts:288-333. Trong môi trường dev, có thể bật flag allow-unauthenticated-callbacks-dev.

  ──────
   📦 CHUẨN RESPONSE ENVELOPE (DATA ENVELOPE)

  Tất cả các API trả về từ backend đều bọc trong định dạng chuẩn ApiResponse.ts và được SDK unwrap tại BackendClient.ts:339-364:

    {
      "statusCode": 200,
      "data": { ... },
      "message": "Success message",
      "success": true
    }
  ──────
   🚀 CHI TIẾT CÁC API CONTRACT (SDK → BACKEND)

  Dưới đây là 7 API endpoints mà SDK gọi tới Backend:
  ──────
  ### 1. Enqueue Asynchronous Ask Message (Hỏi đáp RAG bất đồng bộ)

  • Endpoint: POST /api/v1/integrations/rocketchat/messages/async
  • SDK Caller: BackendClient.ts:74-112
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:208, validationSchemas.ts:330-351
  • Timeout SDK: 60,000ms (Backend phản hồi trong <1000ms)

  #### Request Body:

    {
      "workspaceId": "default",
      "rocketUserId": "user123",
      "roomId": "GENERAL",
      "threadId": "thread_abc_optional",
      "placeholderId": "msg_placeholder_xyz",
      "requestId": "ask-1772506600000-abcdef1",
      "query": "Làm thế nào để cấu hình RAG?",
      "history": [
        {
          "role": "user",
          "content": "Xin chào"
        },
        {
          "role": "assistant",
          "content": "Chào bạn! Tôi có thể giúp gì?"
        }
      ],
      "model": "openai/gpt-4o-mini",
      "provider": "DEFAULT",
      "callbackUrl": "https://chat.example.com/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback"
    }

  #### Response: HTTP 202 Accepted

    {
      "statusCode": 202,
      "data": {
        "status": "accepted",
        "jobId": "job-ask-1772506600000-abcdef1",
        "requestId": "ask-1772506600000-abcdef1",
        "duplicate": false
      },
      "message": "Message queued for processing",
      "success": true
    }
  ──────
  ### 2. Base64 Document Indexing (Tải lên & Index tài liệu)

  • Endpoint: POST /api/v1/integrations/rocketchat/sources/base64
  • SDK Caller: BackendClient.ts:207-224
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:701, validationSchemas.ts:361-373

  #### Request Body:

    {
      "workspaceId": "default",
      "rocketUserId": "user123",
      "roomId": "GENERAL",
      "threadId": null,
      "filename": "huong_dan_su_dung.pdf",
      "contentBase64": "JVBERi0xLjQKJSDi48...",
      "contentType": "application/pdf",
      "requestId": "upload-1772506600000-abc",
      "callbackUrl": "https://chat.example.com/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback"
    }

  #### Response: HTTP 202 Accepted

    {
      "statusCode": 202,
      "data": {
        "status": "accepted",
        "jobId": "job-upload-1772506600000-abc",
        "requestId": "upload-1772506600000-abc"
      },
      "message": "Source queued for ingestion",
      "success": true
    }
  ──────
  ### 3. Utility Completions (Tóm tắt, Giải thích, Dịch thuật, Tìm kiếm nhanh)

  • Endpoint: POST /api/v1/integrations/rocketchat/utilities/completion
  • SDK Callers:
      • summarize(text) → HTTP_TIMEOUT.UTILITY (8s)
      • explain(concept) → HTTP_TIMEOUT.UTILITY (8s)
      • translate(text, targetLang) → HTTP_TIMEOUT.UTILITY (8s)
      • search(query, topK, userId, roomId) → HTTP_TIMEOUT.SEARCH (5s)
      • ask(query, ...) (Sync fallback) → HTTP_TIMEOUT.DEFAULT (60s)
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:834, validationSchemas.ts:375-386

  #### Request Body (Tùy operation):

    // Summarize
    {
      "operation": "summarize",
      "text": "Nội dung cuộc họp dài cần tóm tắt..."
    }

    // Explain
    {
      "operation": "explain",
      "concept": "Vector Database là gì?"
    }

    // Translate
    {
      "operation": "translate",
      "text": "Hello world",
      "targetLang": "vi"
    }

    // Search
    {
      "operation": "search",
      "query": "cấu hình webhook",
      "topK": 5,
      "roomId": "GENERAL"
    }

  #### Responses: HTTP 200 OK

  • Với Summarize / Explain / Translate:

    {
      "statusCode": 200,
      "data": {
        "result": "Kết quả xử lý từ LLM...",
        "summary": "Tóm tắt..." // (hoặc "explanation", "translation" tương ứng)
      },
      "message": "Text summarized successfully",
      "success": true
    }

  • Với Search:

    {
      "statusCode": 200,
      "data": {
        "results": [
          {
            "title": "Tài liệu kỹ thuật",
            "snippet": "Found in knowledge base (rocketchat://default/GENERAL/doc.md)",
            "relevance": 0.85
          }
        ]
      },
      "message": "Search completed successfully",
      "success": true
    }
  ──────
  ### 4. List Scoped Knowledge Base Sources (Danh sách nguồn tài liệu)

  • Endpoint: GET /api/v1/integrations/rocketchat/sources
  • SDK Caller: BackendClient.ts:142-163
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:477, validationSchemas.ts:388-395
  • Query Parameters:
      • workspaceId (string, optional)
      • roomId (string, optional)
      • threadId (string, optional)
      • limit (number, optional, default: 50)


  #### Response: HTTP 200 OK

    {
      "statusCode": 200,
      "data": {
        "sources": [
          {
            "id": "e8188172-5b1b-4f9e-a89e-214e21a71999",
            "filename": "huong_dan.pdf",
            "documentationUrl": "rocketchat://default/GENERAL/huong_dan.pdf",
            "chunksCount": 15,
            "totalPages": 15,
            "createdAt": "2026-09-01T10:00:00.000Z",
            "lastIndexedAt": "2026-09-01T10:05:00.000Z",
            "status": "ACTIVE"
          }
        ]
      },
      "message": "Sources retrieved successfully",
      "success": true
    }
  ──────
  ### 5. Delete Knowledge Base Source (Xóa tài liệu khỏi Knowledge Base)

  • Endpoint: DELETE /api/v1/integrations/rocketchat/sources/:id
  • SDK Caller: BackendClient.ts:167-186
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:568, validationSchemas.ts:403-412
  • URL Params: id (UUID của ChatSource)
  • Query Parameters:
      • workspaceId (string, required nếu mode='room')
      • roomId (string, required nếu mode='room')
      • mode ("room" | "global", default: "room")


  #### Response: HTTP 200 OK

    {
      "statusCode": 200,
      "data": {
        "id": "e8188172-5b1b-4f9e-a89e-214e21a71999",
        "deleted": true,
        "vectorsRemoved": true,
        "qdrant": {
          "deleted": true
        }
      },
      "message": "Source deleted successfully",
      "success": true
    }
  ──────
  ### 6. Submit Answer Feedback (Gửi đánh giá 👍 / 👎)

  • Endpoint: POST /api/v1/integrations/rocketchat/feedback
  • SDK Caller: BackendClient.ts:191-202
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:648, validationSchemas.ts:414-424

  #### Request Body:

    {
      "messageId": "msg_placeholder_xyz",
      "chatMessageId": "c92e1069-42b4-4b53-b3c7-495e86976902",
      "rating": "positive",
      "feedbackText": "Câu trả lời rất chính xác và đầy đủ.",
      "rocketUserId": "user123",
      "workspaceId": "default",
      "roomId": "GENERAL"
    }

  #### Response: HTTP 200 OK

    {
      "statusCode": 200,
      "data": {
        "recorded": true,
        "rating": "positive",
        "chatMessageId": "c92e1069-42b4-4b53-b3c7-495e86976902"
      },
      "message": "Feedback recorded successfully",
      "success": true
    }
  ──────
  ### 7. Document & Token Usage Stats (Thống kê tài liệu & Token)

  • Endpoint: GET /api/v1/integrations/rocketchat/stats
  • SDK Caller: BackendClient.ts:117-137
  • Backend Controller & Validator: rocketchatIntegration.controller.ts:423, validationSchemas.ts:353-359

  #### Response: HTTP 200 OK

    {
      "statusCode": 200,
      "data": {
        "documents": [
          {
            "id": "e8188172-5b1b-4f9e-a89e-214e21a71999",
            "filename": "huong_dan.pdf",
            "chunks_count": 15,
            "created_at": "2026-09-01T10:00:00.000Z"
          }
        ],
        "chats": [],
        "usage": {
          "inputTokens": 1250,
          "outputTokens": 430,
          "totalTokens": 1680
        }
      },
      "message": "Integration stats retrieved successfully",
      "success": true
    }
  ──────
   🔄 CALLBACK WEBHOOK CONTRACT (BACKEND → SDK)

  Sau khi background worker hoàn tất, backend gọi HTTP POST tới callback URL của App Rocket.Chat:

  • URL định dạng: <WORKSPACE_URL>/api/apps/public/8a800b09-3cc1-4bc1-8dbf-12592fc223eb/callback (được cấu hình qua setting callback-base-url trong CallbackUrl.ts).
  • Backend Dispatcher: rocketchatIntegration.controller.ts:47-126
  • SDK Handler: CallbackEndpoint.ts:48-262

  ### Các Event Payload được hỗ trợ:

  #### 1. Sự kiện chat_completed (Sinh câu trả lời RAG thành công)

    {
      "event": "chat_completed",
      "request_id": "ask-1772506600000-abcdef1",
      "user_id": "user123",
      "room_id": "GENERAL",
      "thread_id": "thread_abc",
      "placeholder_id": "msg_placeholder_xyz",
      "chat_message_id": "c92e1069-42b4-4b53-b3c7-495e86976902",
      "query": "Làm thế nào để cấu hình RAG?",
      "answer": "Để cấu hình RAG, bạn cần làm theo các bước sau:\n1. ...",
      "sources": [
        {
          "title": "huong_dan.pdf",
          "snippet": "Nội dung đoạn trích từ tài liệu...",
          "pageUrl": "rocketchat://default/GENERAL/huong_dan.pdf",
          "relevance": 0.92
        }
      ],
      "model": "openai/gpt-4o-mini"
    }

  • Hành vi SDK:
      • Cập nhật nội dung placeholder message thành câu trả lời Markdown.
      • Đính kèm trích dẫn nguồn (nếu bật enable-citations).
      • Render action block buttons: 👍 Thích, 👎 Không thích, 🔄 Hỏi lại, 📋 Copy Raw Markdown, 🔍 Xem trích dẫn chi tiết.
      • Lưu vào Session Store lịch sử hội thoại.


  #### 2. Sự kiện chat_failed (Xử lý LLM thất bại)

    {
      "event": "chat_failed",
      "request_id": "ask-1772506600000-abcdef1",
      "user_id": "user123",
      "room_id": "GENERAL",
      "thread_id": "thread_abc",
      "placeholder_id": "msg_placeholder_xyz",
      "query": "Làm thế nào để cấu hình RAG?",
      "error": "LLM Provider timeout"
    }

  #### 3. Sự kiện indexing_complete (Index tài liệu thành công)

    {
      "event": "indexing_complete",
      "request_id": "upload-1772506600000-abc",
      "user_id": "user123",
      "room_id": "GENERAL",
      "thread_id": null,
      "document_name": "huong_dan.pdf",
      "chunks_count": 15
    }

  #### 4. Sự kiện indexing_failed (Index tài liệu thất bại)

    {
      "event": "indexing_failed",
      "request_id": "upload-1772506600000-abc",
      "user_id": "user123",
      "room_id": "GENERAL",
      "thread_id": null,
      "document_name": "huong_dan.pdf",
      "error": "Failed to parse PDF file"
    }
  ──────
   📊 BẢNG TỔNG HỢP MAPPING TRƯỜNG DỮ LIỆU & KIỂM TRA ĐỘ TƯƠNG THÍCH

   Chiều    │ Action / Endpoint				│ Model SDK (src)                    │ Schema Backend (backend)			 │  Trạng thái tương thích
  ──────────┼───────────────────────────────────────────┼────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────────
   SDK → BE │ Enqueue Ask (POST .../messages/async)     │ BackendTypes.ts:15-27              │ validationSchemas.ts:330-351		 │       ✅ 100% Khớp
   SDK → BE │ Base64 Upload (POST .../sources/base64)   │ BackendTypes.ts:55-65              │ validationSchemas.ts:361-373		 │       ✅ 100% Khớp
   SDK → BE │ Utilities (POST .../utilities/completion) │ BackendTypes.ts:74-83              │ validationSchemas.ts:375-386              │       ✅ 100% Khớp
   SDK → BE │ List Sources (GET .../sources)            │ BackendTypes.ts:111-113            │ validationSchemas.ts:388-395              │       ✅ 100% Khớp
   SDK → BE │ Delete Source (DELETE .../sources/:id)    │ sourceId, workspaceId, roomId,     │ validationSchemas.ts:403-412              │       ✅ 100% Khớp
            │                                           │ mode                               │                                           │
   SDK → BE │ Submit Feedback (POST .../feedback)       │ BackendTypes.ts:115-123            │ validationSchemas.ts:414-424              │       ✅ 100% Khớp
   SDK → BE │ Get Stats (GET .../stats)			│ BackendTypes.ts:45-53              │ validationSchemas.ts:353-359              │       ✅ 100% Khớp
   BE → SDK │ Webhook Callback (POST .../callback)      │ CallbackEndpoint.ts:110-237        │ rocketchatIntegration.controller.ts:383-415 │ ✅ 100% Khớp (snake_case
            │                                           │                                    │                                           │         envelope)
  ──────
   🛡️ CƠ CHẾ IDEMPOTENCY & BUDGET TIMEOUT

  1. Chống trùng lặp (Idempotency Guard):
      • Backend: Sử dụng seenRequests = new Set<string>() (bounded 2000 items) trong rocketchatIntegration.controller.ts:24-37. Nếu nhận request có requestId đã thấy,
      lập tức trả về 202 Accepted { duplicate: true } và không chạy lại worker.
      • SDK: Sử dụng processedRequests = new Set<string>() (bounded 1000 items) trong CallbackEndpoint.ts:24-25 để bỏ qua webhook retry bị duplicate từ backend.
  2. Budget Timeout:
      • Rocket.Chat Apps Engine có ràng buộc thực thi lệnh ~10s.
      • Các lệnh tiện ích tương tác (BackendClient.ts:230, BackendClient.ts:249, BackendClient.ts:268) sử dụng HTTP_TIMEOUT.UTILITY = 8000ms.
      • Lệnh tìm kiếm vector (BackendClient.ts:287) sử dụng HTTP_TIMEOUT.SEARCH = 5000ms.
      • Các tác vụ hỏi đáp nặng (BackendClient.ts:74 và BackendClient.ts:207) chuyển sang mô hình Enqueue + Webhook Callback hoàn toàn để không bị nghẽn UI.
