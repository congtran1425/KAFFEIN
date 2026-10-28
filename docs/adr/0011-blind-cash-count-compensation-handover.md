# ADR 0011: Kiểm đếm kín, tiền bù và tiếp nối quỹ bàn giao

- Trạng thái: Accepted, 19/10/2026, theo yêu cầu thực thi
  kế hoạch 40 của chủ dự án.
- Không thay attendance, home-store login, một active POS/store hoặc phạm vi refund/payroll.

## Quyết định

1. OPEN là kiểm đếm độc lập. HANDOVER/END_OF_DAY không hiển thị số theo sổ hoặc
   chênh lệch trên POS khi đếm. Ca khớp và thừa dùng cùng xác nhận, không báo dư.
2. "Tiếp tục đối soát" ghi cố định bảng kê ban đầu trong Room transaction;
   dùng các cột actual/expected/variance/closingDenominations trên phiên OPEN
   làm bản kiểm đếm đang chốt. Khởi động lại/ra vào màn hình không đổi bản này.
   Cash/QR mới bị chặn cho tới khi chốt xong, tránh doanh thu đổi sau kiểm đếm.
3. Chỉ khoản thiếu được hiển thị trên POS. Tiền bù được đếm bằng cùng component
   nhưng state và bảng kê riêng; tổng phải >= khoản thiếu. Giữ toàn bộ tiền bù,
   không tính tiền thối. Server kiểm tra cả số nguyên, mệnh giá, số tờ và tổng;
   không dựa vào validator DTO vì sync nhận payload offline.
4. variance luôn là thực đếm ban đầu trừ expected, không cộng bù để xóa dấu vết
   thiếu. Ví dụ expected 60.000, thực đếm 25.000, bù 50.000: variance -35.000;
   két nhận 75.000. Tiền bù không tạo sale, không tăng doanh thu hoặc trừ kho.
5. HANDOVER lưu closingMode và bàn giao tới ca mới bằng liên kết duy nhất
   handoverFromSessionId. Khi thu ngân tiếp theo đăng nhập home store thành công,
   POS tự tạo phiên mở với thực đếm + tiền bù và bảng kê cộng từng mệnh giá.
   Không đếm lại; tiếp nhận một lần kể cả restart/retry. Server suy ra và đối
   chiếu nguồn bàn giao, tiền và bảng kê; không tin số mở đầu do client tự gửi.
6. END_OF_DAY không tạo quỹ chờ nhận. Ca kế tiếp mở mới và đếm độc lập.
7. API trực tiếp và sync cùng transaction/khóa store. Close ghi audit; duplicate
   operation ID trả kết quả cũ. Room chốt phiên và enqueue outbox nguyên tử.
   Outbox gửi theo thứ tự enqueue (rowid), không theo UUID hoặc đồng hồ có thể lùi.
8. Web Owner xem toàn chuỗi, Manager chỉ home store. Hiển thị variance gốc,
   bảng kê bù, tiền sau bù và ca nguồn; lọc ở server. Thống kê tính toàn bộ phạm
   vi chi nhánh, không chỉ 50 bản ghi trên trang hiện tại. Dùng tiền nguyên.

## Dữ liệu và tương thích

- PostgreSQL migration 14 thêm compensationCashVnd/Denominations/Note,
  closingMode và handoverFromSessionId (unique FK tự tham chiếu).
- Room 12 → 13 thêm trường nullable và unique index, không xóa bảng hoặc dữ liệu.
- Dữ liệu lịch sử giữ null, không tự ghi đã bù hoặc tự tạo bàn giao quá khứ.
- Cập nhật API trước APK/Web; không seed/reset database. Sao lưu trước migration.
- Xác thực đầu nghiệp vụ vẫn dùng login online hiện có. Sau xác thực, bản chốt,
  tiền bù và outbox vẫn ghi được offline; không thêm offline PIN verifier.

Kiểm đếm kín là quy tắc giao diện/vận hành. Room vẫn giữ sổ local để bán offline;
không tuyên bố ngăn người có quyền truy cập trực tiếp database đọc số liệu.
