# Device, authentication và attendance

## Device enrollment

Lần chạy đầu, Owner tạo activation code trên web. POS đổi code lấy device
credential gắn với một store và lưu bằng Android Keystore. Ứng dụng không có
nút logout store; chỉ Owner có quyền revoke/reset.

Mỗi store có tối đa một device `ACTIVE`, nhưng vẫn giữ lịch sử thiết bị
`REVOKED` để không nhận lại operation từ bản cài cũ.

## Ba lớp phiên

1. Device enrollment: sống lâu dài, định danh store và thiết bị.
2. Attendance: ghi check-in/check-out, không cấp quyền bán hàng.
3. Cashier session: employee code/PIN, hết 15 phút không thao tác quay về đăng nhập và chỉ dùng ở home
   store.

## PIN verifier khi offline

**Cập nhật ngày 10/10 (quyết định mới nhất):** Nhấn khóa thủ công **hoặc** sau
15 phút không thao tác (monotonic clock), POS cùng kết thúc
ngữ cảnh thu ngân local, xóa mã/PIN nhập và loại màn bán hàng khỏi back stack,
quay thẳng về đăng nhập thu ngân, kể cả khi đang ở attendance.
Không xóa cart/đơn treo/sale/outbox, không đóng phiên tiền mặt, không check-out
attendance và không xóa enrollment. Đăng nhập lại vẫn cần online; backend hiện
chưa có API logout/revoke cashier session từ POS, nên đây là hết phiên **local**,
không khẳng định đã thu hồi phiên trên server.

Không còn overlay mở khóa/PIN-only hay nút đổi cashier bên trong overlay.
Đăng nhập lại cần đủ employee code/PIN và xác thực online tại home store;
khóa khi mất mạng vẫn quay về login nhưng không thể đăng nhập lại khi chưa có mạng.
Attendance mở độc lập từ màn hình login và không cấp quyền cashier.
Đổi cashier cần login mới, không làm logout store. Người dùng chốt offline
verifier làm sau. Phần verifier dưới đây là
thiết kế chưa được triển khai, không phải tính năng đã hoàn tất.

Server chỉ lưu encoded PIN hash dành cho xác thực online và không gửi hash đó
cho POS. Server cũng không thể tạo một hash mới với salt khác từ hash một chiều
cũ nếu không có PIN gốc.

Ở lần đăng nhập online hợp lệ đầu tiên tại home store, POS dùng PIN nhân viên vừa
nhập để tạo verifier cục bộ bằng cùng phiên bản/chính sách KDF nhưng salt ngẫu
nhiên riêng cho cặp employee-device. Verifier được bảo vệ bằng Android Keystore.
Backend sync `pin_version`; khi PIN được đổi, account bị suspend, device bị
revoke hoặc nhân viên chuyển store, POS phải vô hiệu verifier cũ.

Hệ quả khi triển khai verifier trong giai đoạn sau (chưa có trong bản hiện tại):

- cashier login offline chỉ hoạt động sau khi đã bootstrap verifier online tại home store;
- device thay thế hoặc nhân viên chuyển home store phải đăng nhập online một lần
  trên POS mới trước khi có thể đăng nhập cashier offline;
- attendance trong MVP yêu cầu kết nối backend, kể cả ở home store và store hỗ trợ;
  verifier local chỉ phục vụ cashier login offline tại home store.

## Attendance hỗ trợ

Không có `user_store_assignments` trong MVP. Server cho employee active
check-in tại store của POS đang dùng và ghi snapshot:

```text
employee_id
store_id
home_store_id_at_check_in
is_support
check_in_at/check_out_at
device_id
```

Nếu sau này cần phê duyệt trước, thêm temporary assignment workflow.

## Luồng thao tác attendance trên POS

1. Nhân viên mở menu chức năng và chọn `Attendance`.
2. POS hiển thị hai hành động độc lập: `Check in` và `Check out`.
3. Sau khi chọn hành động, POS mở form employee code 7 chữ số và PIN gồm 4 chữ số được che.
4. Xác thực: Backend xác thực device credential, employee/PIN và trạng thái attendance;
   store/device được suy ra từ device credential, không lấy từ request body. Backend dùng
   thời gian server UTC làm thời điểm chính thức. Nếu POS offline, thao tác bị vô hiệu hóa,
   không tạo bản ghi local/outbox và giao diện cho phép thử lại khi có mạng.
5. POS hiển thị kết quả gồm nhân viên, hành động, chi nhánh, thời gian và nhãn
   “Hỗ trợ” nếu home store khác store của device, rồi quay lại menu chức năng.

## Xử lý ngoại lệ và ca bất thường

- **Trường hợp bình thường:** `Check in` bị từ chối khi user đã có attendance đang mở trong ngày.
  `Check out` bị từ chối khi không có attendance đang mở.
- **Xử lý quên Check-out:** Nếu nhân viên quên check-out và hôm sau đến làm ca mới (hoặc ca cũ
  mở quá 14 tiếng / qua ngày hoạt động mới), POS phát hiện ca cũ chưa đóng, hiển thị hộp thoại
  cảnh báo và cho phép đóng ca cũ với cờ `MISSED_CHECKOUT`, đồng thời mở ngay ca mới.
- **Điều chỉnh chấm công (Attendance Adjustment):** Trên Web quản trị, SM hoặc Owner có quyền
  xem các ca bất thường (quên check-out, ca kéo dài bất thường) và điều chỉnh lại giờ vào/ra
  chính xác cho nhân viên kèm lý do, lưu lại lịch sử trong `audit_logs`.
- **Quên check-in cả ca:** Quản lý có thể tạo bản ghi chấm công bổ sung (`MANUAL_ENTRY`) trên
  Web quản trị sau khi xác minh sự có mặt của nhân viên.
- Mọi lần thử PIN đều chịu cùng rate limit/lockout. Attendance không đăng nhập, đăng xuất
  hoặc thay thế cashier đang vận hành POS.

## Điều chuyển

Owner cập nhật `home_store_id` trong transaction, ghi
`employee_store_transfers`, thu hồi cashier sessions cũ và yêu cầu POS cũ sync
roster trước khi chuyển có hiệu lực hoàn toàn.

## Web Management Authentication & RBAC (Web Admin)

1. **Cơ chế xác thực:** Quản trị web (Owner và Store Manager) sử dụng JWT độc lập với Device Credential của POS.
2. **Endpoint đăng nhập:** `POST /api/v1/auth/web/login` nhận `email` và `password`, đối soát mật khẩu băm scrypt trong bảng `web_credentials`.
3. **Phân quyền tự động theo Role (Claims trong JWT):**
   - Payload JWT chứa: `{ userId, role: "OWNER" | "STORE_MANAGER", homeStoreId }`.
   - Frontend Web đọc payload JWT để tự động phân định quyền mà không cần người dùng chọn vai trò thủ công.
   - **Chủ chuỗi (`OWNER`):** Toàn quyền truy cập mọi chi nhánh, có thể chuyển đổi chi nhánh qua Store Switcher (`GET /api/v1/auth/stores`), cấp mã kích hoạt thiết bị POS mới, quản lý menu toàn chuỗi.
   - **Cửa hàng trưởng (`STORE_MANAGER`):** Bị khóa cố định (`locked`) vào `homeStoreId`. Backend xác thực scope chi nhánh thông qua `WebPrincipalUtil.requireOwnerOrManager(authHeader, targetStoreId)`.
4. **Endpoint hồ sơ & danh sách chi nhánh:**
   - `GET /api/v1/auth/me`: Trả về thông tin phiên người dùng hiện tại từ JWT.
   - `GET /api/v1/auth/stores`: Trả về danh sách chi nhánh kèm trạng thái heartbeat thời gian thực của máy POS.
