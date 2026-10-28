# ADR 0008: MoMo Sandbox xác nhận bằng query trên máy thay thế

> Chính sách hủy tại server và tiền về muộn hiện theo [ADR 0010](0010-momo-local-cancellation.md).
> Query/lease vẫn áp dụng; nội dung cấm hủy nội bộ bên dưới là quyết định trước đó.

- Trạng thái: Accepted (19/10/2026).
- Bổ sung ADR 0007; không đổi điều kiện PAID hoặc phạm vi thanh toán Sandbox.

## Bối cảnh

Môi trường phát triển không có public ingress để nhận callback vào API cổng
3000. Luồng QR cần xác nhận được bằng query từ máy chủ, đồng thời vẫn tiếp
nhận IPN hợp lệ khi endpoint callback truy cập được.

## Quyết định

1. Đường chính: POS → API → MoMo query → API → POS. HTTPS IPN URL vẫn là tham số
   cấu hình MoMo create, nhưng khả năng truy cập URL đó không là điều kiện để
   đọc trạng thái hoặc settlement bằng query. IPN hợp lệ nếu tới vẫn xử lý.
2. Backend chạy worker trong cùng NestJS để đối soát cả khi POS đóng. Mỗi vòng
   tối đa 5 giao dịch, tick 15 giây, không chồng tick trong cùng process; lease
   DB 60 giây dùng chung worker, POS poll và thao tác kiểm tra/hủy MoMo. Không
   cam kết phát hiện thanh toán tức thì khi không có callback.
3. Timeout, UNKNOWN, 9000 và hết countdown không giải phóng giỏ. Giữ chính sách
   ADR 0007: chỉ query hợp lệ resultCode 0 hoặc IPN hợp lệ mới xác nhận đã trả.
   Ghi bằng chứng provider trước settlement; nếu lỗi kho, giữ trạng thái đối
   soát và retry, không thu lại tiền.
4. Request create mới lưu snapshot không có secret, ID ổn định, lease 60 giây;
   mất QR được retry cùng snapshot tối đa 3 lần, trong cửa sổ hiển thị dự kiến
   5 phút (cập nhật theo ADR 0010). Không retry create cũ thiếu snapshot; không
   dựng lại ID/payload và không tự sửa FINAL_UNPAID cho các giao dịch chưa rõ.
   Đây là giới hạn số lần
   create, không là giới hạn thời gian đối soát query.
5. Giữ query định kỳ cho attempt tồn đọng, không tự xóa/expire theo tuổi. API có
   `lastQueriedAt`, `nextQueryAt`, `reconciliationOverdue` để nhận biết chậm và
   chuyển xử lý vận hành. Không mở khóa cưỡng bức hoặc thêm refund.

## Hệ quả và rủi ro được chấp nhận

- POS có thể thấy kết quả chậm khoảng một chu kỳ query cộng thời gian mạng;
  lease không phải SLA nếu MoMo/DB/API mất kết nối hoặc queue lớn.
- API tắt thì cả polling và worker tạm dừng. Sau restart, dữ liệu DB giữ nguyên
  cho lần đối soát tiếp theo. Worker không cần cashier còn đăng nhập để query;
  retry create vẫn phải thỏa các guard thu ngân hiện hành.
- Giao dịch cũ thiếu QR/snapshot hoặc không có kết quả cuối vẫn chặn chi nhánh.
  Cần tra cứu merchant theo orderId và giữ bằng chứng, không reset DB/outbox.
- Vẫn cần cả ứng dụng/tài khoản MoMo Test để nghiệm thu khách quét và trả tiền.
- Migration chỉ thêm metadata payment và bổ sung hai cột denomination còn thiếu
  migration SQL từ code trước; giữ nguyên sale/quỹ/credential hiện có.

## Căn cứ

- [MoMo query](https://developers.momo.vn/v3/vi/docs/payment/api/payment-api/query/).
- [MoMo idempotency](https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/idempotency/).
- Runbook và bằng chứng triển khai lịch sử; hiện thực và phép kiểm tra tại [PaymentsService](../../apps/api/src/payments/payments.service.ts) và [MoMo polling tests](../../apps/api/test/momo-polling.e2e-spec.ts).
