# Rocket.Chat RAG E2E handoff

## Phạm vi

Phiên này triển khai và kiểm tra chất lượng RAG ở backend qua tích hợp Rocket.Chat, không kiểm tra web UI trực tiếp. Tài liệu nguồn là `tests/DOC_RAG.txt`.

## Những gì đã triển khai

- Thêm runner `backend/scripts/evaluateRocketChatRagE2E.ts` và các helper trong `backend/scripts/ragE2E/`.
- Runner upload tài liệu qua `POST /api/v1/integrations/rocketchat/sources/base64`, chờ ingestion job và source ACTIVE.
- Tự sinh câu hỏi từ toàn văn tài liệu, gửi từng câu qua `POST /api/v1/integrations/rocketchat/messages/async`, chờ integration worker và đọc answer/citations đã persist.
- Judge answer theo correctness, groundedness, citation support và refusal; sinh JSON/Markdown report.
- Scope mỗi run bằng workspace/room/user riêng; cleanup source sau test khi bật `RAG_E2E_CLEANUP=true`.
- Fail-closed cho case lỗi/timeout; retry và timeout LLM có giới hạn; cleanup dùng actor identity đúng scope.
- Thêm unit/integration coverage cho evaluator và script package `rag:evaluate-rocketchat-e2e`.

## Model và lệnh chạy

Model đã dùng cho generation và judge:

```text
ag/gemini-3.8-flash
```

Ví dụ chạy trong Docker, không ghi API key vào command history hoặc tài liệu:

```powershell
$env:RAG_E2E_MODEL = "ag/gemini-3.8-flash"
$env:RAG_E2E_JUDGE_MODEL = "ag/gemini-3.8-flash"
$env:RAG_E2E_CASES = "50"
$env:RAG_E2E_CLEANUP = "true"
pnpm run rag:evaluate-rocketchat-e2e
```

Chạy lệnh từ thư mục `backend`. Trong môi trường hiện tại runner được mount vào container evaluator để dùng backend/worker đang chạy trong Docker network. Cần truyền `RAG_E2E_BASE_URL`, `RAG_E2E_TOKEN` và `RAG_E2E_DOCUMENT_PATH` phù hợp deployment.

## Kết quả E2E

Smoke test 2 câu:

- Completed: `2/2`
- Correctness: `100%`
- Groundedness: `100%`
- Citation support: `50%`
- Refusal: `100%`

Full test 50 câu với `ag/gemini-3.8-flash`:

- Generated/completed: `50/50`
- Failed: `0`
- Judge errors: `0`
- Correctness: `98%`
- Groundedness: `100%`
- Citation support: `90%`
- Refusal: `98%`
- Empty citation: `2%`
- Latency P50/P95: `12.2s / 21.9s`
- Threshold result: `PASS`

Report:

`artifacts/rag-e2e/rag-e2e-be098127-5434-4419-84d8-01be9ff1f311.json`

## Kiểm chứng answer trên Rocket.Chat

Ban đầu report E2E chỉ đọc `ChatMessage.llmResponse` trong PostgreSQL, nên chưa chứng minh answer đã hiển thị trong Rocket.Chat UI.

Đã chạy thêm flow thật backend → integration worker → callback endpoint của Rocket.Chat với câu hỏi:

> Thời gian tổ chức “Tuần lễ hội nhập sinh viên” năm học 2026–2027 đối với toàn thể sinh viên là từ ngày nào đến ngày nào?

Kết quả:

- Backend persist answer: từ `25/08` đến hết `06/09/2026`, kèm `[1]`, `[3]`.
- Worker gửi callback đến Rocket.Chat thành công, HTTP `200`.
- Message thực tế trong MongoDB có `msg` chứa answer.
- Cùng message có attachment `Sources & Citations` với 3 source.
- App đang cài trong Rocket.Chat là `RAGChat 0.0.4`.

Logic liên quan:

- `backend/services/rocketchatChat.service.ts`: callback payload có `answer: llmResponse` và `sources: citations`.
- `src/api/CallbackEndpoint.ts`: lấy `eventData.answer`, sau đó update placeholder/message bằng answer và attachment.
- `src/utils/MessageHelper.ts`: `updateMessage` set text answer và attachments citations.

Nếu người dùng vẫn thấy chỉ citations trên ChatUI, cần kiểm tra đúng Rocket.Chat instance/package, callback URL, callback logs và cache; lỗi này chưa tái hiện được trên local stack hiện tại.

## Verification đã chạy

- Backend test: `311 passed`, `5 skipped`.
- Vitest evaluator: `12/12 passed`.
- Typecheck: pass.
- Build: pass.
- Docker services: backend, integration-worker, PostgreSQL, Redis, Qdrant, MongoDB và Rocket.Chat healthy.

## Trạng thái và lưu ý phiên sau

- Nhánh triển khai: `feature/rocketchat-rag-e2e-quality`.
- Các commit triển khai trước handoff: `0f0c9fb`, `913bc20`, `e4dfd16`, `2ffd5ea`, `5240cda`, `be019b5`.
- Các thay đổi trong `AGENTS.md`, `CLAUDE.md` và `.claude/skills/` là thay đổi có sẵn/không thuộc evaluator; không stage chúng khi commit.
- Source `DOC_RAG-verify.txt` dùng cho kiểm chứng callback đã được xóa. Các message marker trong room `RagChatTest` được giữ lại để audit.
- Bước tiếp theo: người dùng hỏi cùng câu trên ChatUI và gửi screenshot; đối chiếu text answer, attachment citations, callback log và message ID nếu còn khác biệt.
