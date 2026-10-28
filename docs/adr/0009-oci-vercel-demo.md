# ADR 0009: OCI VPS và Vercel cho môi trường demo desktop

- Trạng thái: Accepted (19/10/2026), theo yêu cầu triển khai của chủ dự án.
- Bổ sung ADR 0005 cho môi trường demo hiện tại; không provision AWS.

## Quyết định

API NestJS và PostgreSQL 17 chạy trong Compose project `kaffein` riêng trên OCI
VPS hiện có. API chỉ bind `127.0.0.1:3082`; PostgreSQL không publish host port.
Nginx host proxy HTTPS tới API. Chỉ thêm vhost của KAFFEIN và reload khi
`nginx -t` thành công; không sửa container, network, firewall hoặc vhost dự án khác.
Không bind cổng từ 9000 trở lên.

Web React/Vite chạy trên project Vercel hiện có, Root Directory `apps/web`.
Nhánh phát triển hiện tại là `desktop-work`; private repository không tự loại bỏ
khả năng deploy. Kiểm tra Git integration, production branch, quyền repo và tác giả commit.

## Hệ quả

- Migration chạy bằng image tooling cùng source, trước khi API nhận traffic.
- Seed VPS chỉ cho phép khởi tạo database trống bằng cờ tường minh; từ chối
  chạy lại nếu có dữ liệu. Mật khẩu web demo, JWT và PostgreSQL được sinh riêng.
- Secret nằm ngoài source tại `/opt/apps/kaffein/config/.env.vps`, quyền 600.
  Chỉ upload danh sách source cần thiết; không upload `.env`, SQLite hay signing key.
- CORS giới hạn domain admin đã xác nhận. Vite nhận URL API tại thời điểm build.
- Database timestamp UTC; client hiển thị `Asia/Ho_Chi_Minh`.
- Rollback image không rollback migration; backup trước mọi migration sau lần đầu.
- AWS/CDK vẫn là phương án báo cáo và triển khai sau, chưa bị xóa khỏi dự án.
