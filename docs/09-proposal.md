# ĐỀ CƯƠNG ĐỒ ÁN TỐT NGHIỆP

## Thông tin nhận diện

- **Tên đề tài:** Thiết kế và xây dựng hệ thống POS đa chi nhánh hỗ trợ hoạt
  động ngoại tuyến và quản lý kho nguyên liệu cho chuỗi cửa hàng cà phê trên nền
  tảng AWS.
- **Tên tiếng Anh dự kiến:** Design and Development of a Multi-Branch
  Offline-Capable POS and Ingredient Inventory Management System for a Coffee
  Shop Chain on AWS.
- **Sinh viên thực hiện:** Trần Chí Công.
- **Mã số sinh viên:** 31231027506.
- **Lớp/khóa:** IT001/49.
- **Ngành:** Công nghệ thông tin.
- **Giảng viên hướng dẫn:** TS.Trần Hồng Thái.
- **Đơn vị đào tạo:** Đại học Kinh tế Thành phố Hồ Chí Minh (UEH).
- **Thời gian thực hiện dự kiến:** 10 tuần.

> Ghi chú: phần thông tin hành chính và hình thức trình bày sẽ được điều chỉnh
> theo biểu mẫu chính thức do UEH/Khoa ban hành. Tài liệu này tập trung vào nội
> dung học thuật và kế hoạch thực hiện đề tài. Khung nội dung tham khảo hướng
> dẫn đề cương dự án phần mềm yêu cầu phát biểu bài toán, yêu cầu/thiết kế ban
> đầu, phương pháp đánh giá, sản phẩm và tiến độ [11], [12]. Khoa Công nghệ Thông
> tin Kinh doanh UEH có công bố bộ đề cương và biểu mẫu theo từng học kỳ [13];
> bản chính thức cần được đối chiếu lại khi sinh viên nhận đúng biểu mẫu áp dụng
> cho ngành, hệ và khóa của mình.

## 1. Mở đầu

### 1.1. Bối cảnh và tính cấp thiết của đề tài

Tại cửa hàng cà phê, hệ thống bán hàng tại quầy là điểm ghi nhận trực tiếp món
khách gọi, số tiền phải thanh toán, phương thức thanh toán và doanh thu phát
sinh. Khi chuỗi có nhiều chi nhánh, dữ liệu từ từng cửa hàng còn phải được tổng
hợp để chủ doanh nghiệp theo dõi hoạt động toàn chuỗi, trong khi quản lý cửa
hàng chỉ được thao tác trong phạm vi chi nhánh phụ trách.

Hoạt động bán hàng không nên bị dừng hoàn toàn khi kết nối Internet chập chờn
hoặc backend tạm thời không truy cập được. Một số sản phẩm POS thương mại tại
Việt Nam đã công bố khả năng tiếp tục order, tính tiền khi mất mạng và đồng bộ
lại khi có kết nối [3]. Điều đó cho thấy hỗ trợ ngoại tuyến là một nhu cầu vận
hành có thật, không chỉ là yêu cầu kỹ thuật giả định.

Quản lý kho trong lĩnh vực đồ uống cũng khác với quản lý hàng hóa bán nguyên
chiếc. Một ly cà phê hoặc món ăn điểm tâm có thể sử dụng nhiều nguyên liệu theo
định lượng. Các giải pháp F&B hiện có cung cấp chức năng định lượng và theo dõi
nguyên liệu [4], cho thấy việc liên kết món bán với mức tiêu hao nguyên liệu là
một phần quan trọng của bài toán quản lý cửa hàng. Tuy nhiên, đối với một đồ án
CNTT, giá trị nghiên cứu không nằm ở việc sao chép danh sách chức năng của sản
phẩm thương mại, mà ở việc thiết kế và kiểm chứng cách dữ liệu bán hàng, công
thức và tồn kho vẫn nhất quán khi POS hoạt động ngoại tuyến rồi đồng bộ trở lại.

Chương trình Công nghệ thông tin của UEH xác định người học cần có khả năng tham
gia toàn bộ quá trình xây dựng hệ thống từ khảo sát, phân tích, thiết kế đến xây
dựng, kiểm thử và triển khai [1]. Đề tài này tạo điều kiện vận dụng đồng thời các
năng lực đó trên ba thành phần phần mềm: ứng dụng Android POS, web quản trị và
backend triển khai trên cloud. Cách tiếp cận cũng phù hợp với định hướng chung
của một đồ án CNTT: phân tích một vấn đề thực tế, thiết kế, hiện thực và đánh giá
một giải pháp tính toán theo yêu cầu xác định [2].

### 1.2. Cơ sở khoa học và kỹ thuật

Đề tài dựa trên các cơ sở chính sau:

1. **Kiến trúc offline-first.** Android Developers khuyến nghị ứng dụng
   offline-first sử dụng nguồn dữ liệu cục bộ làm nguồn dữ liệu chuẩn mà tầng
   giao diện đọc trực tiếp; dữ liệu mạng được dùng để cập nhật nguồn cục bộ [5].
   Nguyên tắc này phù hợp với POS vì giao diện bán hàng không phải chờ một
   request mạng để hiển thị danh mục hoặc xử lý thao tác cốt lõi.
2. **Transactional outbox và idempotency.** Khi dữ liệu nghiệp vụ và yêu cầu
   đồng bộ được ghi ở hai bước độc lập, lỗi giữa hai bước có thể làm mất thao
   tác hoặc tạo dữ liệu không nhất quán. AWS Prescriptive Guidance mô tả outbox
   như một cách ghi dữ liệu và sự kiện trong cùng transaction, đồng thời lưu ý
   việc giao nhận có thể lặp nên phía nhận phải xử lý idempotent [6].
3. **Transaction và ràng buộc cơ sở dữ liệu.** PostgreSQL cung cấp transaction,
   các mức cô lập và unique constraint để bảo vệ tính toàn vẹn khi có thao tác
   đồng thời [7]. Trong đề tài, các cơ chế này được áp dụng cho sale, tồn kho và
   khóa idempotency.
4. **Phiên bản hóa công thức và dấu vết kho.** Mỗi sale cần lưu lại phiên bản
   công thức và lượng tiêu hao đã thực tế áp dụng. Stock movement được dùng như
   sổ biến động để giải thích vì sao số dư thay đổi, thay vì chỉ ghi đè một con
   số tồn kho.
5. **Xác nhận thanh toán từ phía máy chủ.** Tài liệu ZaloPay quy định merchant
   server tạo đơn hàng, nhận callback và xác thực callback bằng HMAC với khóa
   tương ứng [8], [9]. Vì vậy POS không thể tự kết luận giao dịch đã thành công
   chỉ từ redirect, ảnh chụp hoặc dữ liệu do client cung cấp.
6. **Triển khai cloud có thể tái tạo và quan sát.** AWS Well-Architected
   Framework xem vận hành, bảo mật, độ tin cậy, hiệu năng, chi phí và tính bền
   vững là các nhóm thuộc tính cần cân nhắc khi thiết kế workload [10]. Đề tài
   sử dụng Infrastructure as Code, logging và budget để thể hiện các thuộc tính
   này ở quy mô phù hợp với đồ án cá nhân.

### 1.3. Vấn đề nghiên cứu

Đề tài nghiên cứu cách xây dựng một hệ thống POS cho **một chuỗi cửa hàng cà
phê duy nhất có nhiều chi nhánh**, trong đó POS vẫn hoàn tất được giao dịch tiền
mặt khi ngoại tuyến, sau đó đồng bộ với backend mà không tạo sale hoặc biến động
kho trùng.

Vấn đề trọng tâm là sự nhất quán dữ liệu giữa hai nơi lưu trữ có thời điểm cập
nhật khác nhau:

- Room/SQLite trên POS phục vụ vận hành tức thời tại cửa hàng;
- PostgreSQL trên backend lưu dữ liệu tập trung của toàn chuỗi.

Giải pháp phải đồng thời bảo đảm rằng một sale đã thanh toán gắn với đúng chi
nhánh, đúng nhân viên, đúng phiên bản công thức và đúng tập biến động nguyên
liệu; retry cùng một thao tác không tạo kết quả nghiệp vụ lần thứ hai; quyền
attendance không bị nhầm với quyền đăng nhập bán hàng; thanh toán điện tử chỉ
được hoàn tất sau xác nhận hợp lệ từ backend.

Đề tài không đặt mục tiêu tạo một sản phẩm thương mại cạnh tranh đầy đủ với các
POS hiện có. Mục tiêu là xây dựng một nguyên mẫu có chiều sâu kỹ thuật, phạm vi
rõ ràng và có bằng chứng kiểm thử cho các thuộc tính quan trọng nhất.

### 1.4. Mục tiêu nghiên cứu

#### 1.4.1. Mục tiêu tổng quát

Thiết kế, xây dựng và đánh giá nguyên mẫu hệ thống POS đa chi nhánh cho chuỗi
cửa hàng cà phê, hỗ trợ bán hàng tiền mặt khi ngoại tuyến, đồng bộ dữ liệu an
toàn, quản lý tồn kho nguyên liệu theo công thức và triển khai các thành phần
web/backend trên AWS.

#### 1.4.2. Mục tiêu cụ thể

1. Khảo sát, phân tích và mô hình hóa các nghiệp vụ cốt lõi về chi nhánh, nhân
   viên, thiết bị POS, attendance, phiên thu ngân, danh mục, bán hàng, thanh toán,
   công thức và kho nguyên liệu.
2. Thiết kế kiến trúc tổng thể, mô hình dữ liệu và API contract cho ứng dụng POS,
   web quản trị và backend; xác định rõ ranh giới dữ liệu toàn chuỗi và dữ liệu
   theo chi nhánh.
3. Xây dựng POS Android native có cơ sở dữ liệu Room, kích hoạt thiết bị một lần,
   đọc dữ liệu từ local, hoàn tất cash sale offline và tự đồng bộ khi có mạng.
4. Xây dựng cơ chế outbox, operation ID và checkpoint để retry không tạo sale
   hoặc stock movement trùng; bảo đảm sale và tiêu hao nguyên liệu được ghi
   nguyên tử ở local và backend.
5. Xây dựng backend NestJS/PostgreSQL cùng web React cho Owner và Store Manager,
   thực thi RBAC và store scope ở phía server.
6. Xây dựng quản lý tồn nguyên liệu theo stock movement, recipe version và
   consumption snapshot để giữ dấu vết của giao dịch quá khứ.
7. Xây dựng luồng thanh toán trực tuyến qua provider mô phỏng; tích hợp ZaloPay
   Sandbox khi được cấp tài khoản và khóa thử nghiệm.
8. Triển khai web/backend/database trên AWS bằng Infrastructure as Code, sau đó
   kiểm thử và đánh giá tính đúng, khả năng phục hồi, phân quyền và khả năng tái
   triển khai của hệ thống.

### 1.5. Câu hỏi nghiên cứu

- **RQ1:** Tổ chức dữ liệu và luồng xử lý trên Android như thế nào để các chức
  năng bán hàng tiền mặt cốt lõi vẫn sử dụng được khi không có kết nối mạng?
- **RQ2:** Outbox, operation ID và checkpoint cần phối hợp như thế nào để quá
  trình đồng bộ theo cơ chế có thể gửi lặp vẫn không tạo dữ liệu nghiệp vụ trùng?
- **RQ3:** Recipe version, consumption snapshot và stock movement giúp duy trì
  và kiểm chứng tính nhất quán giữa sale với tồn kho nguyên liệu ra sao?
- **RQ4:** Cách tách device enrollment, attendance, cashier session và store
  scope có ngăn được truy cập hoặc thao tác bán hàng trái chi nhánh trong các
  kịch bản đã xác định hay không?
- **RQ5:** Kiến trúc AWS và quy trình triển khai nào đủ để vận hành nguyên mẫu
  có HTTPS, log và khả năng tái tạo, đồng thời phù hợp giới hạn chi phí của đồ án?

### 1.6. Đối tượng nghiên cứu

- Quy trình bán hàng tại quầy của chuỗi cà phê có bán món ăn điểm tâm.
- Kiến trúc ứng dụng Android offline-first và kỹ thuật đồng bộ dữ liệu.
- Mô hình tồn kho nguyên liệu theo công thức và biến động kho.
- Xác thực user/device, phân quyền theo vai trò và phạm vi chi nhánh.
- Kiến trúc web, backend, cơ sở dữ liệu quan hệ và triển khai cloud.

### 1.7. Phạm vi đề tài

#### 1.7.1. Phạm vi tổ chức và vai trò

Hệ thống phục vụ một doanh nghiệp duy nhất có nhiều chi nhánh; không phải SaaS
multi-tenant và không sử dụng `tenant_id`.

- **Owner:** quản lý toàn chuỗi, master data, Store Manager, nhân viên và lịch
  sử điều chuyển; xem báo cáo toàn chuỗi.
- **Store Manager (SM):** xem doanh thu, attendance và tồn kho trong phạm vi chi
  nhánh phụ trách; ghi nhận nghiệp vụ kho khi điều kiện đồng bộ cho phép.
- **Cashier/nhân viên:** chấm công và sử dụng POS sau khi xác thực hợp lệ.

#### 1.7.2. Các quy tắc nghiệp vụ thuộc MVP

| Nhóm | Quy tắc được chốt |
|---|---|
| Thiết bị | Mỗi chi nhánh có tối đa một POS `ACTIVE`; vẫn giữ `device_id` và lịch sử thiết bị. POS được enrollment một lần, nhân viên không đăng xuất cửa hàng. |
| Nhân viên | Một nhân viên có một `home_store_id` tại một thời điểm. Owner là vai trò duy nhất được điều chuyển và hệ thống phải lưu lịch sử. |
| Attendance | Nhân viên được check-in/out tại chi nhánh hỗ trợ. MVP không lập lịch và không cần `user_store_assignments`. |
| Cashier | Cashier login chỉ được chấp nhận khi chi nhánh của device trùng `home_store_id`; phiên bị khóa sau 15 phút không hoạt động. |
| Bán hàng | Đơn chưa thanh toán không tác động kho. Sale đã thanh toán là bất biến trong MVP. |
| Kho | Khi sale hoàn tất, nguyên liệu được trừ trong một transaction theo recipe snapshot. Không cho tồn local âm. |
| Offline | Cash có thể hoàn tất offline. POS phải initial sync trước khi bán; web không thay đổi tồn có thể bán khi POS của chi nhánh bị suy ra là offline. |
| Thanh toán điện tử | ZaloPay chỉ dùng khi online và chỉ hoàn tất sau xác nhận hợp lệ ở backend. |
| Biên lai | Cho phép xem và tái tạo biên lai; PDF dùng cho demo do không có máy in vật lý. |

Đơn vị tồn kho cơ sở trong MVP gồm `g`, `ml` và `piece`. Cửa hàng hoạt động từ
06:00 đến 22:00. Hệ thống ghi nhận attendance và phiên tiền mặt cơ bản nhưng
không xây dựng module phân lịch làm việc.

#### 1.7.3. Giả định giới hạn bài toán offline

Khẳng định “không bán âm kho khi offline” chỉ được đánh giá trong các giả định:

1. một active POS cho mỗi chi nhánh;
2. không có đơn hàng từ website, GrabFood hoặc kênh bán khác;
3. web không nhập hoặc điều chỉnh kho của chi nhánh khi POS bị suy ra là offline;
4. POS đã initial sync và kiểm tra đủ mọi nguyên liệu trước khi hoàn tất sale.

Đây là giới hạn có chủ đích của nguyên mẫu, không phải lời giải tổng quát cho
nhiều POS cùng bán trên một kho.

#### 1.7.4. Ngoài phạm vi

- Multi-tenant SaaS, subscription và tenant onboarding.
- Nhiều POS hoạt động đồng thời tại một chi nhánh.
- Refund, partial refund hoặc sửa/xóa sale đã thanh toán.
- Lô hàng, hạn sử dụng, FEFO và truy xuất nguồn gốc.
- Chuyển kho giữa chi nhánh, purchase order, nhà cung cấp và quy đổi thùng/hộp.
- Kênh bán online, loyalty, promotion và modifier phức tạp ngoài size/topping
  cơ bản của MVP.
- Phân lịch, xin nghỉ, tăng ca và payroll.
- Hóa đơn điện tử có giá trị pháp lý.
- Barcode, máy in/cash drawer thật, Google Play và silent APK update.

### 1.8. Phương pháp nghiên cứu và thực hiện

1. **Nghiên cứu tài liệu:** tổng hợp tài liệu chính thức và công trình liên quan
   đến offline-first, local database, outbox, idempotency, transaction, bảo mật
   thanh toán và kiến trúc cloud.
2. **Khảo sát và phân tích nghiệp vụ:** xác định actor, use case, luồng chính,
   ngoại lệ, business rule và ranh giới MVP; đối chiếu với các tính năng phổ biến
   của giải pháp POS F&B hiện có.
3. **Mô hình hóa hệ thống:** xây dựng context diagram, use-case model, ERD,
   state model và sequence diagram cho sale, sync, attendance và payment.
4. **Thiết kế và xây dựng nguyên mẫu:** phát triển lặp theo vertical slice; mỗi
   lát cắt gồm schema, API, giao diện và kiểm thử liên quan.
5. **Thực nghiệm có kiểm soát:** mô phỏng mất mạng, timeout, gửi operation lặp,
   callback lặp, restart ứng dụng và khôi phục kết nối.
6. **Đánh giá:** so sánh kết quả thực nghiệm với tiêu chí nghiệm thu; ghi nhận
   hạn chế và điều kiện áp dụng thay vì suy rộng kết quả ngoài phạm vi.

### 1.9. Thời gian và địa điểm thực hiện

- Thời gian: 10 tuần theo kế hoạch tại Mục 4.
- Môi trường phát triển: máy tính cá nhân, Android emulator, Docker và GitHub.
- Môi trường triển khai thử nghiệm: AWS region `ap-southeast-1` (Singapore).
- Địa điểm thực hiện: cá nhân; trao đổi và báo cáo tiến độ theo yêu cầu của giảng
  viên hướng dẫn/đơn vị đào tạo.

## 2. Nội dung và giải pháp dự kiến

### 2.1. Khảo sát giải pháp liên quan

Phần khảo sát không nhằm xếp hạng sản phẩm thương mại mà dùng để nhận diện các
nhóm chức năng phổ biến và khoảng không kỹ thuật mà đồ án cần tập trung.

| Khía cạnh | Nhận xét khảo sát | Cách tiếp cận của đề tài |
|---|---|---|
| Bán hàng khi mất mạng | Giải pháp thương mại có công bố khả năng bán offline và tự đồng bộ [3]. | Mô tả rõ local source of truth, outbox, retry và dùng test để chứng minh không tạo sale trùng. |
| Kho nguyên liệu | Giải pháp F&B hỗ trợ định lượng và quản lý nguyên liệu [4]. | Lưu recipe version và consumption snapshot; mọi thay đổi số dư có stock movement. |
| Quản trị nhiều cửa hàng | Owner cần xem toàn chuỗi, quản lý cửa hàng cần phạm vi cục bộ. | Backend suy ra/kiểm tra store scope từ user hoặc device, không tin `store_id` do client tự khai. |
| Thanh toán QR | Nhà cung cấp dùng create-order, callback và chữ ký xác thực [8], [9]. | Secret chỉ ở backend; callback idempotent; POS chỉ hoàn tất sale sau xác nhận online. |
| Cloud | Cloud hỗ trợ triển khai tập trung nhưng làm phát sinh yêu cầu vận hành, bảo mật và chi phí [10]. | IaC, log, health check, budget và một môi trường staging có giới hạn. |

### 2.2. Kiến trúc tổng thể

```text
Android POS
(Kotlin/Compose, Room, WorkManager)
        |
        | HTTPS REST/OpenAPI, push/pull sync
        v
NestJS modular monolith ---------------- PostgreSQL
        |                                      |
        |                                      +-- sale, inventory, attendance
        +-- ZaloPay/Fake payment callback
        +-- S3/CloudFront cho web và tài nguyên
        +-- CloudWatch logs

React management web -------- HTTPS REST API
```

Backend được tổ chức dưới dạng modular monolith thay vì microservices để giữ
transaction sale–inventory trong một ranh giới triển khai và phù hợp thời gian
10 tuần. Các module nghiệp vụ dự kiến gồm `auth`, `stores`, `employees`,
`devices`, `attendance`, `register-sessions`, `catalog`, `recipes`, `inventory`,
`sales`, `payments`, `sync`, `reports` và `audit`.

### 2.3. Giải pháp POS offline-first

- Room là nguồn dữ liệu mà UI đọc trực tiếp.
- Initial sync đưa catalog, giá, recipe, roster cần thiết và tồn kho về POS.
- Khi cash sale hoàn tất, Room ghi sale, sale items, recipe/consumption snapshot,
  stock movements, stock balance và outbox operation trong cùng transaction.
- WorkManager chỉ gửi dữ liệu đã có trong outbox; lỗi mạng làm operation quay
  lại trạng thái chờ và được retry với backoff.
- Mỗi operation có ID duy nhất. Backend đặt unique constraint trên ID này và
  trả kết quả cũ nếu nhận lại cùng operation.
- Pull sync dùng checkpoint/cursor; cursor chỉ được lưu sau khi toàn bộ batch đã
  áp dụng thành công vào Room.
- Heartbeat được gửi định kỳ. Web suy ra online từ `last_heartbeat_at`, không lưu
  `is_online` như trạng thái bền vững.

### 2.4. Giải pháp tồn kho theo công thức

Mô hình khái niệm chính:

```text
menu_item -> recipe_version -> recipe_items -> ingredients
store -> stock_balances + stock_movements
sale -> sale_items + consumption_snapshot
```

Các movement trong MVP gồm:

- `RECEIPT`: nhập nguyên liệu;
- `SALE_USAGE`: tiêu hao do sale;
- `ADJUSTMENT`: điều chỉnh sau kiểm kê;
- `WASTE`: hao hụt, hư hỏng hoặc pha sai.

Backend không tính lại sale cũ bằng công thức hiện hành. Consumption snapshot là
bằng chứng về định lượng đã áp dụng tại thời điểm bán. Sale và toàn bộ movement
liên quan được commit hoặc rollback cùng nhau.

### 2.5. Giải pháp xác thực và phân quyền

- Device enrollment, attendance và cashier session là ba khái niệm riêng.
- Owner tạo activation code có thời hạn; POS đổi code lấy device credential và
  bảo vệ credential bằng Android Keystore.
- Employee code gồm 7 chữ số: Owner giữ `1000001`, SM/EMPLOYEE từ `1000701`,
  cấp tăng dần và không tái sử dụng. PIN có rate limit và lockout; không dùng PIN hash như mật khẩu gửi qua
  mạng.
- Attendance tại store khác được lưu cùng snapshot
  `home_store_id_at_check_in` và đánh dấu hỗ trợ.
- Cashier login yêu cầu `device.store_id == employee.home_store_id`.
- Owner điều chuyển nhân viên trong transaction, ghi lịch sử và thu hồi cashier
  session cũ.
- Backend lấy phạm vi chi nhánh từ principal/device đã xác thực và kiểm tra mọi
  store ID liên quan tới request.

### 2.6. Giải pháp thanh toán

Ứng dụng định nghĩa `PaymentProvider` với `ZaloPaySandboxProvider` khi credential
thử nghiệm hợp lệ. Dự án không dùng fake provider theo quyết định phạm vi cập
nhật. Một tệp demo cũ có credential chỉ được giữ local và ignore khỏi Git; khi
triển khai phải viết lại adapter TypeScript, inject secret từ environment/secret
store và kiểm thử callback/query idempotent, không sao chép key vào source code.

POS yêu cầu backend tạo payment, hiển thị QR và theo dõi trạng thái. Backend giữ
secret, xác thực HMAC callback và xử lý callback idempotent. Chỉ trạng thái
`PAID` do backend xác nhận mới cho phép hoàn tất sale. Khi offline, lựa chọn
ZaloPay bị vô hiệu hóa.

### 2.7. Công nghệ dự kiến

| Thành phần | Công nghệ | Mục đích |
|---|---|---|
| POS | Kotlin, Jetpack Compose | Ứng dụng Android native |
| Local data | Room/SQLite | Local source of truth và transaction offline |
| Background | WorkManager | Sync có điều kiện mạng, retry/backoff |
| Bảo mật POS | Android Keystore | Bảo vệ device credential |
| Backend | Node.js, TypeScript, NestJS | REST API modular monolith |
| Data access | Prisma và SQL có kiểm soát | Migration, CRUD, transaction/locking và báo cáo |
| Database | PostgreSQL | Dữ liệu trung tâm, transaction và constraint |
| API contract | OpenAPI | Tài liệu và sinh client |
| Web | React, TypeScript, Vite | Giao diện quản trị Owner/SM |
| Local sandbox | Docker Compose | PostgreSQL phục vụ phát triển/kiểm thử |
| Cloud/IaC | AWS CDK, ECS/Fargate, ECR, RDS, S3, CloudFront, CloudWatch | Triển khai và quan sát hệ thống |
| CI/CD | GitHub Actions | Lint, test, build và triển khai |

Prisma được dùng cho schema, migration, CRUD và truy vấn type-safe thông thường.
SQL trực tiếp chỉ được dùng trong tầng data access khi cần thể hiện transaction,
locking, constraint hoặc truy vấn báo cáo mà ORM không biểu đạt phù hợp; các
truy vấn này phải có kiểm thử tích hợp.

### 2.8. Kế hoạch kiểm thử và đánh giá

#### 2.8.1. Phương pháp kiểm thử

- Unit test cho business rule, recipe consumption và state transition.
- Integration test với PostgreSQL cho transaction, constraint, idempotency và
  store scope.
- Room/database test cho transaction sale–inventory–outbox trên POS.
- API contract test giữa backend với POS/web.
- End-to-end test cho activation, attendance, cashier login, cash checkout,
  sync, payment và báo cáo.
- CDK synth/diff, health check và smoke test sau khi triển khai AWS.

#### 2.8.2. Tiêu chí nghiệm thu

| Mã | Tiêu chí và phép kiểm chứng |
|---|---|
| AC-01 | Ngắt mạng nhưng POS vẫn đọc được catalog, tạo đơn và hoàn tất cash sale từ dữ liệu local. |
| AC-02 | Sale offline vẫn tồn tại sau khi đóng/mở lại ứng dụng và đồng bộ được khi có mạng. |
| AC-03 | Gửi cùng một operation ít nhất 10 lần chỉ tạo một sale và một tập movement nghiệp vụ. |
| AC-04 | Sale paid, consumption snapshot, stock movement và balance cùng commit hoặc cùng rollback. |
| AC-05 | POS từ chối hoàn tất sale nếu bất kỳ nguyên liệu nào không đủ trong tồn local. |
| AC-06 | Thay đổi recipe sau khi bán không làm thay đổi consumption snapshot của sale cũ. |
| AC-07 | Nhân viên được attendance ở store hỗ trợ nhưng bị từ chối cashier login ngoài `home_store_id`. |
| AC-08 | SM không đọc/sửa dữ liệu ngoài phạm vi; request giả mạo `store_id` bị backend từ chối. |
| AC-09 | ZaloPay bị vô hiệu hóa khi offline; callback sai chữ ký hoặc callback lặp không hoàn tất sale sai/trùng. |
| AC-10 | POS, API và web build thành công; API/web staging có health check và log trên AWS. |

Đề tài sẽ ghi nhận thời gian phản hồi, thời gian đồng bộ và tài nguyên sử dụng
trong môi trường thử nghiệm, nhưng không đặt trước một ngưỡng hiệu năng thiếu dữ
liệu nền. Kết luận chính dựa trên tính đúng, khả năng phục hồi và mức độ đáp ứng
các tiêu chí trên.

### 2.9. Bố cục báo cáo dự kiến

Ngoài phần mở đầu, kết luận, tài liệu tham khảo và phụ lục, báo cáo dự kiến gồm:

- **Chương 1 – Tổng quan đề tài và cơ sở lý thuyết:** bối cảnh, bài toán, giải
  pháp liên quan, offline-first, outbox/idempotency, transaction và cloud.
- **Chương 2 – Phân tích yêu cầu và nghiệp vụ:** actor, use case, business rule,
  yêu cầu chức năng/phi chức năng và giới hạn MVP.
- **Chương 3 – Thiết kế hệ thống:** kiến trúc tổng thể, mô hình dữ liệu, API,
  thiết kế sync, tồn kho, xác thực và thanh toán.
- **Chương 4 – Xây dựng và triển khai:** hiện thực POS, backend, web, cơ sở dữ
  liệu, CI/CD và hạ tầng AWS.
- **Chương 5 – Kiểm thử và đánh giá:** môi trường thử nghiệm, kịch bản, kết quả,
  thảo luận, hạn chế và mối đe dọa tới tính hợp lệ của kết quả.
- **Chương 6 – Kết luận và hướng phát triển:** mức độ đạt mục tiêu, đóng góp,
  hạn chế và các hướng mở rộng.

Bố cục này có thể được ánh xạ lại theo mẫu chương bắt buộc của Khoa mà không làm
thay đổi nội dung nghiên cứu.

## 3. Kết quả dự kiến

### 3.1. Sản phẩm phần mềm bắt buộc

1. Ứng dụng Android POS chạy trên emulator, có Room database, device enrollment,
   attendance, cashier login, cash sale offline và đồng bộ.
2. NestJS REST API có OpenAPI specification, RBAC/store scope, sync idempotent,
   quản lý catalog, sale, inventory, attendance và báo cáo.
3. Web React cho Owner và SM quản lý dữ liệu đúng phạm vi.
4. PostgreSQL schema, migration, seed data và bộ dữ liệu demo.
5. Biên tích hợp thanh toán trực tuyến, hợp đồng callback/query và bộ kiểm thử
   idempotency không chứa credential thật.
6. AWS CDK source, container image, web/API staging, log và health check.
7. Bộ test và test report cho các tiêu chí AC-01 đến AC-10.

### 3.2. Sản phẩm có điều kiện

- Tích hợp ZaloPay Sandbox khi có tài khoản và credential.
- Xuất receipt PDF hoàn chỉnh hoặc gửi receipt qua email.
- Version manifest và quy trình tải APK update ngoài Google Play.

Các sản phẩm có điều kiện không được dùng để xác định đồ án thất bại nếu nguyên
nhân là thiếu tài khoản/dịch vụ bên ngoài. Hợp đồng tích hợp, mô hình trạng thái,
quy tắc xác minh callback/query và kiểm thử idempotency vẫn phải hoàn tất; dự án
không thay ZaloPay bằng một fake provider trong sản phẩm demo.

### 3.3. Sản phẩm tài liệu

- Đề cương, đặc tả yêu cầu, use case và business rules.
- ERD, sơ đồ kiến trúc, sequence diagram và ADR.
- OpenAPI documentation và hướng dẫn cài đặt môi trường.
- Test plan, test report và bằng chứng thực nghiệm offline/retry.
- Tài liệu triển khai AWS, vận hành demo và kiểm soát chi phí.
- Báo cáo đồ án, slide và kịch bản/video demo theo yêu cầu.

## 4. Kế hoạch thực hiện trong 10 tuần

| Tuần | Mục tiêu | Công việc chính | Kết quả/điểm kiểm tra |
|---|---|---|---|
| 1 | Hoàn thiện đề cương và yêu cầu | Rà soát tài liệu; khảo sát giải pháp liên quan; chốt câu hỏi nghiên cứu, use case, business rules, phạm vi và backlog; ổn định môi trường | Đề cương được duyệt; scope/ADR; backlog; repo và sandbox hoạt động |
| 2 | Thiết kế nền tảng | Thiết kế ERD, API conventions và kiến trúc; tạo PostgreSQL schema/migration/seed; xây auth, RBAC, store scope, employee và device foundation | ERD/schema v1; API skeleton; test auth/scope; activation API |
| 3 | Master data và kho online | Xây store, employee, catalog, ingredient, recipe version, stock balance/movement; web nền tảng Owner/SM | CRUD và inventory online; test constraint, movement và store scope |
| 4 | Nền tảng Android | Compose navigation, Room, repository, Keystore, activation, initial sync, catalog/recipe/roster/stock local | POS enrollment được; UI đọc Room; khởi động lại không mất trạng thái |
| 5 | Cash sale và recipe consumption | Giỏ hàng, tính tiền, kiểm tra tồn, Room transaction, consumption snapshot, movement, receipt; backend sale transaction | Cash sale online; tồn giảm đúng; AC-04, AC-05, AC-06 có test |
| 6 | Offline sync | Outbox, operation ID, push batch, pull cursor, WorkManager, retry/backoff, heartbeat; mô phỏng timeout/restart | Demo offline-to-online; AC-01, AC-02, AC-03 đạt |
| 7 | Nhân viên và phiên cửa hàng | Attendance hỗ trợ, cashier/home-store rule, PIN protection, idle lock, employee transfer history, cash session cơ bản | AC-07, AC-08 đạt; demo attendance/cashier tách biệt |
| 8 | Báo cáo và thanh toán | Dashboard Owner/SM; cấu hình VAT theo danh mục; ZaloPay Sandbox create/callback/query nếu credential hợp lệ; màn hình, lịch sử và PDF receipt | Báo cáo đúng scope; cash flow và receipt hoàn chỉnh; AC-09 chỉ đạt khi Sandbox khả dụng |
| 9 | AWS và CI/CD | AWS Budget; CDK; ECR, ECS/Fargate, RDS, S3/CloudFront, CloudWatch; GitHub Actions; domain/HTTPS nếu sẵn sàng | CDK synth/diff; staging public; health check, log và bằng chứng triển khai |
| 10 | Đánh giá và hoàn thiện | Regression/E2E; đo và tổng hợp kết quả; sửa lỗi; hoàn thiện báo cáo, slide, demo script và phương án dự phòng | Release candidate; AC-01–AC-10 report; báo cáo và bộ demo |

### 4.1. Thứ tự ưu tiên khi chậm tiến độ

1. Không cắt: cash sale offline, sync idempotent, transaction sale–inventory,
   recipe snapshot, store scope và quy tắc attendance/cashier.
2. Giữ ở mức đủ chứng minh: web quản trị cốt lõi, báo cáo cơ bản, AWS deployment
   và observability.
3. Có thể giảm: trang trí UI, báo cáo nâng cao, cash reconciliation nâng cao và
   PDF receipt hoàn chỉnh.
4. Thực hiện khi đủ điều kiện: ZaloPay Sandbox, email receipt và APK updater.

## 5. Nguồn lực, rủi ro và phương án xử lý

### 5.1. Nguồn lực

- Máy tính cá nhân và Android emulator; không phụ thuộc thiết bị POS vật lý.
- Android Studio và JDK nhúng; Node.js, Git và Docker Desktop/WSL2.
- PostgreSQL local qua Docker Compose.
- GitHub repository và GitHub Actions.
- Tài khoản AWS, domain `congtc145.id.vn` và ngân sách cloud có giới hạn.
- Có mã demo ZaloPay cũ được giữ local, nhưng tính hợp lệ hiện tại của Sandbox
  credential chưa được xác minh.

### 5.2. Rủi ro

| Rủi ro | Ảnh hưởng | Phương án xử lý |
|---|---|---|
| Phạm vi vượt khả năng 10 tuần | Không có bản tích hợp hoàn chỉnh | Bám MVP và thứ tự ưu tiên; mọi mở rộng phải được ghi riêng khỏi scope |
| Sync có nhiều trường hợp biên | Trùng/mất sale hoặc sai kho | Xây vertical slice offline sớm; unique operation ID; test timeout, retry và restart |
| Credential ZaloPay Sandbox không còn hợp lệ | Không demo được QR thật | Giữ ZaloPay là hạng mục có điều kiện; hoàn thành cash flow trước; chỉ tích hợp lại sau khi credential được xác minh/rotate và đưa vào secret store |
| Điều chuyển nhân viên khi POS cũ offline | Cache quyền cũ còn hiệu lực | Thu hồi session; lưu transfer history; yêu cầu POS cũ sync trước khi chuyển có hiệu lực đầy đủ |
| Chi phí AWS | Không duy trì được staging | Tạo Budget trước; phát triển local; một staging; rà soát ALB/Fargate/RDS/NAT trước provision |
| Mạng/AWS lỗi khi bảo vệ | Demo trực tiếp thất bại | Chuẩn bị Docker local, seed data, cash flow offline, APK và video dự phòng |
| Lộ secret vào Git | Rủi ro an toàn thông tin | `.gitignore`, GitHub Secrets/secret store, kiểm tra trước push và rotate khi cần |

## 6. Đóng góp dự kiến và giới hạn của kết quả

Đóng góp chính của đề tài là một thiết kế và nguyên mẫu end-to-end có thể giải
thích và kiểm chứng cho bài toán POS offline nhiều chi nhánh. Cụ thể:

- chứng minh luồng cash sale không phụ thuộc tức thời vào backend;
- chứng minh retry không tạo sale hoặc movement trùng trong các kịch bản test;
- giữ được dấu vết nguyên liệu theo recipe version và consumption snapshot;
- phân tách đúng device enrollment, attendance và cashier authorization;
- cung cấp hạ tầng và quy trình triển khai có thể tái tạo trên AWS.

Kết quả chỉ có hiệu lực trong các giả định MVP, đặc biệt là một active POS cho
mỗi chi nhánh và không có nguồn bán hàng khác khi POS offline. Đề tài không tuyên
bố đã giải quyết xung đột tồn kho tổng quát cho hệ thống phân tán nhiều writer,
không đánh giá tải ở quy mô thương mại và không tạo hóa đơn điện tử pháp lý.

## 7. Hướng phát triển

- Nhiều POS trên một chi nhánh và cơ chế reservation/conflict resolution.
- Chuyển kho có request–ship–receive và audit.
- Lô, hạn sử dụng, FEFO, cảnh báo hết hạn và truy xuất nguồn gốc.
- Purchase order, nhà cung cấp và quy đổi đơn vị nhập hàng.
- Refund/void, phê duyệt waste và quản lý cash movement chi tiết.
- Temporary assignment có phê duyệt, lịch làm việc và payroll.
- ZaloPay production/refund và các phương thức thanh toán khác.
- GrabFood, ShopeeFood, website/mobile ordering, promotion và loyalty.
- Thiết bị ESC/POS, cash drawer, customer display và MDM.
- Hóa đơn điện tử qua nhà cung cấp đáp ứng yêu cầu pháp lý.
- Nghiên cứu multi-tenant bằng một kiến trúc và ADR mới nếu thương mại hóa cho
  nhiều doanh nghiệp; không chỉ thêm `tenant_id` vào các bảng hiện có.

## 8. Tài liệu tham khảo

[1] Đại học Kinh tế Thành phố Hồ Chí Minh, “Cử nhân Đại học chính quy chương
trình Công nghệ thông tin (Chương trình Tiếng Việt chung),” Cổng tuyển sinh UEH.
Truy cập ngày 30/08/2026. <https://tuyensinh.ueh.edu.vn/bai-viet/cu-nhan-dai-hoc-chinh-quy-chuong-trinh-cong-nghe-thong-tin-chuong-trinh-tieng-viet-chung/>

[2] ABET Computing Accreditation Commission, “Criteria for Accrediting
Computing Programs, 2026–2027,” 2026. Truy cập ngày 30/08/2026.
<https://www.abet.org/accreditation/accreditation-criteria/criteria-for-accrediting-computing-programs-2026-2027/>

[3] KiotViet, “Phần mềm quản lý bán hàng Bar–Cafe–Nhà hàng,” mục câu hỏi về bán
hàng khi mất Internet. Truy cập ngày 30/08/2026.
<https://www.kiotviet.vn/bar-cafe-nha-hang>

[4] KiotViet, “Quản lý định lượng nguyên vật liệu cho quán cafe với phần mềm
KiotViet.” Truy cập ngày 30/08/2026.
<https://www.kiotviet.vn/quan-ly-dinh-luong-nguyen-vat-lieu-cho-quan-cafe-voi-phan-mem-kiotviet/>

[5] Android Developers, “Build an offline-first app,” App architecture. Truy
cập ngày 30/08/2026.
<https://developer.android.com/topic/architecture/data-layer/offline-first>

[6] Amazon Web Services, “Transactional outbox pattern,” AWS Prescriptive
Guidance. Truy cập ngày 30/08/2026.
<https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html>

[7] PostgreSQL Global Development Group, “Transaction Isolation,” PostgreSQL
18 Documentation. Truy cập ngày 30/08/2026.
<https://www.postgresql.org/docs/current/transaction-iso.html>

[8] ZaloPay, “Create a new order,” ZaloPay Docs. Truy cập ngày 30/08/2026.
<https://docs.zalopay.vn/docs/specs/order-create/>

[9] ZaloPay, “Callback,” ZaloPay Docs. Truy cập ngày 30/08/2026.
<https://docs.zalopay.vn/docs/developer-tools/knowledge-base/callback/>

[10] Amazon Web Services, “The pillars of the framework,” AWS Well-Architected
Framework. Truy cập ngày 30/08/2026.
<https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html>

[11] North Carolina State University, Department of Computer Science,
“Undergraduate Research or Independent Study,” hướng dẫn proposal cho software
development project. Truy cập ngày 30/08/2026.
<https://csc.ncsu.edu/academics/undergrad/undergraduate-research-or-independent-study/>

[12] Rochester Institute of Technology, “CSEC Capstone Guide 2024–25,” mục
Project Proposal Outline. Truy cập ngày 30/08/2026.
<https://www.rit.edu/computing/sites/rit.edu.computing/files/docs/CSEC/CSEC%20MS%20Capstone%20Guide%202024-25.pdf>

[13] Khoa Công nghệ Thông tin Kinh doanh, Đại học Kinh tế Thành phố Hồ Chí Minh,
“Kế hoạch Thực tập và Tốt nghiệp học kỳ cuối năm 2026, và danh sách các biểu mẫu
thực tập tốt nghiệp.” Truy cập ngày 30/08/2026.
<https://ueh.edu.vn/college/bit/vi/ke-hoach-thuc-tap-va-tot-nghiep-hoc-ky-cuoi-nam-2026-va-danh-sach-cac-bieu-mau-thuc-tap-tot-nghiep-77089>

## 9. Cơ quan/đơn vị dự kiến liên hệ

- Giảng viên hướng dẫn và đơn vị quản lý học phần tại UEH.
- Khoa/đơn vị đào tạo ngành Công nghệ thông tin tại UEH.
- Bộ phận hỗ trợ ZaloPay Developer/Merchant khi đăng ký môi trường Sandbox.
- Bộ phận hỗ trợ AWS chỉ khi phát sinh vấn đề tài khoản hoặc dịch vụ ngoài khả
  năng xử lý qua tài liệu chính thức.

Không có doanh nghiệp đặt hàng hoặc đơn vị thực tập được giả định cho đề tài tại
thời điểm lập đề cương.
