# Phạm vi MVP

## POS Android

- Kích hoạt thiết bị với chi nhánh một lần.
- Check-in/check-out attendance bằng employee code và PIN.
- Đăng nhập/khóa phiên thu ngân độc lập với attendance.
- Tạo đơn với size, topping và ghi chú từng món; cho phép treo đơn local.
- Thanh toán tiền mặt offline và ZaloPay/MoMo Sandbox khi online.
- Lưu sale, consumption và outbox trong Room/SQLite.
- Bán tiền mặt offline trong giới hạn tồn kho local.
- Mở/đóng phiên tiền mặt và ghi nhận chênh lệch giao ca.
- Xem receipt sau thanh toán, tra cứu lịch sử receipt và xuất receipt PDF.

## Web quản trị

- Owner quản lý chi nhánh, SM, nhân viên, menu, giá, nguyên liệu và công thức.
- Owner cấu hình thuế VAT theo danh mục sản phẩm; không có mức thuế ghi đè ở
  từng sản phẩm trong MVP. Mỗi danh mục khởi tạo rate bằng 0 và sale luôn giữ
  snapshot để thay đổi sau không làm đổi giao dịch cũ.
- Owner điều chuyển `home_store_id` của nhân viên và xem toàn chuỗi.
- SM xem chi nhánh phụ trách, attendance, doanh thu và tồn kho.
- SM có thể lưu nháp phiếu nhập khi POS chi nhánh offline; chỉ đăng kho/ghi biến động tồn khi POS được xem là online và đã đồng bộ. Điều chỉnh kho vẫn bị chặn khi POS offline (ADR 0006).
- Theo dõi trạng thái thiết bị, lần heartbeat và lần đồng bộ gần nhất.

## Backend

- NestJS modular monolith, REST/OpenAPI, PostgreSQL và Prisma.
- Authentication, RBAC, store scope, device credential và audit log.
- Idempotent sync bằng `operation_id`.
- Recipe version, size/topping và consumption snapshot.
- ZaloPay và MoMo Sandbox provider; mã mẫu/credential chỉ được giữ local và không commit.

## Ngoài MVP

- Multi-tenant SaaS.
- Nhiều POS trên một chi nhánh.
- Barcode, máy in/cash drawer thật và silent APK update.
- Refund/void sau thanh toán.
- Lô, hạn sử dụng, FEFO và truy xuất nguồn gốc.
- Chuyển kho giữa chi nhánh.
- GrabFood, ShopeeFood, website/mobile ordering.
- Phân lịch làm việc, payroll và đơn xin nghỉ.
- Hóa đơn điện tử pháp lý/kết nối cơ quan thuế.
