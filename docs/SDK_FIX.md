# SDK Fix Plan

Tài liệu này ghi lại các vấn đề phát hiện khi review phần Rocket.Chat SDK trong `src/` và phương án xử lý đề xuất. Phạm vi chỉ bao gồm SDK/App (`src/`, `RagChatApp.ts`, `app.json`, root package); không chạm vào logic backend.

## Trạng thái xác minh

- `npx.cmd tsc --noEmit`: pass.
- `npx.cmd rc-apps package`: có cảnh báo/lỗi packaging `Failed to resolve module: node:crypto`.
- `node .gitnexus\run.cjs analyze`: đã refresh index GitNexus thành công.
- `node .gitnexus\run.cjs detect_changes -r RAGChat`: risk `critical`, 35 symbols / 42 flows affected. Kết quả này bao gồm cả thay đổi backend có sẵn trong worktree, nên cần tách riêng khi review SDK.
- Root package hiện không có test script và không thấy test tự động cho SDK interaction flows.

## Tổng quan ưu tiên

| Mức | Vấn đề | Ảnh hưởng chính | Ưu tiên |
|---|---|---|---|
| HIGH | SDK không truyền `callbackUrl` cho async jobs | Placeholder có thể không bao giờ được update | P0 |
| HIGH | Public callback endpoint có thể bỏ qua auth nếu chưa set token | Có thể spoof callback/send message | P0 |
| MEDIUM | `inspect_source` button không được handler xử lý | Nút "Chi tiết" trong `/rag docs` no-op | P1 |
| MEDIUM | Button payload chứa full answer/sources | UIKit interaction có thể fail khi payload dài | P1 |
| MEDIUM | Một số utility command vẫn gọi backend đồng bộ | Có thể timeout trong Apps Engine runtime | P1 |
| MEDIUM | `rc-apps package` chưa sạch do dependency `@rocket.chat/ui-kit` | Rủi ro deploy/package app | P1 |
| LOW | Trùng `.ts` và `.js` trong `src` | GitNexus ambiguity, dễ review nhầm file | P2 |
| LOW | Thiếu test SDK | Regression khó phát hiện | P2 |

## 1. Async jobs thiếu `callbackUrl`

### Bằng chứng

- `BackendClient.askAsync()` có tham số `callbackUrl?: string` và đưa vào payload:
  - `src/lib/BackendClient.ts:58`
  - `src/lib/BackendClient.ts:67`
  - `src/lib/BackendClient.ts:80`
- Các nơi gọi không truyền tham số thứ 9:
  - `src/commands/AskCommand.ts:86`
  - `src/handlers/BotMessageHandler.ts:200`
  - `src/handlers/MentionHandler.ts:117`
  - `src/handlers/BlockActionHandler.ts:156`
  - `src/handlers/BlockActionHandler.ts:362`
  - `src/handlers/ActionButtonHandler.ts:139`
- Upload base64 cũng không truyền callback URL:
  - `src/handlers/FileUploadHandler.ts:127`
  - `src/handlers/ActionButtonHandler.ts:222`
- Contract ghi async job và upload sẽ callback về `callbackUrl`:
  - `API_CONTRACT.md`, mục `POST /messages/async`
  - `API_CONTRACT.md`, mục `POST /sources/base64`

### Vấn đề

Nếu backend không tự suy ra URL callback, các luồng `/ask`, DM, mention, regenerate, suggestion chip và upload/index chỉ queue job rồi không có đường cập nhật placeholder hoặc gửi thông báo indexing hoàn tất.

### Phương án giải quyết

1. Thêm setting SDK mới, ví dụ `callback-base-url` hoặc `rocketchat-public-url`.
2. Tạo helper trong SDK để build callback URL:
   - input: public Rocket.Chat base URL, app id từ `app.json`, path `callback`.
   - output: `<publicBaseUrl>/api/apps/public/<appId>/callback`.
3. Truyền `callbackUrl` vào mọi call `askAsync()` và `uploadBase64()`.
4. Validate setting khi `onEnable()`:
   - `backend-url` bắt buộc.
   - callback public URL bắt buộc nếu backend không có cơ chế callback fallback rõ ràng.
5. Nếu backend đang tự fallback callback URL, cần ghi rõ trong contract và SDK docs. Không nên để SDK/comment nói phụ thuộc `callbackUrl` nhưng runtime không gửi.

### Verify sau sửa

- Type-check: `npx.cmd tsc --noEmit`.
- Package: `npx.cmd rc-apps package`.
- Manual/smoke:
  - `/ask test` tạo placeholder, backend callback `chat_completed`, placeholder được update.
  - Upload file `.txt`, backend callback `indexing_complete`, room nhận message hoàn tất.
  - Kiểm tra payload backend nhận có `callbackUrl`.

## 2. Callback endpoint public và auth fallback không an toàn

### Bằng chứng

- Endpoint public và `UNSECURE`:
  - `RagChatApp.ts:160`
  - `RagChatApp.ts:162`
- `integration-token` không required:
  - `src/settings/Settings.ts:35`
  - `src/settings/Settings.ts:38`
- `onEnable()` chỉ validate `backend-url`, không validate token:
  - `RagChatApp.ts:176`
  - `RagChatApp.ts:180`
- `authorize()` cho phép request nếu không có token configured:
  - `src/api/CallbackEndpoint.ts:286`
  - `src/api/CallbackEndpoint.ts:288`

### Vấn đề

Callback endpoint là public app API. Khi token chưa cấu hình, bất kỳ client nào biết app id/path có thể gửi event giả như `chat_completed`, `chat_failed`, `indexing_complete` và khiến bot update/gửi message vào room nếu biết `user_id` và `room_id`.

### Phương án giải quyết

1. Biến `integration-token` thành required cho production.
2. `onEnable()` phải fail nếu thiếu cả `integration-token` và legacy `api-key`.
3. Không cho `authorize()` return `true` khi thiếu token, trừ khi có setting dev-mode riêng và mặc định `false`, ví dụ `allow-unauthenticated-callbacks-dev`.
4. Với callback public endpoint, vẫn giữ `ApiSecurity.UNSECURE` nếu cần custom Bearer auth, nhưng custom auth không được bypass silently.
5. Log warning rõ khi chạy dev-mode unauthenticated, nếu vẫn giữ chế độ này.

### Verify sau sửa

- Callback không header Authorization trả `401`.
- Callback Bearer sai trả `401`.
- Callback Bearer đúng xử lý event.
- App không enable nếu thiếu token trong cấu hình production.

## 3. Nút `inspect_source` trong `/rag docs` không được xử lý

### Bằng chứng

- `DocumentListBlock` tạo action id `inspect_source:${doc.id}`:
  - `src/uikit/blocks/DocumentListBlock.ts:120`
- `BlockActionHandler` chỉ xử lý các dạng `inspect_chunks` / `inspect-chunks` / `action:inspect_chunks`:
  - `src/handlers/BlockActionHandler.ts:178`
  - `src/handlers/BlockActionHandler.ts:183`
- `SourceCardsBlock` cũng tạo `inspect_chunk:${targetId}`:
  - `src/uikit/blocks/SourceCardsBlock.ts:139`

### Vấn đề

Click "Chi tiết" trong document list có thể không làm gì vì action id không match handler. Một số biến thể `inspect_chunk`/`inspect_source` đang tồn tại nhưng chưa được normalize về cùng handler.

### Phương án giải quyết

1. Chuẩn hóa enum/action ids:
   - `inspect_source:<sourceId>` cho document-level inspect.
   - `inspect_chunks` hoặc `inspect_chunk:<chunkId>` cho answer citation inspect.
2. Cập nhật `BlockActionHandler` để nhận:
   - `inspect_source:`
   - `inspect_chunk:`
   - `inspect_chunks:`
   - `action:inspect_chunks`
3. Khi nhận `inspect_source`, parse `value` JSON `{ sourceId, filename }`, gọi `client.listSources()` để lấy metadata và mở `SourceDetailModal`.
4. Nếu cần xem chunk thật của source, SDK cần endpoint backend tương ứng. Nếu hiện backend chỉ trả metadata, modal nên nói rõ là đang hiển thị metadata, không giả vờ có raw chunks.

### Verify sau sửa

- `/rag docs` render danh sách.
- Click "Chi tiết" mở modal.
- Click "Xoá" vẫn mở confirm modal.
- Click citation "Nguồn trích dẫn" dưới answer vẫn mở modal nguồn.

## 4. Button payload quá lớn

### Bằng chứng

- `encodeActionPayload()` nhét `sources` và `rawMarkdown` vào button `value`:
  - `src/uikit/blocks/ActionButtonsBlock.ts:53`
  - `src/uikit/blocks/ActionButtonsBlock.ts:64`
  - `src/uikit/blocks/ActionButtonsBlock.ts:65`
- `CallbackEndpoint` truyền full `sources` và `answer` vào action buttons:
  - `src/api/CallbackEndpoint.ts:138`
  - `src/api/CallbackEndpoint.ts:142`
  - `src/api/CallbackEndpoint.ts:144`
- Tất cả buttons dùng cùng payload lớn, kể cả feedback:
  - `src/uikit/blocks/ActionButtonsBlock.ts:91`
  - `src/uikit/blocks/ActionButtonsBlock.ts:100`
  - `src/uikit/blocks/ActionButtonsBlock.ts:112`
  - `src/uikit/blocks/ActionButtonsBlock.ts:123`
  - `src/uikit/blocks/ActionButtonsBlock.ts:137`

### Vấn đề

UIKit `value` không nên chứa answer dài hoặc toàn bộ source chunks. Payload dài làm tăng nguy cơ message render fail, interaction fail, hoặc bị truncate. Feedback/regenerate/copy/inspect cũng cần dữ liệu khác nhau nhưng hiện đang dùng cùng một payload.

### Phương án giải quyết

1. Tách payload theo action:
   - feedback: `{ messageId, chatMessageId, rating }`
   - regenerate: `{ query, threadId }`
   - copy markdown: `{ messageId }` hoặc lưu raw answer vào persistence theo request/message id.
   - inspect chunks: `{ messageId, chatMessageId, sourcesCount }` hoặc `{ sourceRefs }` rút gọn.
2. Lưu dữ liệu lớn vào App Persistence theo association:
   - key theo `messageId` hoặc `requestId`.
   - data gồm `rawMarkdown`, `sources`, `query`, `chatMessageId`.
3. `BlockActionHandler` khi click thì đọc persistence bằng key thay vì parse payload lớn.
4. Đặt giới hạn size phòng thủ trước khi tạo button value.

### Verify sau sửa

- Với answer dài > 10k ký tự và 5 sources dài, message vẫn render.
- Feedback gửi đúng `chatMessageId`.
- Copy markdown mở modal với full answer.
- Inspect chunks mở đúng sources.

## 5. Utility commands vẫn gọi backend đồng bộ trong Apps runtime

### Bằng chứng

- `/summarize` gọi `client.summarize()` trực tiếp:
  - `src/commands/SummarizeCommand.ts:63`
- `/explain` gọi `client.explain()` trực tiếp:
  - `src/commands/ExplainCommand.ts:63`
- `/search` gọi `client.search()` trực tiếp:
  - `src/commands/SearchCommand.ts:64`
- Message action summarize/translate cũng gọi sync:
  - `src/handlers/ActionButtonHandler.ts:95`
  - `src/handlers/ActionButtonHandler.ts:183`
- `BackendClient` timeout HTTP là 60s:
  - `src/lib/BackendClient.ts:389`
  - `src/lib/BackendClient.ts:406`
  - `src/lib/BackendClient.ts:422`
- Chính comment của `/ask` nói Apps Engine có timeout 10s và cần async:
  - `src/commands/AskCommand.ts:23`
  - `src/commands/AskCommand.ts:84`

### Vấn đề

Nếu backend/LLM chậm, slash command hoặc action handler có thể vượt giới hạn runtime của Rocket.Chat Apps Engine. `/ask` đã xử lý async đúng hướng, nhưng utility commands chưa đồng nhất.

### Phương án giải quyết

1. Với thao tác LLM (`summarize`, `explain`, `translate`), chuyển sang async queue tương tự `/ask`.
2. Nếu backend chưa có async utility endpoint, cần chọn một trong hai:
   - thêm endpoint async utility ở backend sau này; hoặc
   - SDK đặt timeout ngắn hơn Apps Engine budget và báo lỗi rõ khi backend chậm.
3. `/search` có thể giữ sync nếu backend search luôn nhanh và không gọi LLM; cần giới hạn timeout riêng thấp hơn, ví dụ 5-8s.
4. Không dùng timeout 60s cho command/action handler trong SDK runtime.

### Verify sau sửa

- Backend delay 15s không làm slash command timeout.
- Placeholder được tạo ngay.
- Callback update kết quả hoặc báo lỗi.
- `/search` timeout có thông báo rõ và không treo command.

## 6. `rc-apps package` báo lỗi `node:crypto`

### Bằng chứng

- Lệnh `npx.cmd rc-apps package` báo:
  - `App has external module(s) as dependency`
  - `Error: Failed to resolve module: node:crypto`
- Source SDK không import trực tiếp `node:crypto`.
- Root `package.json` có dependency:
  - `@rocket.chat/ui-kit`
  - `@rocket.chat/icons`
- Source chỉ import runtime type/value từ `@rocket.chat/ui-kit` tại:
  - `src/utils/MessageHelper.ts:5`
- `npm ls` cho thấy `@rocket.chat/ui-kit@0.36.1` kéo `typia@5.3.12` và TypeScript phụ thuộc.

### Vấn đề

Rocket.Chat App nên hạn chế external runtime dependencies. Việc import `LayoutBlock` từ `@rocket.chat/ui-kit` có thể khiến packager cố bundle dependency tree không cần thiết và vấp module Node core.

### Phương án giải quyết

1. Nếu chỉ cần type `LayoutBlock`, chuyển sang `import type` để tránh runtime import:
   - `import type { LayoutBlock } from '@rocket.chat/ui-kit';`
2. Xem có thể lấy type tương đương từ `@rocket.chat/apps-engine/definition/uikit` hay không để bỏ dependency root `@rocket.chat/ui-kit`.
3. Nếu không cần `@rocket.chat/icons`, gỡ khỏi `dependencies`.
4. Chạy lại `rc-apps package` sau khi bỏ hoặc type-only hóa dependency.
5. Nếu vẫn lỗi với Node 22/Apps CLI, ghi nhận version matrix và thử Apps CLI/Node LTS tương thích.

### Verify sau sửa

- `npx.cmd tsc --noEmit` pass.
- `npx.cmd rc-apps package` không còn `node:crypto`.
- Bundle tạo được app package deployable.

## 7. Trùng `.ts` và `.js` trong `src`

### Bằng chứng

- `src` đang có nhiều cặp file cùng tên:
  - `src/lib/BackendClient.ts` và `src/lib/BackendClient.js`
  - `src/api/CallbackEndpoint.ts` và `src/api/CallbackEndpoint.js`
  - các command/handler/utils tương tự.
- GitNexus context bị ambiguous giữa symbol `.ts` và `.js`.

### Vấn đề

Các file `.js` compile artifact trong source làm review nhầm, graph index nhiễu, và có thể gây đóng gói nhầm nếu toolchain resolver chọn `.js` trước `.ts` trong một số tình huống.

### Phương án giải quyết

1. Xác định Rocket.Chat Apps CLI dùng source `.ts` hay `.js` trong package hiện tại.
2. Nếu `.js` là artifact, đưa vào `dist/` hoặc xóa khỏi `src` và thêm rule `.gitignore`.
3. Không giữ song song `.ts`/`.js` trong cùng folder source.
4. Sau khi dọn, refresh GitNexus index.

### Verify sau sửa

- `rg --files src | rg "\.js$"` không còn artifact không cần thiết.
- `node .gitnexus\run.cjs analyze` không còn ambiguous symbol cho `BackendClient`, `CallbackEndpoint`.
- `rc-apps package` vẫn build đúng app.

## 8. Thiếu test tự động cho SDK interaction flows

### Bằng chứng

- Root `package.json` không có `scripts`.
- Không thấy test SDK tương ứng cho command/handler/uikit.

### Vấn đề

Các lỗi như actionId mismatch, payload oversized, auth fallback, callbackUrl thiếu đều dễ tái phát vì hiện không có regression test ở SDK layer.

### Phương án giải quyết

1. Thêm test framework nhẹ cho SDK, ví dụ Jest hoặc Vitest nếu phù hợp với Apps Engine mocks.
2. Tạo mocks cho `IRead`, `IModify`, `IHttp`, `IPersistence`, interaction contexts.
3. Test tối thiểu:
   - `BackendClient.askAsync()` payload có `callbackUrl`.
   - `CallbackEndpoint.authorize()` reject khi thiếu/sai token.
   - `buildDocumentListBlocks()` action ids được `BlockActionHandler` nhận.
   - `encodeActionPayload()` không chứa full raw answer trong feedback payload.
   - `readMaxHistory()` và `readBoolean()` giữ fallback đúng.

### Verify sau sửa

- `npm test` hoặc command test tương ứng pass.
- Các regression test fail nếu bỏ `callbackUrl`, bypass auth hoặc đổi sai action id.

## Đề xuất thứ tự xử lý

1. P0: Sửa callback URL cho mọi async call.
2. P0: Siết auth callback endpoint và validate token khi enable app.
3. P1: Normalize action ids cho inspect source/chunks.
4. P1: Giảm payload button, đưa dữ liệu lớn vào persistence.
5. P1: Làm sạch packaging dependency `@rocket.chat/ui-kit`/`node:crypto`.
6. P1: Rà lại utility sync timeout, chuyển LLM utility sang async hoặc timeout ngắn.
7. P2: Dọn `.js` artifact trong `src`.
8. P2: Thêm test SDK regression.

## Checklist hoàn tất sau khi sửa

- [ ] Không chạm backend nếu task chỉ yêu cầu SDK.
- [ ] Chạy impact analysis GitNexus trước khi sửa symbol SDK.
- [ ] `npx.cmd tsc --noEmit` pass.
- [ ] `npx.cmd rc-apps package` pass.
- [ ] `node .gitnexus\run.cjs detect_changes -r RAGChat` cho thấy phạm vi chỉ nằm trong SDK/docs kỳ vọng.
- [ ] Smoke `/ask`, DM mention, upload file, `/rag docs`, delete source, feedback, regenerate, copy markdown, inspect chunks.
- [ ] Callback unauthorized bị reject.
- [ ] Button payload không chứa dữ liệu lớn không cần thiết.
