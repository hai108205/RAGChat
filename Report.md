# Báo Cáo Đánh Giá Và Phương Án Khắc Phục Cấu Hình Docker Rocket.Chat

## 1. Phạm vi và cơ sở đánh giá

Báo cáo này đánh giá cấu hình trong thư mục `docker/` theo trạng thái hiện tại và đối chiếu với tài liệu chính thức:

- [Deploy with Docker and Docker Compose](https://docs.rocket.chat/deploy-with-docker-docker-compose)
- [Guidelines for Updating Rocket.Chat](https://docs.rocket.chat/v1/docs/guidelines-for-updating-rocketchat)
- [Rocket.Chat Version Durability](https://docs.rocket.chat/docs/version-durability)
- [Rocket.Chat system requirements](https://docs.rocket.chat/docs/system-requirements)
- [Rocket.Chat file upload settings](https://docs.rocket.chat/docs/file-upload)
- [Rocket.Chat MinIO setup](https://docs.rocket.chat/docs/minio)
- [MongoDB lifecycle](https://www.mongodb.com/legal/support-policy/lifecycles)

Phạm vi hiện tại gồm các vấn đề 1–5 và 7 của báo cáo ban đầu. Hai nội dung sau được tạm hoãn:

- Vấn đề 6: NATS/message broker.
- Vấn đề 8: reverse proxy và TLS.

Kết quả `docker compose -f docker/docker-compose.yml config --quiet` thành công, do đó file Compose hợp lệ về cú pháp. Báo cáo chủ yếu xác minh cấu hình tĩnh; các setting đã lưu trong MongoDB cần được kiểm tra thêm trên workspace đang chạy.

## 2. Thứ tự xử lý đề xuất

| Ưu tiên | Hạng mục | Mục tiêu |
| --- | --- | --- |
| P0 | Sao lưu và lập kế hoạch nâng cấp | Có bản phục hồi đã kiểm chứng trước mọi thay đổi dữ liệu |
| P1 | MongoDB 5.0 EOL | Đưa cơ sở dữ liệu qua các major version tương thích |
| P1 | Rocket.Chat 6.13 EOL | Nâng tuần tự 6.x → 7.x → 8.x, không bỏ qua major version |
| P2 | File upload/MinIO | Chuyển upload production khỏi GridFS nếu có nhu cầu vận hành thực tế |
| P2 | Monitoring | Thu thập metrics Rocket.Chat, MongoDB và log tập trung |
| P3 | `Dockerfile.app` | Loại bỏ cấu hình chết hoặc tách rõ workflow development |

Không nên nâng Rocket.Chat, đổi image MongoDB và chuyển file storage trong cùng một lần triển khai. Mỗi giai đoạn phải có backup, kiểm tra dữ liệu và điểm rollback riêng.

---

## 3. Các vấn đề đã hiệu chỉnh và phương án giải quyết

### 🔴 Vấn đề 1: Rocket.Chat 6.13.0 đã EOL

#### Kết luận đã xác minh

- **Vị trí:** `docker/docker-compose.yml`, service `rocketchat`.
- **Hiện trạng:** `image: rocketchat/rocket.chat:6.13.0`.
- Rocket.Chat 6.13.0 phát hành ngày 10/10/2024; dòng 6.13 hết hỗ trợ ngày 30/04/2025.
- Báo cáo cũ ghi “Q1/2024” là sai.
- Sau EOL, dòng phiên bản không còn nhận bản vá bảo mật hoặc sửa lỗi chính thức. Các dịch vụ phụ thuộc Rocket.Chat Cloud có thể ngừng hoạt động; mobile/desktop client chính thức cũng có thể mất khả năng kết nối.

#### Mức độ ảnh hưởng

**Cao.** Đây là rủi ro bảo mật và tương thích trực tiếp. Việc tiếp tục dùng image cố định 6.13.0 cũng bỏ qua bản vá cuối của chính dòng 6.13.

#### Mục tiêu

Nâng đến một bản 8.x còn hỗ trợ, ưu tiên một bản LTS còn support nếu môi trường cần ổn định dài hạn. Phải chọn **exact version**, không dùng `latest`.

#### Phương án giải quyết

Rocket.Chat yêu cầu nâng tuần tự qua từng major version. Không nâng trực tiếp từ 6.13 lên 8.x.

1. **Khảo sát trước nâng cấp**
   - Ghi nhận phiên bản Rocket.Chat, MongoDB và Feature Compatibility Version (FCV).
   - Xuất danh sách Apps đã cài, integration, OAuth, SMTP và các setting quan trọng.
   - Kiểm tra release notes và MongoDB compatibility của từng phiên bản đích.
   - Chọn một 7.x làm phiên bản chuyển tiếp và một 8.x còn support làm đích cuối.

2. **Sao lưu trước mỗi major step**

   ```bash
   docker exec ragchat-mongo sh -c 'mongodump --archive' > rocketchat-before-upgrade.dump
   ```

   Xác minh file không rỗng và thực hiện thử `mongorestore` vào một MongoDB tách biệt. Một file dump chưa từng thử restore chưa được xem là phương án rollback hoàn chỉnh.

3. **Nâng MongoDB lên phiên bản mà Rocket.Chat 6.13 còn hỗ trợ**
   - Thực hiện phần xử lý của Vấn đề 2 trước.
   - Không chuyển Rocket.Chat 6.13 sang MongoDB 8 trực tiếp.

4. **Nâng Rocket.Chat 6.x → 7.x**
   - Thay image bằng exact patch release 7.x đã chọn.
   - Giữ nguyên volume MongoDB.
   - Khởi động chỉ Rocket.Chat sau khi MongoDB healthy.
   - Theo dõi migration log đến khi hoàn tất; không dừng container giữa migration.

5. **Chuẩn bị MongoDB 8.x**
   - Nâng MongoDB tuần tự theo hướng dẫn ở Vấn đề 2.
   - Rocket.Chat 8.x yêu cầu MongoDB 8.0 trở lên; release notes hiện hành đã xác minh với MongoDB 8.2.

6. **Nâng Rocket.Chat 7.x → 8.x**
   - Chỉ thực hiện sau khi MongoDB đã ở phiên bản được release 8.x đích hỗ trợ.
   - Pin image, ví dụ theo mẫu:

   ```yaml
   services:
     rocketchat:
       image: registry.rocket.chat/rocketchat/rocket.chat:<exact-supported-version>
   ```

7. **Kiểm tra sau từng bước**
   - `docker compose ps` cho thấy Rocket.Chat và MongoDB healthy/running.
   - Đăng nhập được bằng tài khoản quản trị và người dùng thường.
   - Gửi tin nhắn, upload/download file và tìm kiếm hoạt động bình thường.
   - App RAGChat tải được, nhận event và gọi backend thành công.
   - Không có migration error hoặc MongoDB compatibility warning trong log.
   - Administration → Workspace hiển thị đúng phiên bản và support window.

#### Rollback

- Không hạ image Rocket.Chat hoặc MongoDB trên cùng data volume nếu migration đã thay đổi schema/FCV.
- Dừng stack, tạo volume MongoDB sạch, chạy lại phiên bản cũ và restore bản dump tương ứng.
- Luôn giữ riêng backup của từng checkpoint: trước MongoDB upgrade, trước 7.x và trước 8.x.

---

### 🔴 Vấn đề 2: MongoDB 5.0 đã EOL

#### Kết luận đã xác minh

- **Vị trí:** `docker/docker-compose.yml`, services `mongo` và `mongo-init`.
- **Hiện trạng:** cả hai dùng `mongo:5`.
- MongoDB 5.0 đã EOL ngày 31/10/2024.
- Rocket.Chat 6.x có thể chạy với MongoDB 5.0/6.0, nhưng Rocket.Chat 8.x yêu cầu MongoDB 8.0 trở lên.
- Câu cũ “bản mới yêu cầu MongoDB 6.0 hoặc 8.0” không còn chính xác vì MongoDB 6.0 cũng đã EOL.

#### Mức độ ảnh hưởng

**Cao.** MongoDB không còn bản vá upstream và là blocker trực tiếp cho nâng cấp Rocket.Chat.

#### Mục tiêu

Chuyển từ MongoDB 5 qua từng major version cần thiết đến MongoDB 8.x tương thích với Rocket.Chat đích, đồng thời giữ nguyên tính toàn vẹn của replica set và dữ liệu.

#### Phương án giải quyết

1. **Kiểm tra trạng thái hiện tại**

   ```bash
   docker exec -it ragchat-mongo mongosh --eval "db.version()"
   docker exec -it ragchat-mongo mongosh --eval "db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})"
   docker exec -it ragchat-mongo mongosh --eval "rs.status()"
   ```

2. **Tạo và thử phục hồi backup**

   ```bash
   docker exec ragchat-mongo sh -c 'mongodump --archive' > mongodb-5-before-upgrade.dump
   ```

3. **Nâng tuần tự**
   - Giai đoạn A: MongoDB 5 → 6 trong khi Rocket.Chat vẫn ở 6.13.
   - Giai đoạn B: nâng Rocket.Chat lên 7.x.
   - Giai đoạn C: MongoDB 6 → 7, xác minh ổn định và FCV.
   - Giai đoạn D: MongoDB 7 → 8.x theo compatibility của Rocket.Chat 8.x đích.
   - Giai đoạn E: nâng Rocket.Chat 7.x → 8.x.

   Không bỏ qua major version MongoDB. Sau mỗi lần đổi binary, đợi database ổn định, kiểm tra replica set và chỉ nâng FCV khi đã quyết định không rollback binary ở checkpoint đó.

4. **Chuyển sang image được official stack sử dụng**

   Mẫu cấu hình đích:

   ```yaml
   services:
     mongo:
       image: mongodb/mongodb-community-server:<version>-ubi8
       command: mongod --replSet rs0 --bind_ip_all

     mongo-init:
       image: mongodb/mongodb-community-server:<same-version>-ubi8
   ```

   `mongo` và `mongo-init` phải luôn dùng cùng phiên bản. Cần kiểm tra UID/quyền sở hữu của `mongodata` trước khi đổi từ Docker Official Image `mongo` sang `mongodb-community-server`; official Rocket.Chat compose có container riêng để sửa quyền volume.

5. **Không thực hiện in-place khi chưa kiểm chứng quyền volume**

   Phương án an toàn hơn nếu staging phát hiện lỗi permission hoặc format volume:
   - Tạo volume MongoDB mới.
   - Khởi chạy replica set mới bằng image đích.
   - Restore bản `mongodump`.
   - Kiểm tra dữ liệu rồi mới chuyển Rocket.Chat sang database mới.

6. **Kiểm tra sau mỗi major version**

   ```bash
   docker exec -it ragchat-mongo mongosh --eval "db.version()"
   docker exec -it ragchat-mongo mongosh --eval "db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})"
   docker exec -it ragchat-mongo mongosh --eval "db.runCommand({connectionStatus: 1})"
   docker exec -it ragchat-mongo mongosh --eval "rs.status().members.map(m => ({name:m.name,stateStr:m.stateStr}))"
   ```

   MongoDB phải có PRIMARY, không có collection migration error và Rocket.Chat không báo lỗi MongoDB unsupported.

---

### 🟢 Vấn đề 3 đã hiệu chỉnh: Không thiếu volume `/app/uploads` trong cấu hình GridFS hiện tại

#### Kết luận đã xác minh

- Service `rocketchat` không mount `/app/uploads`.
- Tuy nhiên, Rocket.Chat mặc định dùng GridFS; upload được lưu trong MongoDB.
- MongoDB đã có named volume `mongodata:/data/db`, nên upload GridFS được bảo toàn cùng database.
- Do đó, việc thiếu `/app/uploads` **không phải lỗi dữ liệu trong cấu hình hiện tại**.
- Chỉ khi chọn `FileSystem` làm Storage Type thì đường dẫn filesystem mới cần persistent volume.

#### Mức độ ảnh hưởng

**Không có lỗi tức thời.** Rủi ro thực tế là GridFS làm tăng tải và kích thước MongoDB khi workspace có nhiều file, không phải thiếu volume `/app/uploads`.

#### Phương án giải quyết

1. **Không thêm volume `/app/uploads` nếu chọn GridFS hoặc MinIO/S3**
   - Volume này không giải quyết tải GridFS.
   - Khi hoàn tất Vấn đề 7, file mới sẽ được lưu trên MinIO.

2. **Nếu tiếp tục dùng GridFS tạm thời**
   - Đảm bảo backup MongoDB bao gồm database `rocketchat` và các collection GridFS.
   - Theo dõi dung lượng `mongodata`.
   - Kiểm thử restore cả metadata và nội dung file.

3. **Chỉ dùng persistent upload volume khi chọn FileSystem**

   ```yaml
   services:
     rocketchat:
       volumes:
         - rocketchat-uploads:/app/uploads

   volumes:
     rocketchat-uploads:
       name: ragchat-rocketchat-uploads
   ```

   Đồng thời cấu hình Storage Type là `FileSystem` và System Path là `/app/uploads`. FileSystem không phải lựa chọn ưu tiên cho production nhiều instance vì volume cần được chia sẻ giữa các instance.

4. **Kiểm tra loại storage đang được lưu trong database**
   - Administration → Workspace → Settings → File Upload → Storage Type.
   - Hoặc truy vấn setting `FileUpload_Storage_Type` bằng API quản trị phù hợp.

#### Tiêu chí hoàn thành

- Báo cáo vận hành ghi rõ storage type đang dùng.
- Backup/restore tương ứng với storage type đã được thử nghiệm.
- Không thêm volume không cần thiết chỉ để che giấu rủi ro GridFS.

---

### 🟡 Vấn đề 4: Monitoring chỉ bao phủ Python backend

#### Kết luận đã xác minh

- `docker/prometheus/prometheus.yml` chỉ scrape `backend:8000` và Prometheus.
- Rocket.Chat chưa bật Prometheus exporter.
- Stack không có MongoDB exporter hoặc Loki.
- Báo cáo cũ ghi metrics Rocket.Chat ở port 9100 là sai; port mặc định của Rocket.Chat exporter là **9458**. Port 9100 thuộc Node Exporter trong official monitoring stack.
- Monitoring không phải điều kiện để Rocket.Chat khởi động, nhưng là thiếu sót vận hành đáng kể.

#### Mức độ ảnh hưởng

**Trung bình**, tăng lên **cao** nếu đây là hệ thống production: khó phát hiện suy giảm hiệu năng, kết nối realtime bất thường, MongoDB quá tải và lỗi lặp lại.

#### Phương án giải quyết

1. **Bật Rocket.Chat Prometheus exporter**

   Thêm vào service `rocketchat`:

   ```yaml
   environment:
     OVERWRITE_SETTING_Prometheus_Enabled: "true"
     OVERWRITE_SETTING_Prometheus_Port: "9458"
   expose:
     - "9458"
   ```

   Không cần publish `9458` ra host nếu Prometheus cùng Docker network.

2. **Thêm Rocket.Chat scrape target**

   ```yaml
   scrape_configs:
     - job_name: "rocketchat"
       static_configs:
         - targets: ["rocketchat:9458"]
           labels:
             service: "rocketchat"
   ```

3. **Thêm MongoDB exporter**

   Dùng Percona MongoDB Exporter tương tự official compose:

   ```yaml
   mongodb-exporter:
     image: percona/mongodb_exporter:<pinned-version>
     command:
       - --mongodb.uri=mongodb://mongo:27017
       - --collect-all
       - --compatible-mode
     depends_on:
       mongo:
         condition: service_healthy
     expose:
       - "9216"
     restart: unless-stopped
   ```

   Thêm target `mongodb-exporter:9216` vào Prometheus. Trong production có authentication, dùng tài khoản monitoring chỉ có quyền tối thiểu và truyền URI qua secret/env file, không ghi password trực tiếp vào Compose.

4. **Bổ sung log tập trung**
   - Thêm Loki và OpenTelemetry Collector theo `compose.monitoring.yml` chính thức.
   - Thu thập stdout/stderr của Rocket.Chat, MongoDB và backend.
   - Thêm Loki datasource vào Grafana.
   - Không phụ thuộc vào log bên trong Rocket.Chat; Rocket.Chat 8 chuyển logging sang tầng hạ tầng.

5. **Cập nhật dashboard**
   - Giữ dashboard RAGChat backend hiện tại.
   - Thêm dashboard Rocket.Chat, MongoDB và host/container.
   - Tạo alert tối thiểu cho: service down, MongoDB không có PRIMARY, HTTP error rate, event-loop lag, memory cao và disk gần đầy.

6. **Pin image monitoring**
   - Thay `prom/prometheus:latest` và `grafana/grafana:latest` bằng exact versions đã kiểm thử.
   - Điều này tránh dashboard hoặc cấu hình bị phá vỡ bởi update ngoài kế hoạch.

#### Kiểm tra sau cấu hình

- Mở Prometheus → Status → Targets: `backend`, `rocketchat`, `mongodb-exporter` đều `UP`.
- Truy vấn một metric Rocket.Chat và một metric MongoDB trả về dữ liệu.
- Grafana hiển thị metrics mới và truy vấn được log từ Loki.
- Dừng thử một service trên staging và xác nhận alert được kích hoạt.

---

### 🟡 Vấn đề 5: `Dockerfile.app` không được Compose sử dụng

#### Kết luận đã xác minh

- `docker-compose.yml` dùng trực tiếp `rocketchat/rocket.chat:6.13.0`, không có `build` cho Rocket.Chat.
- Vì vậy, hai biến trong `Dockerfile.app` và lệnh tạo `/app/data` không có hiệu lực.
- `Dockerfile.app` tự ghi rõ dành cho development/testing và không cài RAGChat App; App vẫn phải được deploy bằng `rc-apps deploy` hoặc Admin UI.
- Setup Wizard khi dùng database mới là hành vi bình thường. Tạo lại container với cùng MongoDB không bắt buộc chạy Wizard lại vì trạng thái workspace nằm trong database.

#### Mức độ ảnh hưởng

**Thấp đến trung bình.** Đây chủ yếu là cấu hình chết và gây hiểu nhầm. Việc dùng `latest` trong Dockerfile cũng tạo rủi ro nếu file này được kích hoạt về sau.

#### Phương án khuyến nghị: không dùng custom Rocket.Chat image trong production

1. Pin official Rocket.Chat image trong Compose.
2. Đặt setting cần thiết trong `environment` của service Rocket.Chat.
3. Giữ Setup Wizard cho lần khởi tạo workspace đầu tiên.
4. Deploy RAGChat App sau khi Rocket.Chat sẵn sàng bằng pipeline/API riêng.
5. Xóa `Dockerfile.app` nếu không còn workflow nào sử dụng, hoặc đổi tên/ghi tài liệu rõ rằng nó chỉ là development artifact.

Ví dụ cấu hình rõ ràng hơn:

```yaml
services:
  rocketchat:
    image: registry.rocket.chat/rocketchat/rocket.chat:<exact-version>
    environment:
      ROOT_URL: http://localhost:3001
      MONGO_URL: mongodb://mongo:27017/rocketchat?replicaSet=rs0
      DEPLOY_METHOD: docker
      ROCKETCHAT_APP_URL: http://backend:8000
```

`ROCKETCHAT_APP_URL` chỉ có tác dụng nếu code App thực sự đọc biến hoặc setting này. Việc khai báo biến trong container Rocket.Chat không tự động truyền nó vào Apps Engine App.

#### Phương án thay thế cho development tự động

Nếu cần bỏ Wizard trong môi trường test dùng database mới, tạo Compose override riêng:

```yaml
# docker/docker-compose.dev.yml
services:
  rocketchat:
    build:
      context: .
      dockerfile: Dockerfile.app
      args:
        ROCKETCHAT_VERSION: <exact-version>
```

Sửa Dockerfile để pin version thay vì `latest`:

```dockerfile
ARG ROCKETCHAT_VERSION
FROM registry.rocket.chat/rocketchat/rocket.chat:${ROCKETCHAT_VERSION}

ENV OVERWRITE_SETTING_Show_Setup_Wizard=completed
```

Chỉ chạy override này ở development/test. Không hardcode tài khoản quản trị hoặc tự động bỏ Wizard trong production.

#### Kiểm tra sau xử lý

- `docker compose config` cho thấy đúng image hoặc build path dự kiến.
- `docker image inspect` xác nhận version chính xác, không phải `latest`.
- Với database cũ: workspace khởi động mà không chạy lại Wizard.
- Với database test mới: hành vi Wizard đúng theo profile đã chọn.
- RAGChat App được deploy và gọi được `http://backend:8000` từ Docker network.

---

### 🟡 Vấn đề 7: MinIO tồn tại nhưng Rocket.Chat chưa được cấu hình sử dụng

#### Kết luận đã xác minh

- Stack có service MinIO và volume `miniodata`.
- Service Rocket.Chat không có setting `FileUpload_Storage_Type` hoặc `FileUpload_S3_*`.
- Nếu database chưa được cấu hình thủ công, Rocket.Chat tiếp tục dùng GridFS.
- Cờ `.env` hiện là `USE_MINIO=false`, nên backend Python cũng chưa sử dụng MinIO dù endpoint và credential đã được khai báo trong Compose.
- Cấu hình tĩnh không thể loại trừ khả năng administrator đã thay đổi storage type trong database; cần kiểm tra UI/API runtime.

#### Mức độ ảnh hưởng

**Trung bình.** GridFS hoạt động nhưng làm MongoDB lớn và tăng tải. Việc chạy MinIO nhưng không sử dụng cũng tăng bề mặt vận hành mà không đem lại lợi ích.

#### Mục tiêu

Dùng MinIO làm S3-compatible storage cho Rocket.Chat production và, nếu phù hợp, cho backend RAGChat; giữ bucket và lifecycle tách biệt giữa hai hệ thống.

#### Phương án giải quyết

1. **Kiểm tra trạng thái hiện tại**
   - Administration → Workspace → Settings → File Upload.
   - Ghi nhận `Storage Type` và số lượng file hiện có trong GridFS.
   - Không chuyển storage trước khi có backup MongoDB.

2. **Tạo bucket riêng cho Rocket.Chat**

   Không dùng chung bucket/prefix với tài liệu RAG của backend. Ví dụ bucket `rocketchat-uploads`.

   Có thể thêm init service:

   ```yaml
   minio-init:
     image: minio/mc:<pinned-version>
     depends_on:
       minio:
         condition: service_healthy
     entrypoint: >
       /bin/sh -c "
       mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD;
       mc mb --ignore-existing local/rocketchat-uploads;
       "
     environment:
       MINIO_ROOT_USER: ${MINIO_ROOT_USER}
       MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
   ```

   Chuyển credential mặc định khỏi Compose sang `.env`/Docker secrets và thay credential hiện tại trước khi dùng production.

3. **Cấu hình qua Admin UI trước trên staging**

   Trong File Upload:

   - Storage Type: `AmazonS3`
   - Bucket: `rocketchat-uploads`
   - Access Key/Secret Key: credential dành riêng cho Rocket.Chat
   - Region: cùng region được khai báo trong MinIO, thường là `us-east-1`
   - Bucket URL: endpoint MinIO có thể truy cập đúng từ mô hình triển khai
   - Force Path Style: `true`
   - Signature Version: ưu tiên `v4`; chỉ dùng `v2` nếu phiên bản MinIO/Rocket.Chat cụ thể yêu cầu

   Endpoint dùng trong Bucket URL phải phù hợp cả đường upload server-side và đường download của client. Không dùng `http://minio:9000` cho URL mà trình duyệt bên ngoài Docker phải truy cập. Khi triển khai production, MinIO cần một endpoint HTTPS/DNS ổn định; phần reverse proxy/TLS đang được hoãn theo phạm vi báo cáo này.

4. **Sau khi staging hoạt động, quản lý bằng environment variables**

   Ví dụ tên setting:

   ```yaml
   environment:
     OVERWRITE_SETTING_FileUpload_Storage_Type: AmazonS3
     OVERWRITE_SETTING_FileUpload_S3_Bucket: rocketchat-uploads
     OVERWRITE_SETTING_FileUpload_S3_AWSAccessKeyId: ${ROCKETCHAT_MINIO_ACCESS_KEY}
     OVERWRITE_SETTING_FileUpload_S3_AWSSecretAccessKey: ${ROCKETCHAT_MINIO_SECRET_KEY}
     OVERWRITE_SETTING_FileUpload_S3_Region: us-east-1
     OVERWRITE_SETTING_FileUpload_S3_BucketURL: ${ROCKETCHAT_MINIO_BUCKET_URL}
     OVERWRITE_SETTING_FileUpload_S3_ForcePathStyle: "true"
     OVERWRITE_SETTING_FileUpload_S3_SignatureVersion: v4
   ```

   `OVERWRITE_SETTING_` buộc giá trị environment ghi đè setting đã lưu. Nếu chỉ muốn đặt giá trị lần đầu, dùng setting ID không có prefix. Không commit access key/secret key vào Git.

5. **Xử lý file GridFS cũ**
   - Việc đổi Storage Type chỉ bảo đảm file upload mới dùng MinIO; không mặc định di chuyển toàn bộ file cũ.
   - Giữ nguyên MongoDB/GridFS cho đến khi xác minh file cũ vẫn tải được.
   - Nếu cần migrate lịch sử, xây dựng và thử nghiệm quy trình migration riêng dựa trên API hoặc công cụ được phiên bản Rocket.Chat hỗ trợ. Không xóa collection GridFS thủ công.

6. **Quyết định việc dùng MinIO cho backend**
   - Nếu backend cần object storage, đặt `USE_MINIO=true` sau khi bucket backend đã được tạo và test.
   - Dùng bucket và credential khác với Rocket.Chat.
   - Nếu backend vẫn dùng local `uploads` volume, có thể dừng MinIO cho backend nhưng vẫn giữ MinIO phục vụ Rocket.Chat.

#### Kiểm tra sau cấu hình

- Upload file mới trong channel và DM thành công.
- Download được bằng web, desktop và mobile client dùng URL người dùng thực tế.
- Object xuất hiện trong đúng bucket MinIO.
- Restart Rocket.Chat/MinIO không làm mất file.
- File upload trước khi chuyển storage vẫn tải được.
- Log không có `SignatureDoesNotMatch`, `AccessDenied`, DNS hoặc certificate error.
- Backup MinIO bucket và MongoDB được thực hiện độc lập và có thử restore.

---

## 4. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0: Chuẩn bị và rollback

1. Chụp trạng thái `docker compose config`, image versions và volume list.
2. Tạo MongoDB dump và thử restore.
3. Sao lưu `.env`, Compose và Grafana dashboards mà không đưa secret vào Git.
4. Dựng môi trường staging từ bản backup.

### Giai đoạn 1: MongoDB và Rocket.Chat

1. MongoDB 5 → 6.
2. Rocket.Chat 6.13 → 7.x chuyển tiếp.
3. MongoDB 6 → 7 → 8.x, kiểm tra sau từng major.
4. Rocket.Chat 7.x → 8.x còn support.
5. Kiểm thử chức năng và RAGChat App sau từng checkpoint.

### Giai đoạn 2: File storage

1. Tạo bucket và credential riêng.
2. Cấu hình MinIO trên staging.
3. Kiểm thử upload mới và file GridFS cũ.
4. Áp dụng production sau khi có endpoint ổn định.

### Giai đoạn 3: Monitoring

1. Bật Rocket.Chat metrics port 9458.
2. Thêm MongoDB exporter.
3. Bổ sung Loki/OpenTelemetry và Grafana datasource.
4. Thiết lập dashboard và alert.

### Giai đoạn 4: Dọn cấu hình development

1. Quyết định giữ hoặc loại `Dockerfile.app`.
2. Nếu giữ, pin version và chỉ dùng qua development override.
3. Ghi rõ quy trình deploy RAGChat App sau khi workspace sẵn sàng.

## 5. Tiêu chí nghiệm thu tổng thể

- Rocket.Chat và MongoDB đều nằm trong support window phù hợp.
- Image được pin exact version; không dùng `latest` cho thành phần production.
- Backup MongoDB và MinIO đều đã được thử restore.
- Rocket.Chat không còn cảnh báo MongoDB/version unsupported.
- Upload mới nằm ở storage đã chọn; file cũ vẫn truy cập được.
- Prometheus có target Rocket.Chat và MongoDB ở trạng thái `UP`.
- Grafana hiển thị metrics và log của các thành phần chính.
- `docker compose config --quiet` thành công.
- Không có secret mới bị ghi trực tiếp vào Compose hoặc commit vào Git.

## 6. Nội dung tạm hoãn

Hai hạng mục sau chưa được giải quyết trong báo cáo này theo yêu cầu hiện tại:

1. NATS/message broker và kiến trúc transporter của Rocket.Chat mới.
2. Reverse proxy, domain, giới hạn published ports và SSL/TLS.

Hai hạng mục này phải được đánh giá lại trước khi đưa stack ra môi trường production/public.
