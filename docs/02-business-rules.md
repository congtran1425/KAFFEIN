# Quy tắc nghiệp vụ

## Người dùng và chi nhánh

- Mỗi nhân viên có đúng một `home_store_id` tại một thời điểm.
- Nhân viên có thể check-in/out trên POS của chi nhánh khác để ghi nhận hỗ trợ.
- Không cần bảng phân công hỗ trợ trong MVP.
- Nhân viên chỉ đăng nhập bán hàng khi `device.store_id == user.home_store_id`.
- Owner có quyền điều chuyển nhân viên; mọi lần điều chuyển được lưu lịch sử.
- Owner có thể tạm khóa (`SUSPENDED`) nhân viên và mở lại (`ACTIVE`). Nghỉ việc
  (`TERMINATED`) là trạng thái cuối, không kích hoạt lại cùng tài khoản/mã cũ.
  Việc khóa thu hồi cashier session trên server và chặn Bearer web ở request
  tiếp theo; thiết bị POS đang offline có thể chưa nhận thay đổi ngay. Đổi
  `home_store_id` chỉ đi qua nghiệp vụ điều chuyển, không qua sửa hồ sơ.
- Điều chuyển yêu cầu POS chi nhánh cũ online để thu hồi quyền offline.

## Employee code và PIN

- `employee_code` gồm 7 chữ số, unique toàn chuỗi: Owner giữ `1000001`;
  SM/EMPLOYEE bắt đầu từ `1000701`, tăng bằng PostgreSQL sequence và không tái
  sử dụng. Đây là mã nghiệp vụ, khác `users.id` nội bộ. Xem [ADR 0015](adr/0015-owner-and-staff-employee-codes.md).
- PIN gồm 4 chữ số, có rate limit và lockout.
- Server và POS tuân theo cùng chính sách KDF nhưng dùng salt khác nhau.
- Không gửi hash thay cho PIN qua mạng; PIN đi qua HTTPS và server tự verify.
- POS giữ verifier dành riêng cho thiết bị, được bảo vệ bằng Android Keystore.

## Attendance và thu ngân

- Attendance và cashier session là hai nghiệp vụ độc lập.
- Từ menu chức năng, nhân viên chọn `CHECK_IN` hoặc `CHECK_OUT`, sau đó nhập
  employee code và PIN. Thao tác attendance không thay cashier session hiện tại.
- Attendance ở store khác được đánh dấu `is_support = true` bằng cách so sánh
  `attendance.store_id` với `home_store_id` tại thời điểm check-in.
- Attendance trong MVP yêu cầu POS online. Backend xác thực employee code/PIN,
  suy ra store từ device credential và dùng thời gian server UTC làm thời điểm
  chính thức. Không tạo attendance local hoặc outbox khi mất mạng; POS phải hiển
  thị trạng thái không khả dụng và cho phép thử lại.
- Attendance offline, gồm cả tại chi nhánh hỗ trợ, thuộc hướng mở rộng sau MVP.
- Xử lý quên check-in / check-out:
  - Trường hợp quên check-out: Nếu ca chấm công mở quá hạn (sau 14 tiếng hoặc qua
    ngày làm việc mới), khi nhân viên check-in ca mới, POS hiển thị cảnh báo và
    cho phép tự động đóng ca cũ với cờ `MISSED_CHECKOUT`, đồng thời mở ngay ca mới.
  - Quản lý (SM/Owner) có màn hình "Điều chỉnh chấm công" trên Web để sửa lại giờ
    vào/ra thực tế cho các ca bất thường kèm lý do, lưu lại lịch sử trong `audit_logs`.
  - Trường hợp quên hẳn cả ca không check-in, Quản lý có thể tạo bản ghi chấm công bổ
    sung (`MANUAL_ENTRY`) trên Web quản trị.
- Sau 15 phút không hoạt động, cashier session bị khóa chứ không làm mất device
  enrollment.
- Cửa hàng hoạt động 06:00–22:00; không xây module phân ca trong MVP.

## Bán hàng và tồn kho

- Product có size và topping. Cả size và topping đều ảnh hưởng đến giá và tiêu hao
  nguyên liệu.
- Món chính có công thức chuẩn cho từng size/variant, chứa sẵn các nguyên liệu nền
  (ví dụ: trà sữa trân châu đường đen đã gồm định lượng trân châu chuẩn).
- Topping có công thức tiêu hao nguyên liệu riêng (ví dụ: 1 phần topping trân châu =
  40g trân châu hạt + 15ml nước đường). Khi bán kèm món chính, hỗ trợ chọn số lượng
  topping $\ge 1$ (ví dụ: chọn món chính và thêm 1 phần topping trân châu tương đương
  yêu cầu "gấp đôi topping"). Nhu cầu bán lẻ topping được biểu diễn bằng một product
  riêng thuộc danh mục phù hợp, không biến modifier `toppings` thành dòng sale độc lập.
- Ghi chú món là text tự do, không làm thay đổi giá hoặc recipe. Ví dụ “không
  đường/không đá” vẫn trừ công thức chuẩn khi sale hoàn tất. Đây là tồn lý
  thuyết có chủ ý và có thể tạo chênh lệch so với tồn vật lý.
- Đơn đang soạn hoặc đã treo chỉ là draft local trong Room, không tác động tồn
  kho và không sync như một sale. Draft phải tồn tại qua việc đóng/mở app.
- Khi sale hoàn tất, toàn bộ nguyên liệu của món chính và các topping đi kèm được
  trừ trong một transaction nguyên tử.
- Không cho phép tồn kho local âm.
- Sale đã thanh toán là bất biến; không refund/void trong MVP.
- Pha sai, hư hỏng hoặc hao hụt được ghi bằng stock adjustment/waste.
- Khi POS bị suy ra là offline, web vẫn có thể lưu/sửa **nháp phiếu nhập**; không đăng phiếu, tạo movement hay thay đổi số dư. Điều chỉnh kho/hao hụt vẫn bị chặn. Khi POS sẵn sàng, đăng kho phải kiểm tra lại trạng thái thiết bị, đồng bộ và outbox (ADR 0006).

## Thanh toán và Thuế

- Cash có thể hoàn tất offline.
- ZaloPay/MoMo chỉ hoàn tất sau callback hợp lệ hoặc truy vấn trạng thái xác nhận.
- Lịch sử hóa đơn chỉ hiển thị sale `PAID`. Giao dịch online đang chờ, hết hạn hoặc nhân viên hủy không được tính là hóa đơn; bản ghi thanh toán vẫn được giữ để đối soát trạng thái với nhà cung cấp và ngăn thu tiền trùng.
- POS không được tin redirect hoặc ảnh chụp thanh toán của khách.
- MoMo cho phép hủy tại server theo [ADR 0010](adr/0010-momo-local-cancellation.md):
  chỉ đóng popup khi hủy được xác nhận hoặc thanh toán hoàn tất; tạo lại QR dùng
  attempt ID mới. Tiền về QR đã hủy được ghi riêng để đối soát, không hoàn tất
  sale đã hủy, không trừ kho và không tăng doanh thu.
- Thuế VAT áp dụng theo cơ chế **Inclusive**: giá niêm yết trên menu đã bao gồm VAT.
- Thuế suất được cấu hình **theo danh mục sản phẩm** và áp dụng cho mọi sản phẩm
  thuộc danh mục đó; MVP không có mức thuế ghi đè ở từng sản phẩm hoặc topping.
  Thuế suất mặc định của danh mục là 0 và chỉ Owner được thay đổi trên web.
- Topping bán kèm được tính trong giá trị dòng món và dùng thuế suất của danh mục
  món chính. Nếu cần bán topping như một mặt hàng độc lập, mặt hàng đó phải được
  biểu diễn như một product thuộc danh mục phù hợp.
- Mỗi món khi bán (`sale_items`) snapshot mức thuế suất và tiền thuế của món đó.
  Hóa đơn (`sales`) tổng hợp tổng tiền thuế và doanh thu thuần (`total_vnd - tax_vnd`).
- Báo cáo MVP có thể tổng hợp doanh thu thuần và giá trị chứng từ nhập hàng **riêng biệt**;
  không gọi giá trị nhập là COGS, không suy ra lợi nhuận gộp từ đó. COGS, lợi nhuận gộp,
  thuế TNDN và chi phí vận hành ngoài kho (OPEX như mặt bằng, nhân công, điện nước)
  thuộc phạm vi mở rộng trong tương lai.

## Quản lý két tiền mặt, giao ca và kết doanh thu ngày

- Mỗi ca bán hàng của thiết bị POS có một phiên tiền mặt (`register_sessions`) được mở với số tiền vốn đầu ca (`opening_cash_vnd`).
- Kiểm đếm theo mệnh giá VNĐ:
  - Khi mở phiên, chuyển ca (`Chuyển ca`) hoặc chốt két cuối ngày (`Kết doanh thu ngày`), khay đựng tiền mặt được kích hoạt mở để thu ngân kiểm đếm tiền trong két.
  - POS cung cấp bảng kê kiểm đếm 9 mệnh giá tiền VNĐ (500.000 đ đến 1.000 đ), cộng nhanh số tờ +10/+20/+50 và nút −/+ hai bên ô số tờ từng mệnh giá, tự động tính tổng tiền thực tế.
  - Trước khi bắt đầu mở/bàn giao/tổng kết phiên, xác thực lại mã và PIN của thu ngân hiện tại bằng luồng đăng nhập online tại home store. Xác thực này không thay attendance hoặc enrollment. Chỉ sau bước xem lại và xác nhận mới ghi transaction phiên quỹ; khi mở lại màn hình cần xác thực lại.
  - Snapshot bảng kê kiểm đếm được lưu dạng JSON (`opening_denominations`, `closing_denominations`) tại cả SQLite Room local và PostgreSQL backend để Web Admin có thể tra cứu chi tiết từng tờ tiền.
- Đối soát quỹ và quy định tự bù thiếu hụt:
  - Hệ thống tự động tính tiền lý thuyết trong két: `expected_cash_vnd = opening_cash_vnd + cash_sales_vnd`.
  - Chênh lệch đối soát: `variance_vnd = actual_cash_vnd - expected_cash_vnd`.
  - HANDOVER/END_OF_DAY kiểm đếm kín: POS không hiển thị Theo sổ hoặc Chênh lệch. Sau "Tiếp tục đối soát", bảng kê ban đầu được cố định trong Room; không sửa lại sau khi biết thiếu và không nhận sale mới khi đang chốt.
  - **Quy tắc bù quỹ**: Khi thiếu (`variance < 0`), thu ngân kiểm đếm tiền bù bằng bảng mệnh giá riêng. Chỉ hoàn tất khi tiền bù >= khoản thiếu; két nhận toàn bộ tiền bù, không thối lại. Giữ riêng thực đếm ban đầu, variance gốc và bảng kê bù; tiền bù không tính vào doanh thu. Backend kiểm tra tổng và từng số tờ.
  - Quỹ thừa không được báo trên POS, kể cả bước xác nhận. Owner/Manager xem đầy đủ trên Web theo scope; không tự đổi variance về 0 sau bù. Xem [ADR 0011](adr/0011-blind-cash-count-compensation-handover.md).
- Luồng Chuyển ca vs Kết doanh thu ngày:
  - **Chuyển ca**: Ca cũ đóng với bảng kê thực đếm và tiền bù riêng. Khi thu ngân tiếp theo đăng nhập thành công, POS tự mở phiên với `actualCashVnd + compensationCashVnd` và bảng kê gộp từng mệnh giá, không bắt đếm lại. Liên kết phiên nguồn chỉ được nhận một lần và vẫn giữ khi restart/retry.
  - **Kết doanh thu ngày**: Thu ngân chốt két cuối ngày, đối soát tổng doanh thu và niêm phong két tiền mặt, chuẩn bị cho ngày làm việc tiếp theo.
- Thống kê tiền mặt trên Web Admin (`/register`):
  - Thẻ thống kê "Tiền mặt trong két" chỉ phản ánh số tiền của các phiên đang mở (`OPEN`), không cộng dồn tiền vốn đầu ca của các phiên đã đóng trong lịch sử để tránh tạo ra doanh thu/tiền mặt ảo trong báo cáo.

