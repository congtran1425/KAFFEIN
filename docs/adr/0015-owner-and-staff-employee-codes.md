# ADR 0015: Mã Owner riêng và dải mã nhân viên thống nhất

- Trạng thái: Accepted, 23/10/2026, theo yêu cầu chủ dự án sửa RDS và seed.
- Thay quy tắc cũ Owner có `employee_code = NULL` và staff bắt đầu `1000001`.

## Quyết định

- `users.id` tiếp tục là PK nội bộ, không đổi ID hay các foreign key.
- `employee_code` là mã hiển thị/đăng nhập 7 chữ số, bắt buộc và unique toàn chuỗi.
  Owner duy nhất giữ `1000001`; SM/EMPLOYEE được PostgreSQL sequence cấp từ
  `1000701`, tối đa `9999999`, không cycle, không tái sử dụng. Khoảng trống khi
  rollback là bình thường; `1000002`–`1000700` không cấp cho nhân viên mới.
- Owner vẫn không có home store, không được cấp thêm quyền POS từ mã này.
  Credential web/PIN, enrollment, scope chi nhánh giữ nguyên.
- Migration khóa bảng users trong một transaction, từ chối nếu nhiều Owner,
  chuyển mã staff cũ dưới `1000701` theo `users.id` tăng dần, giữ mã hợp lệ cao
  hơn và không lùi sequence đã tiêu thụ. Ghi audit old/new và delta sync nhân sự
  không chứa PIN/hash. Sau correction, trigger tiếp tục cấm đổi mã thông thường.
- API chỉ trả mã lưu trong DB; bỏ fallback tự ghép `1000000 + users.id`.
- Hai seed dùng chung helper, để trigger cấp mã theo thứ tự Owner, SM Q1,
  cashier Q1, SM Q2; không reset sequence/đổi mã người đã có khi chạy seed lại.
  Không chạy seed trên RDS đã có dữ liệu.

## Vận hành

Trước khi đổi mã hệ thống đang dùng, đối chiếu nhân sự, lưu snapshot mã/ràng buộc,
kiểm tra POS không còn cash/outbox chưa đồng bộ. Mã cũ trong paid sale payload
vẫn là dữ liệu lịch sử bất biến; không rewrite giao dịch. Mã mới dùng cho lần
đăng nhập sau. Không tạo alias cho mã cũ có thể trỏ nhầm Owner/nhân viên.

Thực hiện migration trước API mới để tương thích rolling deploy. Rollback image
không reverse migration. Không sửa migration foundation đã triển khai trước đó.
