# KAFFEIN Web Admin

Ứng dụng React 19/TypeScript cho Owner và Store Manager. Web gọi REST API để quản lý chi nhánh/POS, thực đơn, nguyên liệu và công thức, nhập kho, nhân sự/chấm công, hóa đơn, phiên quỹ và báo cáo. Backend kiểm tra quyền và phạm vi chi nhánh của từng yêu cầu.

## Chạy local

Khởi tạo database và chạy Backend API theo [README gốc](../../README.md). Từ thư mục gốc:

```powershell
npm.cmd ci
npm.cmd run dev:web
```

Mở `http://localhost:5173`. Mặc định Web gọi `http://localhost:3000/api/v1`. Tài khoản demo được tạo bằng seed local và nêu trong README gốc.

Khi cần đổi API, đặt biến trước khi chạy Vite:

```powershell
$env:VITE_API_BASE_URL = 'http://localhost:3000/api/v1'
npm.cmd run dev:web
```

Cũng có thể đặt biến này trong `apps/web/.env.local`. Biến `VITE_*` được đưa vào mã frontend nên chỉ chứa cấu hình công khai; không đặt mật khẩu, PIN hay khóa provider tại đây.

## Build và kiểm tra

```powershell
npm.cmd run build -w web
npm.cmd run lint -w web
npm.cmd run test -w web
npm.cmd run preview -w web
```

Build được ghi vào `apps/web/dist`. Preview mặc định dùng cổng `4173`. Các bài kiểm thử tại `src/*.test.mjs` kiểm tra xử lý dữ liệu và các điều kiện giao diện.

## Container Nginx

Build từ thư mục gốc; thay URL build argument nếu cần dùng backend khác:

```powershell
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=http://localhost:3000/api/v1 -t kaffein-web:local .
docker run --rm --publish 127.0.0.1:8080:8080 kaffein-web:local
```

Nginx chạy cổng `8080`, hỗ trợ điều hướng SPA và endpoint `/health`. API URL được cố định lúc build; thay biến môi trường của container sau build không sửa được URL này. Dockerfile có allowlist riêng tại [Dockerfile.dockerignore](Dockerfile.dockerignore) để loại dữ liệu và cấu hình riêng khỏi build context.

Image mặc định không truyền build argument dùng API AWS. Quy trình AWS được mô tả tại [infra](../../infra/README.md).
