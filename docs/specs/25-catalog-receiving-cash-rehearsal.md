# Diễn tập thực đơn → nhập hàng → cash sale

Ngày: 09/10/2026. Phạm vi: POS, hợp đồng tích hợp và kiểm thử API nhập hàng. Không thêm nghiệp vụ mới ngoài MVP.

## 1. Mục tiêu và cách ly

Chứng minh cùng một backend/PostgreSQL cung cấp thực đơn cho web và Room; receipt POSTED phát sinh stock delta; cash offline commit sale/tiêu hao/outbox trong Room rồi replay đúng một lần lên backend.

- PostgreSQL sandbox: container `kaffein-rehearsal-db-20261009`, label `kaffein.purpose=isolated-rehearsal`, host `127.0.0.1:55434`, database `coffee_pos_rehearsal_e2e`.
- API kiểm thử: Nest AppModule thật, prefix `/api/v1`, DTO validation và ProblemDetailsFilter giống main; chỉ mở `127.0.0.1:3010` trong bài Android.
- Gateway mạng kiểm thử: `127.0.0.1:3011`, chỉ thuộc Jest test, không thêm endpoint control vào API sản phẩm. Khi mô phỏng mất kết nối, gateway chặn request Android bằng 503; web vẫn gọi được API 3010. Heartbeat được làm hết hạn trong **database sandbox** để kiểm tra guard offline, không chờ 90 giây thực.
- AVD duy nhất được cài trong runbook: `Coffee_POS_Integration_20261008`, serial `emulator-5554`. `adb install -r` giữ dữ liệu; không uninstall/clear app.
- Bài Android tạo một Room file riêng có UUID, đóng/mở lại để kiểm tra độ bền rồi chỉ xóa file kiểm thử đó. Không sử dụng credential store hay operational Room của app đang cài.
- Fixture owner/SM/employee, mã kích hoạt và PIN đều được tạo trong sandbox. Không đọc/in/commit credential thật; không seed/fresh/reset database demo. Root `.env` không quyết định DB kiểm thử vì URL được truyền tường minh và E2E có guard local `*_e2e`.

## 2. Kịch bản tự động

| Bước | Thao tác và kỳ vọng |
| --- | --- |
| 1 | Owner tạo activation → Android enroll → cashier login đúng home store → cold pull lưu Room. API/Room khớp tập ID món đang bán. |
| 2 | Danh mục ẩn, size vô hiệu, món không có size bán được không xuất hiện ở menu. Giá mặc định ban đầu 35.000đ; VAT 0. |
| 3 | Owner sửa size 37.000đ, topping 6.000đ, VAT inclusive 10%; Android delta pull cập nhật đúng. Ẩn/bật món phản ánh vào Room. Các giá trị VAT khác 0 chỉ là fixture kiểm thử, không đổi mặc định chuỗi thật. |
| 4 | Chặn gateway Android; tạo CSV nháp từ kho nguồn. Không tăng tồn khi còn nháp; POST bị từ chối khi heartbeat offline. |
| 5 | Nối lại + heartbeat sạch → POST cùng idempotency key hai lần → chỉ cộng 100g một lần. Room chưa đổi cho đến khi pull; sau pull tồn 1.100g. |
| 6 | Mở register; chặn gateway; bán 1 món + 1 topping bằng cash 43.000đ. Công thức 20g + topping 2g, kể cả ghi chú không đường: Room tồn 1.078g; sale PAID và outbox cùng được lưu. |
| 7 | Engine gặp lỗi mạng giữ queue; đóng/mở Room vẫn giữ sale/outbox. Pull bị chặn khi queue còn chờ, không ghi đè stock local. |
| 8 | Owner tăng giá tương lai lên 39.000đ trong lúc sale cũ chưa gửi; reconnect, báo queue còn chờ; receipt khác có thể lưu nháp nhưng không được POST. |
| 9 | Engine dùng cùng code với WorkManager đẩy sale, ACK, cold reconcile và heartbeat sạch. Sale/movement không nhân bản khi push lặp; server và Room cùng 1.078g; hóa đơn cũ vẫn 43.000đ, menu mới 39.000đ. |
| 10 | Full refresh giữ hóa đơn/stock. Bán quá tồn bị từ chối và transaction không để lại sale/tiêu hao/outbox dở dang. |

Bài API độc lập còn kiểm tra SM khác chi nhánh bị chặn, cursor sai trả 400, cold snapshot không bị limit=1 cắt, receipt thủ công retry tuần tự và successful push không tự xóa flag whole-outbox.

## 3. Chạy lại

Mở Docker Desktop và AVD tích hợp trước. Từ workspace, PowerShell:

```powershell
# Chỉ API/PostgreSQL + build/test web, không cài Android
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-pos-rehearsal.ps1

# Thêm Android Room thật; chỉ cài lên AVD tích hợp đã kiểm tra tên
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-pos-rehearsal.ps1 -AndroidSerial emulator-5554
```

Script kiểm tra container/port/DB, replay migration không reset, build, API unit/E2E và web tests. Khi có Android, script build/cài app/test APK, so sánh SHA256 APK đang cài với APK build rồi chạy bài tích hợp. API/gateway đóng khi suite kết thúc; container PostgreSQL riêng được giữ để tra cứu. Mỗi lần chạy thêm fixture sandbox mới, không xóa dữ liệu cũ.

Các bài `PosDataContractTest` không cần live API; chạy riêng trên AVD tích hợp sau khi cài test APK. Bài `PosServerRehearsalTest` tự skip nếu không nhận URL control từ harness; không suy diễn skip thành pass.

## 4. Giới hạn kiểm chứng tại ngày diễn tập

- Đây là diễn tập tự động gọi đúng các endpoint web dùng và kiểm tra read model Room. **Chưa thay thế nghiệm thu thao tác browser/Compose, screenshot, tốc độ render hoặc tự lịch WorkManager 15 phút.** Không khẳng định AVD demo chính/Room cũ đã chuyển sang menu mới.
- Không thay URL mặc định POS/API hay web sang sandbox. Trước buổi thao tác trực quan cần khởi động API local từ code mới, Run APK mới đúng AVD đã được cho phép, xác minh enrollment, nguồn dữ liệu và toàn bộ outbox. Không xóa queue để vượt lỗi.
- Retry receipt **tuần tự** đã qua; cạnh tranh post cùng phiếu, hai phiếu cùng nguyên liệu, post với sale/adjustment chưa được chứng minh. Trạng thái/heartbeat được đọc trước transaction và stock tăng theo read→absolute write là rủi ro cần xử lý. Sắp xếp ingredientId không tương đương SELECT FOR UPDATE. Cần locking/conditional transition và test PostgreSQL cạnh tranh.
- Tại mốc diễn tập, hợp đồng CSV chưa hỗ trợ CSV tổng quát/PDF; giá vốn chưa biết vẫn chưa biểu diễn bằng null; PATCH tự chuyển REVIEWED. Các quyết định về phạm vi tại [ADR 0006](../adr/0006-branch-receiving-sources-and-draft.md) không bao gồm quản trị kho tổng hoặc COGS.
- Heartbeat sạch/lastSyncedAt không chứng minh Android đã áp dụng một delta mới và không khóa checkout cục bộ với mutation web. Maintenance/sync barrier còn cần thiết nếu muốn bảo đảm không xung đột tuyệt đối.
- Sequence cursor không phải commit-order giữa transaction cạnh tranh. RepeatableRead giữ cold snapshot nhất quán; full refresh giúp reconcile, nhưng đảm bảo delta không bỏ sót dưới mọi cạnh tranh còn cần serialized publication/commit-order test.
- ZaloPay online-only chưa được thực hiện trong buổi này; không có bằng chứng thanh toán Sandbox thực từ kết quả cash.

Kết quả của lượt diễn tập được ghi ở mục 5. Mã thực thi nằm tại
`scripts/test-pos-rehearsal.ps1`, `apps/api/test/catalog-receiving-rehearsal.e2e-spec.ts`
và các bài `PosDataContractTest`, `PosServerRehearsalTest` trong Android test.
Lượt ngày 09/10/2026 không thay thế kết quả kiểm thử hoặc nghiệm thu của các bản phát hành sau.

## 5. Kết quả đã xác minh 09/10/2026

- Runbook có Android chạy thành công (exit 0): API/web build, 83 API unit, 24 E2E PostgreSQL gồm live Android (không skip), 5 web tests, 12 Android JVM unit.
- Chạy riêng 9 `PosDataContractTest` trên APK cuối: PASS. APK cài và build khớp SHA256.
- Scoped API lint không có error; toàn API còn 52 errors/61 warnings ngoài phạm vi sửa. Không trình bày repository là đã sạch lint.
- Không seed/reset DB demo, không đổi URL web/POS mặc định. Database sandbox còn chạy; server/gateway của harness đã đóng.
- API local 3000 không lắng nghe tại kiểm tra cuối. Runbook không dừng API đó; trước demo trực quan phải khởi động API từ code mới và kiểm tra readiness, không mặc định trang web đang mở là đã kết nối được.
