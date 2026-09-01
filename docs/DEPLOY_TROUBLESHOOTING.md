# Báo Cáo Xác Minh Và Kế Hoạch Khắc Phục Deploy RAGChat Trên Rocket.Chat

**Ngày xác minh:** 30/08/2026  
**Dự án:** RAGChat  
**Môi trường:** Docker Compose cục bộ tại `D:\Work\Study\RAGChat`  
**Phạm vi:** Rocket.Chat App, FastAPI backend, Docker network, dữ liệu Apps trong MongoDB và các rủi ro triển khai liên quan.

> Tài liệu phản ánh trạng thái tại thời điểm xác minh. Việc cài App, đổi credential, nâng version hoặc restore dữ liệu chưa được thực hiện. Không sao chép secret thật vào tài liệu, terminal history hoặc Git.

---

## 1. Tóm Tắt Điều Hành

Backend RAGChat đang chạy và Rocket.Chat kết nối được tới backend qua Docker network. Nguyên nhân trực tiếp khiến người dùng không thấy RAGChat là **Rocket.Chat App chưa được cài vào Apps Engine**. Sau khi cài App, cấu hình mặc định `http://localhost:8000` sẽ tiếp tục gây lỗi vì nó trỏ vào container Rocket.Chat thay vì container backend.

Hai rủi ro cần xử lý trước khi coi hệ thống sẵn sàng cho production:

1. `.rcappsconfig` đang được Git theo dõi và từng chứa credential plaintext trong lịch sử commit.
2. Rocket.Chat 6.13.0 và MongoDB 5.0 đã hết vòng đời hỗ trợ.

### Thứ tự xử lý

| Ưu tiên | Hạng mục | Kết quả cần đạt |
| --- | --- | --- |
| **P0** | Cô lập credential đã lộ | Rotate secret; không còn credential thật trong file được track |
| **P0** | Cài RAGChat App | App Enabled, có bot `ragchat.bot` và slash commands |
| **P0** | Cấu hình Backend URL | App gọi `http://backend:8000` thành công |
| **P1** | Bật API authentication | Backend `/api/*` yêu cầu Bearer token; App dùng cùng secret |
| **P1** | Nâng Rocket.Chat/MongoDB | Chuyển tuần tự tới version còn hỗ trợ, có backup/rollback từng checkpoint |
| **P2** | Hardening Docker | Healthcheck, giới hạn port, pin image, thay credential mặc định |
| **P2** | Chốt storage | Ghi đúng local volume hay MinIO; không coi MinIO active khi đang tắt |

Không deploy App, đổi authentication và nâng database trong cùng một change window. Ngoại lệ bắt buộc là bridge cuối MongoDB 7 → 8 và Rocket.Chat 7 → 8: hai thay đổi này phải nằm trong **một maintenance window được kiểm soát**, không tạo checkpoint chạy Rocket.Chat 7 trên MongoDB 8.

---

## 2. Cơ Sở Và Giới Hạn Xác Minh

Đã thực hiện các kiểm tra đọc-chỉ:

- Đọc Compose, App manifest, App source, settings, backend authentication và CLI config.
- Kiểm tra container status và startup logs.
- Gọi health endpoint từ host và từ chính container Rocket.Chat.
- Truy vấn MongoDB để kiểm tra admin, app metadata và bot user; không đọc hash/token.
- Kiểm tra Rocket.Chat/Apps Engine version.
- Chạy `npx tsc --noEmit`.

Giới hạn:

- Chưa deploy App vì thao tác đó làm thay đổi workspace.
- Không đăng nhập bằng credential cũ.
- Chưa chạy thử nâng version hoặc restore backup.
- Runtime là snapshot; phải chạy lại baseline trước change window.

---

## 3. Hiện Trạng Đã Xác Minh

| Dịch vụ | Container | Host / Internal | Trạng thái | Kết luận |
| --- | --- | --- | --- | --- |
| FastAPI backend | `ragchat-backend` | `8000 / 8000` | Running; `/health` HTTP 200 | Hoạt động, Compose chưa có Docker healthcheck |
| ARQ worker | `ragchat-worker` | `— / nội bộ` | Running; đăng ký job thành công | Hoạt động |
| Rocket.Chat | `ragchat-rocketchat` | `3001 / 3000` | Running; HTTP 200 | Version 6.13.0 đã EOL |
| MongoDB | `ragchat-mongo` | `— / 27017` | Healthy | Không publish 27017 ra host |
| PostgreSQL + pgVector | `ragchat-postgres` | `5432 / 5432` | Healthy | Backend đã cấu hình kết nối |
| Redis | `ragchat-redis` | `6379 / 6379` | Healthy | Worker kết nối thành công |
| MinIO | `ragchat-minio` | `9000, 9001` | Healthy | Backend đang có `USE_MINIO=false` |
| Prometheus | `ragchat-prometheus` | `9090 / 9090` | Running | Đang scrape backend |
| Grafana | `ragchat-grafana` | `3000 / 3000` | Running | Service đang chạy |

### Kết nối Rocket.Chat → backend

```text
GET http://backend:8000/health
HTTP 200
{"status":"ok"}
```

Lỗi hiện tại **không phải** do Docker DNS/network.

### Tình trạng App trong MongoDB

- Không có metadata RAGChat trong Apps collection.
- Không có app user `ragchat.bot`.
- Không có app settings RAGChat.
- Username trong `.rcappsconfig` không khớp admin đang hoạt động.

### Khả năng tương thích

- App yêu cầu Apps API `^1.44.0`.
- Server đang có Apps Engine 1.46.0.
- `npx tsc --noEmit` thành công.

Chưa thấy blocker về API version hoặc TypeScript compile.

---

## 4. Root Cause Analysis

### Root cause 1 — RAGChat App chưa được deploy

**Mức độ:** P0, lỗi chức năng trực tiếp.

`docker compose up -d` chỉ chạy hạ tầng và backend; nó không package/nạp `RagChatApp.ts` vào Apps Engine. Khi App chưa cài:

- Không có bot `ragchat.bot`.
- Không có `/ask`, `/search`, `/summarize`, `/explain`, `/translate`.
- Không đăng ký handler cho DM, mention hoặc file upload.

**Fix:** package/deploy bằng Apps CLI hoặc upload ZIP qua Private Apps; sau đó xác minh App Enabled.

### Root cause 2 — Backend URL mặc định sai trong Docker

**Mức độ:** P0, lỗi kế tiếp sau khi App được cài.

`src/settings/Settings.ts` mặc định:

```text
http://localhost:8000
```

Trong container Rocket.Chat, `localhost` là Rocket.Chat. URL đúng:

```text
http://backend:8000
```

**Fix tức thời:** cập nhật App setting sau deploy.  
**Fix bền vững:** coi Backend URL là cấu hình bắt buộc trong runbook/pipeline, không dựa vào default.

### Root cause 3 — Credential deploy không hợp lệ

**Mức độ:** P0, chặn CLI deploy.

`.rcappsconfig` tham chiếu username cũ không tồn tại. CLI không thể xác thực bằng cấu hình này.

**Fix:** dùng admin hiện hành hoặc Personal Access Token; loại credential thật khỏi file được Git theo dõi.

### Các giả thuyết đã loại trừ

| Giả thuyết | Kết quả |
| --- | --- |
| Backend không chạy | Loại trừ: health HTTP 200 |
| Rocket.Chat không chạy | Loại trừ: web HTTP 200 |
| Docker DNS không resolve `backend` | Loại trừ: request từ Rocket.Chat thành công |
| App không tương thích API | Chưa thấy blocker: yêu cầu 1.44, server 1.46 |
| Source TypeScript lỗi | Loại trừ ở mức typecheck |

---

## 5. Rủi Ro Bổ Sung

### 5.1 Credential plaintext trong Git

`.rcappsconfig` đang được track và đã xuất hiện trong nhiều commit. Xóa ở commit mới không xóa secret khỏi lịch sử.

Phải:

1. Rotate credential; nếu tái sử dụng, rotate ở mọi nơi.
2. Thay bằng `.rcappsconfig.example` chỉ chứa placeholder.
3. Thêm `.rcappsconfig` vào `.gitignore`.
4. Ưu tiên PAT/User ID với quyền tối thiểu.
5. Làm sạch lịch sử Git trong change riêng; backup và thông báo cộng tác viên trước force-push.

### 5.2 Rocket.Chat 6.13 và MongoDB 5 đã EOL

Rocket.Chat 6.13 hết hỗ trợ tháng 04/2025. Tại ngày xác minh, target ổn định dài hơn là Rocket.Chat 8.5 LTS, được công bố hỗ trợ đến tháng 06/2027. Phải kiểm tra lại support matrix trước khi triển khai.

Không nâng trực tiếp 6.13 → 8.x. MongoDB cũng phải nâng tuần tự theo từng major và kiểm tra Feature Compatibility Version (FCV) ở mỗi checkpoint.

### 5.3 Private Apps từ Rocket.Chat 7+

Tài liệu hiện tại giới hạn private apps trên Community workspace từ version 7.0. Trước nâng cấp phải xác định workspace plan và khả năng Enable/Update RAGChat.

Không uninstall private app sau nâng cấp nếu chưa chắc có quyền cài lại; không coi cơ chế miễn trừ app cũ là chiến lược license dài hạn.

### 5.4 Backend API chưa yêu cầu token

Runtime hiện có `API_KEY` rỗng; `/api/*` nhận request không Bearer token và port 8000 đang publish ra host.

**Fix:** cấu hình secret mạnh ở backend/App, rồi hạn chế port theo môi trường.

### 5.5 MinIO chưa được sử dụng

`USE_MINIO=false`; upload backend hiện dùng local volume. Chỉ mô tả MinIO là active sau khi bật cờ, kiểm thử upload/download và restore.

---

## 6. Kế Hoạch Khắc Phục

### Giai đoạn 0 — Credential và baseline

- [ ] Rotate credential đã xuất hiện trong `.rcappsconfig`.
- [ ] Tạo `.rcappsconfig.example`; bỏ track file thật và thêm ignore trong change riêng.
- [ ] Quyết định việc rewrite Git history; nếu thực hiện, yêu cầu cộng tác viên re-clone.
- [ ] Ghi lại Compose config, image versions, volumes và commit.
- [ ] Drain queue, dừng `rocketchat`/`backend`/`worker` để tạo writer-freeze chung trước backup đa storage.
- [ ] Tạo MongoDB dump nhất quán bằng full-instance `mongodump --oplog`; lưu ngoài worktree, mã hóa và thử restore tách biệt.
- [ ] Sao lưu Postgres, `ragchat-uploads`, `rocketchat-uploads`, cấu hình/secret ngoài Git và MinIO nếu MinIO được bật.
- [ ] Ghi checksum, ACL, nơi lưu, thời hạn retention và người chịu trách nhiệm xóa từng backup.

**Checkpoint:** credential cũ vô hiệu; restore test đạt; chưa đổi workspace/database.

### Giai đoạn 1 — Khôi phục App trên stack hiện tại

- [ ] Xác minh/bật Apps Framework và Development Mode nếu 6.13 yêu cầu.
- [ ] `npm ci` và `npx tsc --noEmit`.
- [ ] Package App, lưu artifact kèm version/commit.
- [ ] Deploy bằng admin/PAT hợp lệ hoặc upload ZIP.
- [ ] Đặt Backend URL = `http://backend:8000`.
- [ ] Xác minh App Enabled, bot `ragchat.bot` và năm slash commands.
- [ ] Smoke test DM, channel, commands và document upload.

**Checkpoint:** RAGChat hoạt động; chưa đổi API auth/chưa nâng database.

### Giai đoạn 2 — API authentication

- [ ] Tạo API key ngẫu nhiên, lưu ngoài Git.
- [ ] Điền API Key vào App trước; backend chưa enforce nên header thêm không gây lỗi.
- [ ] Đặt cùng giá trị vào backend `API_KEY`.
- [ ] Recreate `backend` và `worker`.
- [ ] Xác minh thiếu/sai token tới `/api/*` trả 401.
- [ ] Xác minh App vẫn chat/search/upload được.
- [ ] Giữ `/health` không yêu cầu token.
- [ ] Production: bỏ publish 8000 hoặc bind `127.0.0.1` nếu host access còn cần.

**Checkpoint:** API auth hoạt động; không có secret trong Git/logs.

### Giai đoạn 3 — Nâng Rocket.Chat/MongoDB

**Target đề xuất tại 30/08/2026:** Rocket.Chat 8.5.3 LTS, MongoDB 8.x exact patch/digest đã kiểm thử. Rocket.Chat 7.10.15 chỉ là bridge tạm thời.

1. Dựng staging từ restore production.
2. Xác minh workspace plan/private app entitlement.
3. Xác minh FCV 5.0 → nâng binary MongoDB 5 → 6 khi Rocket.Chat còn ở 6.13 → burn-in → promote FCV 6.0.
4. Rocket.Chat 6.13 → 7.10.15 bridge; kiểm tra trên MongoDB 6.
5. Xác minh FCV 6.0 → nâng binary MongoDB 6 → 7 → burn-in với Rocket.Chat 7/RAGChat → promote FCV 7.0.
6. **Maintenance window cuối:** drain queue, dừng Rocket.Chat/backend/worker → tạo backup/checksum đa storage → xác minh FCV 7.0 → nâng MongoDB 7 → 8 nhưng giữ FCV 7.0 → nâng Rocket.Chat lên 8.5.3 → chỉ sau đó khởi động và smoke test.
7. Burn-in Rocket.Chat 8/MongoDB 8 trước khi nâng FCV; chỉ nâng FCV khi quyết định không rollback binary.
8. Chỉ triển khai production sau khi staging đạt toàn bộ nghiệm thu.

Không chạy/smoke-test Rocket.Chat 7 trên MongoDB 8 như một checkpoint bình thường vì tổ hợp đó không nằm trong compatibility matrix công bố.

### Bảng version freeze bắt buộc trước khi thực hiện Giai đoạn 3

| Checkpoint | Version series | Exact tag | Image digest | Release notes đã review |
| --- | --- | --- | --- | --- |
| Hiện tại | Rocket.Chat 6.13 / MongoDB 5 | Ghi từ runtime | Ghi từ `RepoDigests` | [ ] |
| Bridge A | MongoDB 6 | **Phải điền trước change** | **Phải điền** | [ ] |
| Bridge B | Rocket.Chat 7.10.15 | `7.10.15` | **Phải điền** | [ ] |
| Bridge C | MongoDB 7 | **Phải điền trước change** | **Phải điền** | [ ] |
| Đích database | MongoDB 8.x tương thích | **Phải điền trước change** | **Phải điền** | [ ] |
| Đích workspace | Rocket.Chat 8.5.3 LTS | `8.5.3` | **Phải điền** | [ ] |

Không được thực thi nếu bảng trên còn ô “Phải điền”. Lấy digest sau khi pull artifact đã duyệt:

```powershell
docker image inspect <image:exact-tag> --format '{{index .RepoDigests 0}}'
```

Mỗi dòng MongoDB áp dụng đồng thời cho cả service `mongo` và `mongo-init`; hai service phải dùng cùng exact tag/digest ở checkpoint đó. Rollback override cũng phải pin cả hai.

Quy tắc:

- Pin exact image; không dùng `latest` cho production.
- Image hiện tại `mongo:5` chỉ pin major và không tái lập được; phải ghi lại digest hiện chạy trước mọi thay đổi.
- Chưa nâng FCV cho đến khi binary mới ổn định và backup checkpoint đã lưu.
- Trước binary major kế tiếp, FCV phải được promote hoàn tất ở major liền trước: 6.0 trước 7.x, 7.0 trước 8.x.
- Không chạy binary cũ trên volume đã migration/FCV mới.
- Rollback bằng volume sạch + restore dump tương ứng.
- Kiểm tra lại Apps Engine API compatibility trên version đích.

### Giai đoạn 4 — Docker/storage hardening

- [ ] Thêm backend healthcheck.
- [ ] Pin MinIO, Prometheus và Grafana.
- [ ] Chuyển credential mặc định Postgres/MinIO/Grafana ra secret ngoài Compose.
- [ ] Chỉ publish port cần thiết; database/cache không public trong production.
- [ ] Chọn local volume hoặc MinIO làm storage chính thức.
- [ ] Nếu dùng MinIO: `USE_MINIO=true`, bucket/credential riêng, test persistence/restore.
- [ ] Bổ sung monitoring Rocket.Chat/MongoDB và alert cho App/backend.

---

## 7. Runbook Deploy RAGChat App

### 7.1 Baseline và backup

Backup có thể chứa user, password hash, token, message và App settings. Dùng thư mục mã hóa **nằm ngoài repository**, ví dụ `<secure-backup-dir>`; giới hạn ACL chỉ cho operator/backup service.

Trước khi tạo checkpoint phối hợp:

1. Ngừng nhận upload/request mới.
2. Đợi ARQ queue về 0 hoặc ghi lại các job phải reconcile.
3. Dừng tất cả writer và ghi timestamp bắt đầu snapshot.

```powershell
docker compose -f docker/docker-compose.yml ps
docker exec ragchat-mongo mongosh --quiet --eval "db.version()"
docker exec ragchat-mongo mongosh --quiet --eval "rs.status().members.map(m => ({ name: m.name, state: m.stateStr }))"
docker compose -f docker/docker-compose.yml stop rocketchat backend worker

docker exec ragchat-mongo mongodump --archive=/tmp/ragchat-mongo.archive.gz --gzip --oplog
docker cp ragchat-mongo:/tmp/ragchat-mongo.archive.gz "<secure-backup-dir>\ragchat-mongo.archive.gz"
docker exec ragchat-mongo rm -f /tmp/ragchat-mongo.archive.gz
Get-FileHash "<secure-backup-dir>\ragchat-mongo.archive.gz" -Algorithm SHA256

docker exec ragchat-postgres pg_dump -U ragchat -d ragchat -Fc -f /tmp/ragchat-postgres.dump
docker cp ragchat-postgres:/tmp/ragchat-postgres.dump "<secure-backup-dir>\ragchat-postgres.dump"
docker exec ragchat-postgres rm -f /tmp/ragchat-postgres.dump
Get-FileHash "<secure-backup-dir>\ragchat-postgres.dump" -Algorithm SHA256

docker run --rm --mount type=volume,src=ragchat-uploads,dst=/source,readonly --mount type=bind,src="<secure-backup-dir>",dst=/backup <approved-backup-image@sha256:digest> tar -czf /backup/ragchat-uploads.tar.gz -C /source .
docker run --rm --mount type=volume,src=ragchat-rocketchat-uploads,dst=/source,readonly --mount type=bind,src="<secure-backup-dir>",dst=/backup <approved-backup-image@sha256:digest> tar -czf /backup/ragchat-rocketchat-uploads.tar.gz -C /source .

Get-FileHash "<secure-backup-dir>\ragchat-uploads.tar.gz" -Algorithm SHA256
Get-FileHash "<secure-backup-dir>\ragchat-rocketchat-uploads.tar.gz" -Algorithm SHA256

docker compose -f docker/docker-compose.yml up -d backend worker rocketchat
```

`--oplog` yêu cầu full-instance dump; không kết hợp với `--db`. Nếu không dùng `--oplog`, phải dừng toàn bộ writer trước dump và ghi rõ downtime.

Nếu MinIO active, dừng writer/MinIO trong cùng freeze và snapshot `ragchat-miniodata` hoặc dùng object-store backup nhất quán đã được nhà vận hành phê duyệt. Sao lưu `.env`, Compose đã render và config triển khai dưới dạng mã hóa, không commit.

Yêu cầu:

- Backup nằm ngoài worktree, có checksum, encryption-at-rest, ACL và retention.
- Container không còn bản tạm trong `/tmp`.
- Restore drill chạy trên container/volume sạch và tách biệt.
- Kết quả restore được kiểm tra bằng record counts, login/smoke test và checksum artifact.
- Nếu không thể dừng writer, phải ghi rõ RPO, dùng cơ chế snapshot nhất quán của storage và có reconciliation procedure cho job/upload dở dang; không được gọi các file dump rời rạc là atomic checkpoint.

### 7.1.1 Restore drill tối thiểu

Chỉ chạy với `<clean-mongo-restore-container>` và `<clean-postgres-restore-container>` trỏ tới database/volume sạch, không phải production đang chạy:

```powershell
docker cp "<secure-backup-dir>\ragchat-mongo.archive.gz" <clean-mongo-restore-container>:/tmp/restore.archive.gz
docker exec <clean-mongo-restore-container> mongorestore --archive=/tmp/restore.archive.gz --gzip --oplogReplay --drop
docker exec <clean-mongo-restore-container> rm -f /tmp/restore.archive.gz

docker cp "<secure-backup-dir>\ragchat-postgres.dump" <clean-postgres-restore-container>:/tmp/restore.dump
docker exec <clean-postgres-restore-container> pg_restore -U ragchat -d ragchat --clean --if-exists /tmp/restore.dump
docker exec <clean-postgres-restore-container> rm -f /tmp/restore.dump
```

Không coi backup hợp lệ nếu chưa hoàn tất restore drill và post-restore verification.

### 7.2 CLI authentication an toàn

Ưu tiên PAT/User ID nếu được hỗ trợ. File thật phải untracked:

```json
{
  "url": "http://localhost:3001",
  "userId": "<admin_user_id>",
  "token": "<personal_access_token>"
}
```

Nếu buộc dùng username/password, dùng credential tạm thời và rotate sau deploy. Không ghi giá trị thật trong script/tài liệu.

### 7.3 Typecheck và package

Apps CLI hiện chưa nằm trong `package.json`. Fix bền vững là pin exact CLI trong `devDependencies`/lockfile:

```powershell
npm install --save-dev --save-exact "@rocket.chat/apps-cli@1.14.0"
```

Sau khi change pin CLI được review/merge:

```powershell
npm ci
npx tsc --noEmit
.\node_modules\.bin\rc-apps.cmd --version
.\node_modules\.bin\rc-apps.cmd package
Get-ChildItem .\dist\*.zip
tar -tf .\dist\<ragchat-artifact>.zip
```

Expected:

- TypeScript không lỗi.
- CLI version đúng `1.14.0` hoặc version exact đã được version-freeze thay thế.
- `dist/` có ZIP RAGChat mới.
- ZIP không chứa `.env`, `.rcappsconfig`, backend/Docker data.

### 7.4 Cho phép cài private app trên 6.13

1. Đăng nhập admin.
2. Mở **Administration/Manage → Settings → General → Apps**; tên menu có thể khác theo UI.
3. Xác minh **Enable the Apps Framework = True**.
4. Bật **Enable development mode = True** nếu manual install bị chặn.
5. Lưu thay đổi.

Development Mode chỉ bật trong development/change window được kiểm soát.

### 7.5 Deploy

CLI với `.rcappsconfig` untracked:

```powershell
.\node_modules\.bin\rc-apps.cmd deploy
```

Hoặc Web UI:

1. **Marketplace → Explore → Private Apps**.
2. **Upload Private App**.
3. Chọn ZIP trong `dist/`.
4. Review permissions và cài đặt.

### 7.6 Cấu hình App

| Setting | Giá trị Compose hiện tại |
| --- | --- |
| Backend URL | `http://backend:8000` |
| API Key | Trống tạm thời nếu backend chưa bật; sau đó thực hiện Giai đoạn 2 |
| Model | Hiện chỉ là setting hiển thị; backend config mới là nguồn authoritative |
| Embedding Model | Hiện chỉ là setting hiển thị; backend config mới là nguồn authoritative |
| Max Conversation History | Theo nhu cầu; default 10 |

Lưu settings và đảm bảo App **Enabled**.

Sau khi deploy và smoke test thành công, khôi phục **Enable development mode** về giá trị đã được phê duyệt trước change window (thông thường là `False`). Ghi lại giá trị trước/sau trong change record; không để Development Mode bật thường trực trên production. Chỉ thay đổi **Enable the Apps Framework** khi runbook/phiên bản Rocket.Chat yêu cầu.

### 7.7 Smoke test

Tìm bot `@ragchat.bot`, rồi chạy:

```text
/ask "Xin chào, bạn có thể giúp gì cho tôi?"
/search "tài liệu kiểm thử"
/summarize "Nội dung cần tóm tắt"
@ai start
@ai help
```

Upload một file nhỏ được hỗ trợ, kiểm tra document được index và có thể search/ask.

```powershell
docker logs --tail 200 ragchat-rocketchat
docker logs --tail 200 ragchat-backend
docker logs --tail 200 ragchat-worker
```

Expected:

- Không còn 401 khi deploy/gọi backend.
- Không còn request tới `localhost:8000`.
- Slash commands execute được.
- Bot phản hồi trong DM/channel/thread.
- Upload được index và query có citation khi bật.

---

## 8. Tiêu Chí Nghiệm Thu

### Phục hồi App

- [ ] RAGChat xuất hiện trong Private Apps và Enabled.
- [ ] MongoDB có app metadata và app user `ragchat.bot`.
- [ ] Backend URL = `http://backend:8000`.
- [ ] Năm slash commands hoạt động.
- [ ] `@ai start/help/stats/clear` hoạt động đúng ngữ cảnh.
- [ ] Upload → index → search/ask hoạt động end-to-end.
- [ ] Restart Rocket.Chat không làm mất App/settings.

### Bảo mật

- [ ] Credential cũ đã rotate.
- [ ] `.rcappsconfig` thật không còn được track.
- [ ] Không có secret mới trong diff/log/artifact.
- [ ] `/api/*` trả 401 khi thiếu/sai token sau Giai đoạn 2.
- [ ] App dùng đúng token và vẫn hoạt động.
- [ ] Development Mode đã được trả về giá trị production được phê duyệt (thông thường `False`).

### Docker và storage hardening

- [ ] Backend có Docker healthcheck thực và container đạt trạng thái `healthy`.
- [ ] Image production dùng exact tag/digest đã freeze; không dùng `latest` hoặc major-only tag.
- [ ] Credential mặc định của PostgreSQL, MinIO và Grafana đã được thay; secret không nằm trong Compose/Git.
- [ ] PostgreSQL, Redis, MinIO và backend không publish port rộng ra host; mọi ngoại lệ đã được firewall và ghi nhận.
- [ ] Storage mode đã được chọn rõ ràng; dữ liệu active có backup và restore test đạt.
- [ ] Monitoring/alerting tối thiểu đã bật cho container health, HTTP health, queue, database và disk capacity.

### Nâng cấp

- [ ] MongoDB/Rocket.Chat thuộc support window tại ngày triển khai.
- [ ] Replica set có PRIMARY và FCV đúng.
- [ ] Không có migration/unsupported-version error.
- [ ] Private app entitlement đã xác nhận.
- [ ] Backup mỗi checkpoint đã thử restore.
- [ ] RAGChat smoke test đạt sau mỗi major upgrade.

---

## 9. Rollback

### 9.1 Artifact matrix theo checkpoint

| Checkpoint | Artifact bắt buộc |
| --- | --- |
| CP0 — trước deploy App | Full Mongo `--oplog` dump, Postgres dump, hai upload volume, encrypted config, SHA256 |
| CP1 — trước bật API key | Checkpoint mới sau App smoke test: full Mongo `--oplog` dump, Postgres dump, hai upload volume, encrypted `.env` trước/sau, App settings export, App ZIP đã nghiệm thu, SHA256 |
| CP2 — trước mỗi Mongo/Rocket.Chat major | Full Mongo dump mới, volume snapshots, exact image tags/digests, FCV, Compose/config snapshot |
| CP3 — trước bridge 7→8 | Full Mongo `--oplog` dump mới, restore drill đạt, Rocket.Chat 7/Mongo 7 digests, private-app state |
| CP4 — sau burn-in 8.x | Backup mới trên version đích, FCV trước/sau, nghiệm thu và retention record |

Nếu MinIO active, thêm bucket/object backup và restore test. Nếu local uploads active, snapshot cả `ragchat-uploads` và `ragchat-rocketchat-uploads`.

Trước Giai đoạn 3 phải chuẩn bị và kiểm thử một Compose rollback override dùng volume sạch, ví dụ:

- `ragchat-mongodata-restore-<checkpoint>`.
- `ragchat-pgdata-restore-<checkpoint>`.
- `ragchat-uploads-restore-<checkpoint>`.
- `ragchat-rocketchat-uploads-restore-<checkpoint>`.

Không trỏ binary cũ vào volume đã chạy migration mới.

### 9.2 Rollback triggers

- Apps Engine không enable được App hoặc log có lỗi initialization/permission liên tục.
- Smoke test chat/upload thất bại sau khi Backend URL và authentication đã xác minh.
- MongoDB không có PRIMARY, FCV/migration lỗi hoặc Rocket.Chat báo unsupported database.
- Rocket.Chat migration lỗi, login/message/upload không đạt acceptance gate.
- Private App bị disable/chặn và workspace entitlement không thể khắc phục trong change window.

| Tình huống | Rollback |
| --- | --- |
| Deploy App lỗi, chưa đổi schema | Disable App; giữ artifact/log; sửa rồi redeploy |
| Backend URL sai | Khôi phục Backend URL trước; kiểm tra health; không uninstall |
| API key sai | Restore `.env`/backend `API_KEY` trước đó → force-recreate backend/worker → restore App API Key cùng giá trị → smoke test |
| App version mới lỗi | Deploy lại artifact trước nếu workspace cho phép |
| Upgrade lỗi trước migration | Quay lại checkpoint theo runbook đã thử |
| Migration/FCV đã đổi data | Không dùng binary cũ trên volume mới; volume sạch + restore dump |
| Private app bị chặn sau upgrade | Không uninstall; kiểm tra plan/license hoặc rollback checkpoint |

Mỗi rollback dùng backup tạo ngay trước change tương ứng; không dùng một dump cho toàn chuỗi.

API-auth rollback tối thiểu:

```powershell
# 1. Restore encrypted .env version của checkpoint ra vị trí runtime.
docker compose -f docker/docker-compose.yml up -d --force-recreate backend worker
# 2. Restore App API Key về cùng giá trị trước đó trong App Settings.
# 3. Verify /health, /api/* auth expectation và App smoke test.
```

Database rollback tối thiểu:

1. Dừng toàn bộ writer.
2. Tạo các volume `*-restore-<checkpoint>` sạch.
3. Dùng rollback override để gắn volume sạch và exact image digest của checkpoint.
4. Restore Mongo/Postgres/uploads bằng artifact cùng checkpoint.
5. Kiểm tra checksum, record counts, replica set, FCV và login.
6. Chỉ chuyển traffic sau smoke test; giữ nguyên volume lỗi để điều tra.

---

## 10. Ma Trận Troubleshooting

| Triệu chứng | Kiểm tra | Xử lý |
| --- | --- | --- |
| CLI `401 Unauthorized` | Credential, admin role, URL | Dùng credential hiện hành/PAT; không dùng config cũ |
| Upload private app bị chặn | Dev Mode, plan, version/EOL | Bật dev mode có kiểm soát; kiểm tra entitlement |
| App cài nhưng không có commands | App Enabled, Apps logs, manifest/API | Enable/redeploy; kiểm tra artifact |
| Không tìm thấy bot | Tìm `ragchat.bot`, app metadata | `@ai` là prefix, không phải username |
| Backend unavailable | URL, DNS, health, API key | Dùng `http://backend:8000`; đồng bộ key |
| Backend 401 | App key khác backend key | Cập nhật hai phía cùng secret |
| Upload không index | Backend/worker log, Redis, file type | Sửa job/dependency; thử file nhỏ |
| Restart mất file | `USE_MINIO`, volume, storage mode | Xác minh persistence; mô tả đúng storage |

---

## 11. File Liên Quan

| File | Vai trò |
| --- | --- |
| `docker/docker-compose.yml` | Services, network, ports, volumes, image versions |
| `RagChatApp.ts` | Entrypoint và đăng ký handlers/commands/API |
| `app.json` | App ID, `nameSlug`, permissions, required Apps API |
| `src/settings/Settings.ts` | Backend URL, API Key và model settings |
| `src/lib/BackendClient.ts` | HTTP client/Bearer auth tới backend |
| `src/constants/Commands.ts` | Slash commands và prefix `@ai` |
| `backend/src/api/deps.py` | Enforce Bearer token khi `API_KEY` có giá trị |
| `.env` / `.env.example` | Backend config; `.env` không commit |
| `.rcappsconfig` | CLI auth cục bộ; không commit/đưa vào artifact |

---

## 12. Tài Liệu Chính Thức

- [Rocket.Chat — Version Durability](https://docs.rocket.chat/docs/version-durability)
- [Rocket.Chat — Support Prerequisites](https://docs.rocket.chat/docs/support-prerequisites)
- [Rocket.Chat — System Requirements](https://docs.rocket.chat/docs/system-requirements)
- [Rocket.Chat — Guidelines for Updating Rocket.Chat](https://docs.rocket.chat/docs/guidelines-for-updating-rocketchat)
- [Rocket.Chat — Docker/Compose và MongoDB update](https://docs.rocket.chat/deploy-with-docker-docker-compose)
- [Rocket.Chat Developer — Create/deploy/package App](https://developer.rocket.chat/docs/create-an-app)
- [Rocket.Chat — Manage Private Apps](https://docs.rocket.chat/rocketchat-private-apps)
- [Rocket.Chat — Marketplace limits](https://docs.rocket.chat/docs/rocketchat-marketplace)
- [MongoDB — Upgrade a Replica Set 5.0 → 6.0](https://www.mongodb.com/docs/v6.0/release-notes/6.0-upgrade-replica-set/)
- [MongoDB — Upgrade a Replica Set 6.0 → 7.0](https://www.mongodb.com/docs/v7.0/release-notes/7.0-upgrade-replica-set/)
- [MongoDB — Upgrade a Replica Set 7.0 → 8.0](https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-replica-set/)
- [MongoDB Database Tools — mongodump và consistent backup](https://www.mongodb.com/docs/database-tools/mongodump/)

---

## 13. Kết Luận

Backend và Docker network hiện hoạt động. Sự cố được giải thích bởi App chưa được cài, tiếp theo là Backend URL và credential deploy không hợp lệ.

Chuỗi xử lý an toàn: **rotate credential → backup/baseline → deploy App → cấu hình `http://backend:8000` → smoke test → bật API key → nâng Rocket.Chat/MongoDB theo checkpoint**. Chỉ khi nghiệm thu và restore test đều đạt mới coi hệ thống sẵn sàng cho production.
