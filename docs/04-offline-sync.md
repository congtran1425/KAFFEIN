# Offline synchronization

## Nguồn dữ liệu

- Khi POS hoạt động, UI chỉ đọc từ Room.
- Backend PostgreSQL là nguồn dữ liệu trung tâm của toàn chuỗi.
- Network chỉ cập nhật Room; UI không phụ thuộc trực tiếp vào request đang chạy.

## Outbox

Mỗi thao tác quan trọng tạo một operation trong cùng local transaction:

```text
operation_id: ULID/UUID duy nhất
device_id
type
payload
created_at
attempt_count
status: pending | syncing | completed | failed
```

`POST /sync/push` nhận batch. Backend có unique constraint trên `operation_id`,
vì vậy retry không tạo sale hoặc movement trùng.

Android MVP gửi từng operation theo thứ tự thời gian qua WorkManager (một request
chứa một operation). Chỉ `COMPLETED`/`ALREADY_PROCESSED` mới đánh dấu `SYNCED`.
`REJECTED` được giữ nguyên trong Room để đối soát, đồng thời chặn các operation
đứng sau; không tự xóa sale đã thanh toán tại POS. Network error được retry với
cùng `operation_id` và payload. Toolbar hiển thị số thao tác chờ và cảnh báo
`REJECTED` riêng; trạng thái mạng chưa được suy ra từ việc outbox rỗng.

## Đơn đang soạn và đơn treo

Order draft/held order chỉ tồn tại trong Room trên một POS của store. Draft lưu
size, topping, note và giá hiện tại để sống qua process death/relaunch, nhưng
không tạo outbox operation, sale, consumption hoặc stock movement.

Khi checkout thành công, một Room transaction duy nhất chuyển snapshot của
draft thành sale/payment/consumption/movement, cập nhật balance, ghi outbox rồi
đánh dấu/xóa draft. Retry giao diện phải tái sử dụng cùng local command/sale ID
để double tap không tạo hai sale.

## Pull

`GET /sync/pull?cursor=...` trả menu, giá, recipe, roster, `pin_version` và
inventory delta. Backend không gửi PIN hash của server. Offline PIN verifier
là thiết kế giai đoạn sau: chỉ cấp sau lần đăng nhập online hợp lệ đầu tiên tại
home store, dùng cùng chính sách KDF nhưng salt riêng và Android Keystore.
POS hiện tại chưa cấp verifier; đăng nhập/mở khóa thu ngân vẫn yêu cầu online.
Backend cấp cursor mới chỉ sau khi batch được áp dụng thành công.

Vì stock balance từ Pull là số dư **tuyệt đối**, POS không áp dụng bất kỳ trang
Pull nào khi còn outbox chưa `SYNCED`; nếu không, Pull sẽ ghi đè phần đã trừ
local. Sau ACK của cash sale, POS ghi `cursor=0` cùng transaction với trạng
thái `SYNCED`, rồi cold-bootstrap lại để lấy số dư server mới nhất. Cách này
đồng thời phục hồi các sale cũ được ghi trước khi có local stock movement.
Nếu Pull thất bại, checkpoint 0 vẫn được giữ để lần sau thử lại.

## Một POS mỗi store

MVP bảo đảm tồn local không âm với các giả định:

1. Một active POS/store.
2. Không có đơn từ GrabFood/web.
3. Web không ghi biến động giảm/tăng tồn khi POS offline. Nháp phiếu nhập có thể lưu trên server nhưng không đổi tồn; chỉ đăng kho khi POS được xem là online và outbox sạch (ADR 0006).
4. POS đã hoàn tất initial sync trước khi cho bán.

## Presence

POS foreground gửi heartbeat mỗi 30 giây và khi số outbox chưa sync thay đổi,
kèm `appVersion`, `hasPendingOutbox`, `outboxPendingCount` (bao gồm REJECTED).
Loop theo `repeatOnLifecycle(STARTED)`, dừng khi app vào background. Không dùng
PeriodicWorkRequest 30 giây: WorkManager có interval tối thiểu 15 phút.
Backend không lưu `is_online` như sự thật
bền vững; web suy ra online khi `last_heartbeat_at` còn trong ngưỡng, dự kiến 90
giây. `status` bền vững chỉ gồm ACTIVE/SUSPENDED/REVOKED.

Heartbeat/outbox flag là thông tin gần nhất, không khóa transaction web với
checkout Room. Vẫn có race nếu web điều chỉnh giữa heartbeat "sạch" và một sale
local mới. Không coi guard heartbeat là chứng minh đã triệt tiêu mọi xung đột;
giao thức maintenance/sync barrier cần được chốt trước khi muốn bảo đảm tuyệt đối.

## Cập nhật engine 09/10/2026

WorkManager dùng `OutboxSyncRepository`: báo tổng queue trước khi push, xử lý FIFO,
ACK trong Room, refresh stock khi toàn bộ queue sạch, rồi báo tổng queue còn lại.
Server không được dùng một batch thành công để tự đặt `hasPendingOutbox=false`.
ACK và pull dùng chung mutex cục bộ, tránh snapshot đang bay ghi đè số tồn sau ACK.
Nút **Làm mới thực đơn** kéo snapshot đầy đủ với cùng guard outbox; lịch sử sale,
draft, giỏ và credential được giữ nguyên. Xem `docs/23` và `docs/25` cho bằng chứng.

PostgreSQL sequence cấp số cursor không đồng nghĩa thứ tự commit của các writer.
`RepeatableRead` giữ cold snapshot nhất quán nhưng chưa giải quyết tuyệt đối trường
hợp cursor thấp commit sau cursor cao. Manual full snapshot giúp đối chiếu lại;
muốn bảo đảm delta không bỏ sót dưới mọi tải cạnh tranh phải bổ sung giao thức
commit-order/serialized change publication và test riêng.

## Thanh toán khi offline

- Cash: cho phép.
- ZaloPay: vô hiệu hóa vì cần backend và callback online.

## Attendance khi offline

Attendance không đi qua outbox trong MVP. Khi mất mạng, POS vô hiệu hóa thao tác
check-in/check-out, giải thích rằng cần kết nối backend và cho phép thử lại sau.
Hỗ trợ attendance offline được giữ trong lộ trình mở rộng, không được suy diễn từ
khả năng cashier login hoặc cash sale offline.
