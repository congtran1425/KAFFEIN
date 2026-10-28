# ADR 0006: Nguồn nhập hàng và ranh giới phiếu nhập chi nhánh

- Trạng thái: Accepted (09/10/2026). Tại thời điểm chấp nhận, quy tắc nghiệp vụ đã chốt nhưng schema/API/UI chưa triển khai.
- Liên quan: kế hoạch nhập hàng, [phạm vi MVP](../01-scope.md).

## Quyết định

1. Một phiếu nhận hàng chỉ ghi tăng tồn của **một chi nhánh**. Phiếu có một trong hai loại nguồn: `EXTERNAL_SUPPLIER` (ví dụ bánh mua sẵn) hoặc `CENTRAL_WAREHOUSE_UNTRACKED` (nguyên liệu do kho tổng giao). Loại nguồn thứ hai chỉ là thông tin xuất xứ; hệ thống **không** quản lý tồn kho, phiếu xuất hay chuyển kho ở kho tổng. Không gọi đây là chức năng chuyển kho.
2. Có thể lưu và sửa **nháp** phiếu nhập khi POS của chi nhánh được suy ra là offline. Nháp không sinh `stock_movement`, không đổi `stock_balance`, không phát `sync_change` tồn kho và không cho POS bán dựa vào lượng mới. Đây là trường hợp **web vẫn kết nối được API** nhưng POS chưa sẵn sàng; không hàm ý web có khả năng lưu nháp offline trong trình duyệt.
3. Chỉ thao tác **đăng kho** mới ghi tăng tồn và phải kiểm tra lại điều kiện POS/sync/outbox ở thời điểm đăng. POS cần pull được số dư mới trước khi dùng lượng vừa nhập cho sale offline. Điều kiện heartbeat chỉ là kiểm tra trạng thái gần nhất, không phải bằng chứng POS luôn online hay một khóa phân tán.
4. Phiếu có thể lưu giá trị nhập hàng/chứng từ bằng VND để đối chiếu. MVP **không** tính COGS, lợi nhuận gộp, FIFO/bình quân hay P&L từ giá nhập; nguồn kho tổng không được tự động coi là chi phí mua ngoài của cả chuỗi. Không điền giá giả khi chứng từ chưa có giá.
5. Phiếu đã đăng là bất biến. Sai sót sau đăng cần một nghiệp vụ điều chỉnh có lý do và audit, không sửa/xóa âm thầm phiếu cũ. Kho tổng đầy đủ, đặt hàng, xuất–nhận đối ứng và chênh lệch vận chuyển vẫn ở phần mở rộng.

## Hệ quả triển khai

- Nút lưu nháp và nút đăng kho có điều kiện khác nhau; màn hình không được khóa việc **lưu nháp** chỉ vì POS offline. Các thao tác điều chỉnh giảm/hao hụt vẫn theo guard hiện hành.
- Giao dịch đăng kho cần nguyên tử, chống đăng trùng và liên kết mỗi biến động kho với dòng phiếu nguồn. Mã hiện thực để đối chiếu: [StockReceiptsService](../../apps/api/src/stock-receipts/stock-receipts.service.ts) và [bài diễn tập nhập hàng/bán tiền mặt](../../apps/api/test/catalog-receiving-rehearsal.e2e-spec.ts).
- ADR này không xác nhận trạng thái duyệt trung gian, người có quyền đăng kho, mẫu CSV/PDF cụ thể, hay cách biểu diễn bánh thành phẩm; những điểm ấy phải được làm rõ trước phần tương ứng, không tự suy ra từ mockup.
