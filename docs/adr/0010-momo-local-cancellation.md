# ADR 0010: Hủy MoMo tại server và đối soát tiền về muộn

- Trạng thái: Accepted (19/10/2026), theo yêu cầu trực tiếp của chủ dự án.
- Thay thế phần cấm hủy nội bộ/mở khóa trong ADR 0007, 0008 và phương án đóng
  popup tạm thời trong handoff 38. Không bổ sung refund.

## Quyết định

1. POS không cho đóng popup QR bằng nút Đóng, Back hay click bên ngoài. Chỉ
   server xác nhận hủy/kết thúc chưa thanh toán hoặc hoàn tất thanh toán mới thoát.
   QR MoMo mới có countdown 5 phút (300 giây) theo yêu cầu chủ dự án ngày
   19/10/2026, thay cửa sổ 15 phút trước đó. Countdown về 0 chỉ ẩn QR, không tự hủy.
   Attempt cũ giữ expiresAt đã lưu; ngưỡng cảnh báo đối soát lâu vẫn là 15 phút.
2. Khi thu ngân yêu cầu hủy MoMo, API ghi sale/payment `CANCELLED`, `cancelledAt`
   và audit DEVICE trong transaction khóa chi nhánh → sale → payment.
   Chỉ phản hồi CANCELLED sau commit. Không tuyên bố MoMo đã vô hiệu QR.
3. Nếu đã lưu bằng chứng nhận tiền hoặc PAID thì không hủy (409); POS tiếp tục
   đối soát biên lai. Xác nhận tiền và hủy dùng cùng thứ tự khóa để phân xử race.
4. Room giữ attempt CANCELLED để khôi phục/idempotency nhưng bỏ khóa checkout;
   giữ nội dung giỏ. QR mới luôn có sale/payment/merchantOrderId mới; retry của
   attempt bị hủy không tạo lại QR. Không thay ID của attempt đã gửi.
5. Worker vẫn query QR đã hủy nếu đã gửi provider và chưa có kết quả cuối.
   `providerFinalizedAt` chỉ dừng watch khi nhận kết quả cuối đúng identity/amount.
6. Nếu query/IPN hợp lệ báo PAID sau khi hủy: giữ sale/payment CANCELLED, lưu
   `providerConfirmedAt`, provider transaction ID và audit SYSTEM đúng một lần.
   Không hoàn tất sale cũ, không trừ kho, không đưa vào doanh thu, không ghép vào
   lần thanh toán mới và không tự refund. Khoản tiền xuất hiện tại Web Admin
   để quản lý xử lý vận hành với khách/cổng thanh toán.
7. Owner xem toàn chuỗi; Store Manager chỉ xem khoản của home store suy ra từ
   JWT. Hủy chỉ áp dụng đúng device/store đã xác thực của sale. ZaloPay giữ
   cơ chế hủy được provider xác nhận hiện tại.

## Rủi ro được chấp nhận

QR cũ có thể vẫn nhận tiền sau khi bị hủy nội bộ. ID mới chỉ phân biệt các lần
thanh toán, không vô hiệu hóa QR cũ. Có thể phát sinh khoản cần đối soát nếu
khách thanh toán QR cũ hoặc cả hai QR. Không bỏ qua tiền về muộn; giữ dữ liệu
và cảnh báo quản lý, xử lý hoàn tiền ngoài chức năng MVP nếu cần.

Không cần reservation/hàng đợi nhiều đơn đang hoạt động cho thay đổi này:
attempt bị hủy không được phép settle sale. Các attempt PENDING thực sự vẫn
giữ guard cash/kho/quỹ như trước; CANCELLED không chặn vận hành mới.

## API và dữ liệu

- Migration `20261019110000_local_payment_cancellation`: thêm trạng thái
  CANCELLED, cancelled_at, provider_finalized_at và index watch cancelled MoMo.
- POST `/payments/online/attempts/:saleId/cancel`: MoMo trả checkoutState
  CANCELLED, cancellationMode LOCAL; retry cùng ID idempotent.
- GET attempt/status có cancelledAt, providerFinalizedAt và requiresReconciliation.
- GET `/payments/online/cancelled-receipts`: Owner/Manager, số lượng và 100 khoản
  gần nhất trong scope; Web Tổng quan refresh mỗi 30 giây.
- Room giữ schema 12; status là TEXT, DAO bỏ CANCELLED khỏi unresolved.
