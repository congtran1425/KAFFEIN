# Kế hoạch diễn tập POS–API và giám sát

> Đây là kế hoạch và ghi nhận preflight local ngày 27/09/2026. Kết quả phát hành
> AWS ngày 23/10 được lưu tại [hồ sơ CI/CD](../handoffs/49-aws-cicd-and-pos-aws.md)
> và [hồ sơ sửa mã nhân viên](../handoffs/50-employee-code-rds-correction.md).
> Các lượt đó xác nhận triển khai và kiểm tra API/Web; chưa thay thế nghiệm thu
> cash offline, quỹ và thanh toán ví thật trên POS AWS. Số liệu đã đối chiếu và
> giới hạn bằng chứng nằm trong [danh mục kiểm chứng](../../thesis/assets/evidence/review-20261028.json).

- Ngày lập: 27/09/2026.
- Trạng thái tại ngày lập: preflight còn thiếu APK khớp, API health,
  kiểm chứng ngắt mạng và baseline nghiệp vụ; chưa bắt đầu diễn tập.
- Phạm vi: một chuỗi, nhiều chi nhánh, một active POS/chi nhánh; không đổi MVP.
- Nguồn đối chiếu: [đồng bộ ngoại tuyến](../04-offline-sync.md),
  [xác thực và chấm công](../06-auth-attendance.md), các ADR đã chấp nhận,
  mã kiểm thử API và Android trong repository.

## 1. Mục tiêu và nguyên tắc

Lượt đầu là diễn tập kỹ thuật: chứng minh thao tác trên POS tạo dữ liệu đúng và
đồng bộ được, sau đó mới đánh giá độ mượt. Không dùng một màn hình receipt đẹp,
HTTP 200 hay một lần health check thành công để kết luận toàn hệ thống ổn định.

Tách hai lượt:

1. Diễn tập đầy đủ, khoảng 45–60 phút sau khi chuẩn bị môi trường, có ca lỗi và đối chiếu dữ liệu.
2. Trình diễn ngắn khoảng 15–20 phút, dùng các ca đã thực sự pass; không che giấu giới hạn hoặc gọi local là AWS.

Không seed/reset database đang có lịch sử bán hàng, không xóa Room/outbox,
không revoke POS đang dùng, không sửa payload/ID của operation để vượt lỗi.
Không bật load test hay profiler nặng đồng thời với lượt đo baseline.
Paid sale bất biến; giao dịch demo đã trả tiền không được xóa để làm sạch màn hình.

## 2. Những điểm đã khảo sát, chưa phải bằng chứng demo

| Hạng mục | Kết quả khảo sát ngày lập kế hoạch | Hệ quả |
|---|---|---|
| API local | Không có listener port 3000; `GET /health` không kết nối được | Chưa sẵn sàng bắt đầu; không tự khởi động trong bước lập kế hoạch |
| Docker | Docker Linux engine chưa kết nối được | Không phải blocker nếu dùng đúng database Windows hiện tại; không tự chuyển sang container |
| PostgreSQL | Prisma migrate status hiện xác nhận `coffee_pos/public` tại `localhost:5432`, 5 migration, schema up to date; tài liệu cũ nói 55432 | Dùng đích thực tế đã xác minh; không tự đổi connection hoặc seed container để khớp tài liệu cũ |
| APK/AVD | AVD 5554: 1280×800, 213dpi, package debug đang chạy; SHA-256 APK cài khác APK debug hiện tại trong workspace | Xác nhận/cập nhật đúng artifact có giữ dữ liệu trước khi gọi READY; versionName 1.0 không đủ |
| Health/Swagger | Code khai báo `/health` ngoài prefix; Swagger `/api/docs` | Không gọi `/api/v1/health` làm health check |
| Logging API | Có log lỗi sync; chưa thấy middleware ghi duration/request ID cho mọi request | Health latency không đại diện latency checkout/sync; telemetry nghiệp vụ cần chuẩn bị riêng |
| Seed | `stockBalance.upsert` cập nhật quantity tuyệt đối; seed giới hạn DB local tên `coffee_pos` | Chạy lại seed có thể ghi đè kho; không dùng seed như lệnh phục hồi sau demo |
| E2E | Foundation có rollback từng test; suite sync/sales tạo dữ liệu và chỉ đóng app trong `afterAll` | Không chạy toàn bộ e2e vào database demo đang dùng để theo dõi số liệu |
| ZaloPay | Server tự tạo simulated token/QR, chưa gọi provider thật; POS vẫn chặn thanh toán khác cash | Không đưa quét QR/thanh toán Sandbox thật vào lượt chính |
| Cashier | Login online; khóa thủ công/idle quay về login; cash offline chỉ khi đã login và bootstrap | Đăng nhập, mở quỹ và sync sạch trước khi ngắt mạng; không relaunch/khóa offline rồi kỳ vọng login được |
| Outbox | FIFO, giữ REJECTED; nút Sync now không gửi lại operation đã SYNCED | Bấm Sync now nhiều lần không phải bằng chứng đã kiểm tra replay trùng |
| Presence | Heartbeat 30 giây; server suy ra offline sau ngưỡng 90 giây | Không hứa trạng thái offline đổi ngay khi tắt mạng |

Tại thời điểm khảo sát, `SyncService.pushOperations` đã được sửa để request có
REJECTED giữ pending=true, count bằng số lỗi trong batch. Thay đổi này chưa
chứng minh hàng đợi toàn POS sạch: Android gửi
một operation/request, request đầu thành công vẫn đặt false/0 dù Room còn các
operation khác; số lỗi của batch cũng không bằng tổng số operation chưa sync.
Heartbeat sau đó có thể cập nhật lại, nhưng có khoảng trạng thái không chính xác.
Không chỉnh/nhập kho đồng thời với bán hàng trong lượt chính; không coi guard
heartbeat là transaction lock. Đây là phát hiện từ code, chưa phải lỗi đã tái hiện
trong một run. Ghi nhận và xử lý ở phiên chuẩn bị, không sửa âm thầm giữa demo.

## 3. Phạm vi quan sát và định danh lượt

| Phạm vi | Việc chính | Giới hạn trong lượt đo |
|---|---|---|
| Thao tác POS | Nhập PIN/mã kích hoạt riêng, ghi mã bước và lúc ngắt/nối mạng, dừng khi gặp sai lệch | Không đổi fixture hoặc cấu hình trong lượt |
| API/database | Preflight; theo dõi health, lỗi, tài nguyên API và dữ liệu sale/stock/sync; đối chiếu trước/sau | Không thu credential/PIN, seed/reset, sửa code/restart server hoặc mở public routing |
| Android POS | Kiểm tra APK/AVD, UI, frame/ANR/crash, CPU/RAM app, Room/outbox/checkpoint | Không sửa backend/Prisma, đổi giá/công thức, xóa Room/outbox hoặc cài đè sang POS khác |

Mỗi lượt dùng một `run_id`, ví dụ `DEMO-YYYYMMDD-HHMM`, và các mã bước `D01…D10`.
Trước mỗi bước, thông báo: `run_id / step_id / START`; sau bước báo `END` và kết quả.
Hai bên dùng UTC trong log và giờ Việt Nam khi trình bày. Không thay giờ thiết bị.
`run_id` dùng để ghép evidence, không phải request ID mà API hiện đã hỗ trợ.
Không chạy hai người cùng thao tác làm thay đổi dữ liệu một store.

## 4. Các lựa chọn đã chốt

- [x] Diễn tập kỹ thuật trước, chưa phải trình diễn cho giảng viên.
- [x] Local trên máy cá nhân, chưa triển khai/chuyển demo sang AWS.
- [x] Giữ dữ liệu hiện tại: không seed/reset hoặc tự thêm fixture ở bước chuẩn bị.

Giữ dữ liệu hiện tại là giữ lịch sử và fixture nền. Khi bắt đầu diễn tập,
cash sale sẽ tạo bill, trừ kho;
mở/đóng quỹ và attendance cũng tạo dữ liệu nghiệp vụ thật trong local. Các bản
ghi đó được giữ lại. Nếu chỉ quan sát read-only thì không thực hiện kịch bản bán thử.

Nếu store/employee/credential/recipe hiện tại thiếu, báo thiếu và đánh dấu ca
NOT RUN; không âm thầm tạo tài khoản, đổi home store, enroll/revoke hoặc nạp kho.
Ca phụ cần fixture khác tách khỏi lượt chính và chờ quyết định riêng về môi trường.

## 5. Preflight: đủ điều kiện mới bắt đầu

1. Ghi revision/worktree và phiên bản APK; giữ nguyên mã nguồn trong lượt đo.
2. API, PostgreSQL đúng đích; `/health` trả `status=ok, database=ok`; migration status khớp.
   Không tự chạy migration/reset để che một trạng thái chưa rõ.
3. Kiểm tra dữ liệu sẵn có: store A và employee A thuộc A dùng được cho lượt chính.
   Store B/employee B thuộc B cần cho D08; thiếu thì D08 NOT RUN. Người dùng nhập
   PIN trực tiếp; chỉ xác nhận có thể đăng nhập, không đọc verifier/hash.
   README cũ không đủ làm bằng chứng seed đã tạo tài khoản dùng được. Không tự
   cấp credential hoặc bootstrap thêm khi quyết định hiện tại là giữ dữ liệu.
4. Chỉ một active device tại A. Dùng đúng thiết bị đã enroll hiện có; nếu chưa
   enroll, cần người dùng xác nhận luồng kích hoạt trước khi bắt đầu. Không cài
   máy thứ hai vào cùng store rồi tự thu hồi máy cũ hoặc tạo store demo mới.
5. Đúng APK debug và đúng serial AVD, màn hình 1280×800; ghi API level/density thực tế.
   `10.0.2.2:3000/api/v1/` là URL debug hiện có, không phải localhost bên Android.
   So SHA-256 APK đang cài với artifact chọn để demo. Nếu khác, đối chiếu phiên bản
   và khả năng cập nhật giữ dữ liệu (`-r`, và `-t` nếu TEST_ONLY); không uninstall,
   clear data hoặc vượt lỗi khác signing key để ép cài.
6. Initial pull có category/product/variant/topping, recipe và balance hợp lệ.
   Outbox không còn operation chưa ACK hoặc REJECTED; ghi cursor/last sync và S0.
7. Danh mục/giá/VAT/recipe không đổi trong lượt; VAT 0 cho lượt chính.
8. Chuẩn bị nơi ghi evidence riêng, không commit log, PIN, activation code,
   Authorization header, connection string, webhook MAC hoặc toàn bộ request body.
9. Kiểm chứng cách ngắt riêng đường mạng POS. Không tắt Docker/API hay mạng toàn
   máy tính vì server vẫn cần được quan sát. Chỉ tắt Wi‑Fi của AVD chưa chắc
   chặn được đường host `10.0.2.2`; phải chứng minh request từ POS không tới API
   trong khi `/health` từ host vẫn thành công, và có cách khôi phục.
   Tắt cả Wi-Fi/data bằng `svc` mới là phương án tại thời điểm lập kế hoạch, chưa được
   kiểm chứng trong lượt. Không dùng `network speed 0` làm công tắc offline;
   SDK hiện mô tả `full/no limit` bằng mức 0. `network delay none` là không
   thêm độ trễ, không phải ngắt mạng. Mọi lệnh adb phải chỉ định serial.
   Tham khảo [Emulator console](https://developer.android.com/studio/run/emulator-console)
   về điều tiết tốc độ và độ trễ mạng.
10. Thống nhất công cụ đo: baseline ít overhead trước; profiler sâu chạy lượt riêng.
    Nếu chưa có telemetry duration của endpoint thì đánh dấu chưa đo, không ước
    lượng p95 từ health hoặc từ thời gian thao tác tay.

Không bắt đầu bán thử nếu chưa rõ stock/recipe, cashier, register session hoặc
database đích. Không dump `.env`, `server.js`, Keystore hay dữ liệu PIN để kiểm tra.

## 6. Fixture và phép đối chiếu

Có thể dùng menu seed hiện có, nhưng giá/định mức dưới đây chỉ đúng nếu baseline
thực tế xác nhận khớp. Nếu dùng dữ liệu khác, ghi phép tính tương ứng trước demo.

| Dữ liệu | Giá VAT 0 | Định mức mỗi phần |
|---|---:|---|
| Cà phê sữa đá M | 35.000đ | 20g hạt cà phê + 30g sữa đặc |
| Cà phê sữa đá L | 45.000đ | 30g hạt cà phê + 45g sữa đặc |
| Một topping trân châu | 10.000đ | 40g trân châu |

Ví dụ lượt chính khi dữ liệu hiện tại khớp bảng: một sale online M; hai sale offline gồm 2×M mỗi phần một topping và
1×L. Tổng sale cash tăng 3, tổng doanh thu tăng 170.000đ. Hạt cà phê giảm 90g,
sữa đặc giảm 135g, trân châu giảm 80g; các nguyên liệu khác không đổi.
Quỹ mở 500.000đ → tiền dự kiến cuối phiên 670.000đ nếu không có sale/cash movement
khác. Tiền khách đưa và tiền thối không được cộng cả hai vào doanh thu/quỹ.

Mốc `S0` phải lấy từ dữ liệu thực, không mặc định là số tồn ban đầu trong seed.
Ghi sale/operation/register ID để phân biệt dữ liệu từ lượt trước. So sánh theo
ID và delta, không chỉ tổng số hàng toàn database.
Không đóng một phiên quỹ có sẵn chỉ để đạt ví dụ 500.000đ: nếu quỹ đang mở, ghi
baseline expected/cash sale và dùng delta thực; đóng/mở quỹ cần thống nhất khi
bắt đầu. Thiếu món/topping hoặc không đủ kho thì điều chỉnh kịch bản bằng món
hiện có, tính lại số liệu dự kiến trước bước D03, không seed/nhập thêm kho.

## 7. Kịch bản diễn tập chính

| Bước | Thao tác POS | Đối chiếu API/dữ liệu và tiêu chí đạt |
|---|---|---|
| D01 — Sẵn sàng | Login employee A online, mở quỹ 500.000đ; đợi Sync now hoàn tất | Enrollment đúng A; cashier đúng home store; một register OPEN; operation mở quỹ được ACK; ghi S0 |
| D02 — Nhận order/treo | Chọn size/topping/note, treo rồi lấy lại đơn; xóa draft này để tạo bill D03 | Treo/nhận lại không tạo sale, consumption, stock movement hay outbox sale; note không đổi công thức |
| D03 — Cash online | Bán 1×M, nhận 50.000đ, thối 15.000đ; mở receipt/PDF | Một sale PAID; tiền 35.000đ; một lần trừ công thức; sale/sync operation/movement cùng transaction; POS và server cân sau sync |
| D04 — Ngắt đường POS→API | Ngắt theo cách đã xác minh; giữ app mở và cashier chưa khóa | Host health vẫn ok; không có request POS thành công; heartbeat già dần, server không offline ngay mà chờ ngưỡng |
| D05 — Cash offline | Bán 2×M mỗi phần một topping: 90.000đ; tiếp tục 1×L: 45.000đ; xem receipt và Outbox/tồn local | Receipt local xuất được; kho local giảm đúng; backend chưa có hai sale offline; Outbox giữ operation ID/payload. Trạng thái có thể PENDING hoặc FAILED do đường host hỏng, không bắt buộc chỉ PENDING |
| D06 — Nối lại/sync | Khôi phục đường mạng, bấm Đồng bộ ngay; không tiếp tục bán trong lúc đối chiếu | FIFO; các sale được ACK COMPLETED/ALREADY_PROCESSED; không REJECTED; outbox chưa ACK về 0; cold pull hoàn tất; kho Room bằng server, không bị trừ lần hai |
| D07 — Receipt và quỹ | Xem lại ba receipt, xuất PDF; đóng quỹ kiểm đếm 670.000đ | Sale vẫn giữ snapshot/ID; doanh thu tăng 170.000đ; quỹ expected=actual, variance=0; operation đóng quỹ ACK, register CLOSED |
| D08 — Attendance/phạm vi | Check-in rồi check-out employee B tại POS A; thử cashier login B và nhận lỗi, sau đó quay lại A | Attendance B ở A hợp lệ và isSupport=true; UTC/server time; cashier B bị từ chối do home store; không thay thế cashier A hoặc mở quỹ mới |
| D09 — Khóa phiên | Tạo giỏ nháp; nhấn khóa thủ công ở order/checkout; kiểm tra quay về login và Back không về bán hàng. Thử đăng nhập employee code/PIN sai rồi đúng online; mở Attendance từ login. Thử khóa khi offline rồi nối lại | Không có overlay mở khóa PIN-only; giỏ/outbox/quỹ/enrollment giữ nguyên, không tạo sale hay check-out attendance. Sai PIN/offline không cho đăng nhập; Attendance không cấp quyền cashier. Đăng nhập đúng online phục hồi quyền bán tại home store. Đảm bảo kết thúc lượt ở trạng thái online |
| D10 — Kết luận | Ghi PASS/FAIL/NOT RUN, dữ liệu và số liệu đo | Đối chiếu đủ sale, stock, outbox, cashier/store, quỹ; health/log không có lỗi không giải thích; ghi giới hạn và các bước chưa chạy |

Không chờ đủ 8 giờ để giao ca. Quỹ mở/đóng là nghiệp vụ độc lập với giờ làm.
D09 dùng khóa thủ công cho lượt ngắn; timer 15 phút được kiểm tra ở lượt phụ
hoặc dẫn bằng chứng unit test, không đổi production timeout để giả lập đã đợi.
Nếu cashier khóa trong D05, nối lại để đăng nhập mới bằng employee code/PIN; ghi bước đó bị gián đoạn,
không tìm cách bỏ qua PIN/offline policy.

## 8. Các ca phụ: chạy sau lượt chính, có môi trường riêng

- **Thiếu nguyên liệu:** fixture món thiếu kho từ đầu; checkout thất bại, không
  tăng sale/outbox/movement hay làm âm kho. Không chỉnh giảm kho giữa D04–D06.
- **Duplicate/lost ACK:** replay đúng cùng operation ID/payload bằng harness
  hoặc e2e trên DB test riêng; cần thật sự gửi lại operation đã được server nhận.
  Chỉ bấm Sync now sau SYNCED không đáp ứng ca này. Không sửa Room để tái mở sale.
- **REJECTED/rollback:** fixture lỗi nghiệp vụ ở môi trường riêng; server không
  ghi sale/movement một phần; POS giữ operation và chặn FIFO. Chưa có workflow
  xử lý REJECTED: ghi giới hạn, không xóa/bypass để tiếp tục lượt chính.
- **Snapshot lịch sử:** fixture giá/VAT/recipe đổi sau lúc bán offline; replay
  phải giữ snapshot cũ. Chuẩn bị bằng API/harness có thật, không giả định web
  hiện đã có màn hình đổi giá/công thức; không thay fixture của lượt chính.
- **Restart/migration Room:** kiểm tra riêng, backup fixture nếu cần. Đóng/mở
  app khi online kiểm tra draft/receipt tồn tại; khởi động offline hiện chưa
  hỗ trợ login lại. Migration 7→8 phải dùng DB phiên bản cũ có dữ liệu, không
  lấy lần cài mới version 8 làm bằng chứng migration.
- **ZaloPay thật:** chỉ bổ sung khi provider Sandbox được nối thật, tài khoản
  và public callback sẵn sàng, POS có create/QR/polling. Không quét QR giả lập,
  không dùng tiền thật, không coi webhook tự gửi là callback provider thật.

## 9. Giám sát và tiêu chí dừng

### Server/database

- Health mẫu khoảng 5 giây trong lượt demo; ghi UTC, status và thời gian đo của
  `/health`. Đây là chỉ số health, không phải latency sale/sync.
- Theo dõi process API CPU delta/RSS, process exit/restart, container trạng thái,
  và lỗi DB/timeout/deadlock theo công cụ thực sự có. Không chạy truy vấn ghi để đo.
- Các mốc D01/D03/D05/D06/D07 đối chiếu read-only sale, payment, stock balance,
  stock movements, sync operations, device/register/cashier scope. Baseline và
  ảnh sau bước cần cùng store/recipe và cùng run.
- Log HTTP nếu được bổ sung trước lượt: UTC, method, route template, status,
  duration, request ID; operation ID cho sync. Không header/body/PIN/token/query
  tự do. Chưa thêm instrumentation trong phiên lập kế hoạch này.
- Phân biệt lỗi 4xx có chủ đích (PIN sai/store sai) với 5xx/network timeout;
  response push HTTP 200 vẫn có thể chứa `errors/REJECTED`.
- Ghi observed max/median hoặc p95 chỉ khi đủ mẫu và công cụ phù hợp; không suy
  ra hiệu năng production AWS từ một client local hoặc p95 của vài thao tác tay.

### Ứng dụng POS

- Xác nhận đúng PID/package/AVD; logcat lọc app, không thu Authorization/body hoặc PIN.
  Source hiện chưa có tag log `CoffeePOS`; bộ lọc chỉ tag đó sẽ bỏ sót log.
  Thu log app theo PID hiện tại (đổi PID thì cập nhật), thêm crash/system/event
  phù hợp cho ANR của đúng package. Không coi `AndroidRuntime:E` là bao phủ ANR.
  Dùng `logcat -v threadtime -v UTC` nếu SDK hỗ trợ, không chỉ `-v time` rồi
  mặc định timestamp là UTC. Xem [Logcat](https://developer.android.com/tools/logcat).
- Ghi phản hồi chạm→UI, thao tác order/checkout, receipt/PDF, dialog khóa, outbox/stock.
- Frame time/jank, ANR/crash, CPU/RAM app trước/sau nhiều thao tác; nêu API level,
  tần số màn hình, chế độ debug/release và profiler nào đang bật.
  `gfxinfo framestats` cần đo delta/cửa sổ của bước, không lấy counter tích lũy
  làm tỷ lệ riêng của checkout. Bộ nhớ từ `meminfo` không thay cho CPU; phép đo
  CPU cần công cụ/cửa sổ riêng. Debug có overhead, chưa suy ra hiệu năng
  release; xem [Compose performance](https://developer.android.com/develop/ui/compose/performance).
- Theo dõi Room/outbox/checkpoint đọc-only; không dump toàn DB, Keystore hoặc payload.
- Phân biệt nghẽn emulator/Windows khi chạy Android Studio+Docker+API với lỗi
  app. Android Emulator không đại diện hoàn toàn máy POS thật; không đổi cấu
  hình AVD giữa lượt đo để kết quả trông tốt hơn.

**Dừng ngay** nếu xuất hiện sale trùng, tồn sai/âm, scope sai, paid sale bị sửa,
operation REJECTED không dự kiến, mất draft/receipt, crash/ANR, hoặc lỗi server/DB
lặp lại. Giữ nguyên evidence; ghi bước gần nhất, không thử lại thanh toán mù
hay restart/xóa cache để che lỗi. Chỉ tiếp tục sau khi xác định trạng thái dữ liệu.
Chưa chốt SLO latency/FPS tuyệt đối; lấy baseline lượt đầu trước khi đặt ngưỡng.

Mỗi lượt lưu báo cáo gồm `run_id`, `step_id`, commit, APK hash, thiết bị, API đích,
thời điểm UTC, điều kiện ban đầu, kỳ vọng và quan sát thực tế. Ghi riêng PASS,
FAIL và NOT RUN; giữ liên kết tới dữ liệu trước/sau và các giới hạn kiểm chứng.

Nguồn kiểm thử để đối chiếu: `scripts/test-pos-rehearsal.ps1`,
`apps/api/test/catalog-receiving-rehearsal.e2e-spec.ts`,
`apps/api/test/sync-sales-integration.e2e-spec.ts` và các bài
`PosDataContractTest`, `PosServerRehearsalTest` trong Android test.
Mã kiểm thử hoặc một lần build thành công không tự chứng minh APK đang chạy
đã được nghiệm thu; kết quả từng lượt cần được lưu riêng.
