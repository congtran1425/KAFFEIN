# KAFFEIN Backend API

Backend NestJS dạng modular monolith, sử dụng PostgreSQL 17 và Prisma. Các module xử lý xác thực, thiết bị, nhân sự, chấm công, phiên thu ngân/quỹ, thực đơn, bán hàng, thanh toán, kho, báo cáo và đồng bộ POS.

Phạm vi chi nhánh được xác định từ người dùng hoặc thiết bị đã xác thực. Hoàn tất bán hàng và biến động nguyên liệu được ghi trong transaction; thao tác đồng bộ có mã định danh và kiểm tra nội dung để chống xử lý lặp.

## Chạy local

Yêu cầu Node.js 24, npm và PostgreSQL 17. Thực hiện từ thư mục gốc dự án; xem [README gốc](../../README.md) để tạo `.env` và khởi động PostgreSQL.

```powershell
npm.cmd ci
npm.cmd run db:generate -w api
npm.cmd run db:deploy -w api
# Chỉ chạy trên database local mới:
npm.cmd run db:seed -w api
npm.cmd run dev:api
```

Prisma và API đọc `DATABASE_URL` từ môi trường hoặc `.env` ở thư mục gốc. Database mẫu là `coffee_pos`, cổng local `55432`. API đọc `PORT`, mặc định `3000`; `JWT_ACCESS_SECRET` dùng để ký phiên truy cập.

| Địa chỉ | Nội dung |
| --- | --- |
| `http://localhost:3000/health` | Trạng thái API và database |
| `http://localhost:3000/api/v1` | Tiền tố REST API |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/api/docs-json` | Tài liệu OpenAPI dạng JSON |

Các biến Sandbox, CORS và cấu hình local được liệt kê tại [.env.example](../../.env.example). Khóa thanh toán chỉ đặt ở backend.

## Schema và seed

- [prisma/schema.prisma](prisma/schema.prisma): mô hình dữ liệu.
- [prisma/migrations](prisma/migrations/): migrations, constraints và trigger PostgreSQL.
- [prisma/seed-master-catalog.ts](prisma/seed-master-catalog.ts): seed được dùng bởi `db:seed`.
- [prisma/seed-employees.ts](prisma/seed-employees.ts): dữ liệu nhân sự mẫu; mã nhân viên do database cấp.

```powershell
npm.cmd run db:status -w api
npm.cmd run db:deploy -w api
```

`db:migrate` dùng cho việc tạo migration khi phát triển; `db:deploy` áp dụng các migration đã có. Không chạy reset hoặc seed lại trên dữ liệu đang sử dụng. Seed local có thể ghi đè thông tin demo và số dư kho. Seed cloud chỉ cho khởi tạo database trống với opt-in và hostname hợp lệ; mật khẩu lấy từ `DEMO_WEB_PASSWORD` được cấp riêng.

## Build và unit test

```powershell
npm.cmd run build -w api
npm.cmd run lint -w api
npm.cmd run test -w api -- --runInBand
```

Build tự tạo Prisma client trước khi biên dịch NestJS. Unit test dùng mock; không yêu cầu ghi vào database vận hành.

## Kiểm thử tích hợp trên database riêng

E2E tạo và xóa dữ liệu. Cơ chế bảo vệ chỉ cho phép URL local, tên database kết thúc `_e2e` và biến xác nhận ghi dữ liệu. Tạo container test riêng trong terminal mới:

```powershell
docker run --detach --name kaffein-submission-e2e --publish 127.0.0.1:55436:5432 --env POSTGRES_USER=ci --env POSTGRES_PASSWORD=synthetic-ci-only --env POSTGRES_DB=kaffein_submission_e2e postgres:17-alpine
docker exec kaffein-submission-e2e pg_isready -U ci -d kaffein_submission_e2e
```

Khi PostgreSQL đã sẵn sàng, tại thư mục gốc:

```powershell
$env:DATABASE_URL = 'postgresql://ci:synthetic-ci-only@127.0.0.1:55436/kaffein_submission_e2e'
$env:POS_E2E_ALLOW_DB_WRITE = 'YES_I_ACCEPT_DB_MUTATION'
$env:NODE_ENV = 'test'
npm.cmd run db:generate -w api
npm.cmd run db:deploy -w api
npm.cmd run test:e2e -w api
```

Đóng terminal test sau khi chạy để không dùng nhầm các biến môi trường này khi khởi động ứng dụng. Nếu tên container hoặc cổng test đã có, kiểm tra nó trước khi dùng; không thay URL bằng database demo hay RDS để vượt lỗi kết nối.

Các bộ E2E trong [test](test/) kiểm tra phân quyền, đồng bộ lặp, snapshot công thức, transaction bán hàng/kho, thanh toán QR và kiểm đếm/bù quỹ. Test có điều kiện Android hoặc Sandbox thật chỉ chạy khi cung cấp môi trường tương ứng; kết quả bỏ qua phải được ghi riêng.

## Container

Build từ thư mục gốc:

```powershell
docker build -f apps/api/Dockerfile --target tooling -t kaffein-api:tooling .
docker build -f apps/api/Dockerfile --target runner -t kaffein-api:local .
node --test scripts/test-container-bootstrap.mjs scripts/test-prisma-cloud-config.mjs
```

Image tooling có Prisma CLI để chạy migration; image runner chạy API bằng tài khoản không có quyền root. Runtime cloud nhận database/provider/JWT secret từ môi trường. Kết nối RDS dùng TLS và chứng chỉ CA được xác thực. Xem [hạ tầng AWS](../../infra/README.md) cho quy trình triển khai.
