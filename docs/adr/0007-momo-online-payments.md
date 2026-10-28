# ADR 0007: MoMo Sandbox dùng chung giao dịch online với ZaloPay

> Phần hủy nội bộ/guard đã được thay thế bởi [ADR 0010](0010-momo-local-cancellation.md)
> theo chỉ đạo mới của chủ dự án ngày 19/10/2026; các điều kiện xác minh PAID vẫn giữ.

- Trạng thái: Accepted (18/10/2026), theo yêu cầu triển khai MoMo của chủ dự án.

## Quyết định

Thêm MoMo Sandbox, online-only, bên cạnh tiền mặt và ZaloPay. Tái sử dụng
pending sale/payment, khóa chi nhánh, idempotency, settlement nguyên tử và
nhập biên lai POS. Adapter MoMo chịu trách nhiệm create/query/IPN HMAC-SHA256;
không chạy Express demo trong ứng dụng chính. Không gọi môi trường production.

Phương thức được lưu bền trên attempt; retry/khởi động lại không đổi provider.
MoMo PAID chỉ từ query hợp lệ hoặc IPN đã xác minh (resultCode 0), đúng merchant,
order/request ID và số tiền. Redirect và create thành công không xác nhận đã trả tiền.
Trạng thái chờ, authorization 9000, timeout và countdown không mở khóa giỏ.
Không dùng confirm/cancel cho giao dịch autoCapture đang chờ; query xác nhận
thất bại cuối cùng mới cho FINAL_UNPAID. Không bổ sung refund.

## Hệ quả

PostgreSQL mở rộng constraint method cho MOMO; Room thêm provider với mặc định
ZALOPAY để giữ attempt cũ. Giỏ, phiên quỹ, credential, outbox và biên lai được giữ.
Mọi payment online chưa đối soát đều chặn cash, chỉnh kho và đóng quỹ.
Giữ endpoint ZaloPay cũ; bổ sung endpoint online chung và IPN MoMo riêng.
Key chỉ ở môi trường local/secret store, thư mục mẫu `momo/` bị Git ignore.
