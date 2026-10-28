# 50. Sửa mã nhân viên Owner/staff trên RDS

Hồ sơ phát hành ngày 23/10/2026. Quyết định tại
[ADR 0015](../adr/0015-owner-and-staff-employee-codes.md).

## Nguyên nhân và mã đích

RDS có Owner `users.id=1`, `employee_code=NULL`; SM Q1 được sequence cấp
`1000001`. API ghép mã dự phòng `1000000 + users.id` cho Owner, làm Web hiển
thị trùng dù unique index vẫn hoạt động với mã thực khác null.

| Người dùng | users.id giữ nguyên | Mã nhân viên mới |
|---|---|---|
| Võ Minh Anh — Owner | 1 | 1000001 |
| Trần Chí Công — SM Quận 1 | 2 | 1000701 |
| Phạm Quang Minh — Nhân viên Quận 1 | 3 | 1000702 |
| Lê Quang Khánh — SM Quận 2 | 4 | 1000703 |

Mã cấp tiếp theo là `1000704` nếu chưa có lần cấp số khác. Giữ nguyên user PK,
home store, role, email, mật khẩu, PIN và device credential. Không tạo thêm
credential Web cho SM Q2 trong thay đổi này.

## Migration và seed

- Migration `20261023040000_unique_owner_employee_codes` khóa users trong một transaction, giới hạn chờ lock năm giây và thực thi 30 giây; từ chối nhiều Owner hoặc POS báo outbox chưa đồng bộ.
- Chuyển mã staff cũ dưới `1000701` theo ID tăng dần, giữ mã hợp lệ cao hơn và không lùi sequence đã tiêu thụ. Restart sequence bằng DDL có rollback. Owner lưu `1000001`; `employee_code` NOT NULL/UNIQUE, staff từ `1000701`. Trigger tiếp tục cấm cập nhật mã thông thường sau correction.
- Ghi audit `EMPLOYEE_CODE_REASSIGNED` old/new và delta nhân sự theo home store, không chứa PIN/hash. Không viết lại paid sale payload hoặc tạo alias đăng nhập cho mã cũ.
- Employees/Attendance bỏ fallback tự ghép từ user ID; sync trả mã lưu trong DB.
- Hai seed dùng chung `prisma/seed-employees.ts`: fresh DB tạo đúng bốn mã trên, chạy lặp giữ ID/mã. Không chạy lại seed trên RDS đã có dữ liệu.

## Điều kiện và kiểm thử trước phát hành

`scripts/inspect-aws-employee-codes.mjs` đối chiếu đúng account/cluster/DB bằng
query READ ONLY trong task tooling trên mạng private. Không mở public PostgreSQL
hoặc đưa secret vào overrides/logs.

Bản đối chiếu trước migration ghi bốn users, sequence `1000003`, không có sale,
attendance, payment hoặc stock movement; có một cashier session và một device.
POS AWS online, không còn pending outbox, sale hoặc online payment attempt tại
mốc kiểm tra. Checksum credential/PIN/enrollment được dùng để so sánh, không
ghi giá trị bí mật vào hồ sơ.

Kiểm thử migration dùng PostgreSQL riêng tại `localhost:55435`, database
`coffee_pos_employee_e2e`. Kiểm thử seed dùng `coffee_pos` trong cùng container
test, tách database vận hành. Fresh/repeat master seed và Prisma seed cho đúng
mã, giữ bốn ID khi lặp. Năm test migration bao gồm legacy correction, không lùi
sequence, nhiều Owner, pending outbox và rollback khi hết dải mã.

## Kết quả phát hành

**Hoàn tất trên AWS lúc 10:24 ngày 23/10/2026 (Asia/Ho_Chi_Minh).**

- Commit `0666abfdca37524df0eb539133e3e9c385058c01`, nhánh `desktop-work`; [GitHub run 39893576810](https://github.com/congtran1425/Final-Project/actions/runs/39893576810) SUCCESS ở ba quality jobs và deploy.
- Tooling migration chạy trước rolling API/Web; RDS có **15 migrations hoàn tất**. Bốn mã thực tế khớp bảng trên; sequence `last_value=1000704`, `is_called=false`. Có bốn audit old/new và ba delta nhân sự theo home store.
- CloudFormation **UPDATE_COMPLETE**; ECS task revision **5**, desired/running **1/1**, rollout **COMPLETED**; API/Web targets healthy. Tag chung `git-0666abfdca37524df0eb539133e3e9c385058c01-39893576810-1`; tooling thêm `-tooling`.

Log kiểm thử lưu tại đợt phát hành ghi:

| Hạng mục | Kết quả và phạm vi |
|---|---|
| API unit | 164 bài đạt, 20 bộ kiểm thử đạt |
| API integration | 63 bài đạt, hai bài tùy chọn bỏ qua; bảy bộ kiểm thử đạt |
| Hai bài bỏ qua | Một bài tạo/query MoMo Sandbox, không thanh toán ví; một bài diễn tập Android Room kết nối API |
| Web | 11 bài đạt; build API/Web đạt |
| Android | Log xác nhận `testDebugUnitTest` và `assembleDebug` thành công; không cung cấp tổng số bài JVM hoặc bằng chứng thực thi instrumentation |
| API lint | Không có error, còn 116 warning có sẵn tại mốc kiểm thử |

CI thực thi quality gate Android/CDK và public smoke. Log local không tự nhúng
commit Git; việc liên kết với đợt phát hành dựa trên hồ sơ cùng đợt và metadata
CI/CD. Đây là số liệu lịch sử, không phải kiểm thử chạy lại ngày 28/10.

## Hậu kiểm dữ liệu và phân quyền

- Owner/Manager Q1 đăng nhập API trả 200 bằng mật khẩu cũ; tìm riêng mỗi mã trả đúng một người. Manager Q1 chỉ thấy `1000701`/`1000702`; ép store 2 vẫn trả 403.
- Web: Owner thấy bốn dòng đúng mã, Manager Q1 thấy hai dòng; không có lỗi JavaScript ở lượt ghi nhận. Phạm vi này không đại diện mọi endpoint của ứng dụng.
- User PK, tên, role, home store, email, status giữ nguyên; digest credential Web, PIN và device enrollment khớp. Sale/attendance/payment/stock movement vẫn bằng 0, device vẫn bằng 1.
- Cashier sessions quan sát tăng từ 1 lên 2 trong thời gian triển khai; migration không ghi/xóa bảng này. Không khẳng định số phiên không đổi hoặc quy thay đổi đó cho migration.

POS giữ ngữ cảnh thu ngân với mã cũ cần khóa rồi đăng nhập lại bằng mã mới;
PIN giữ nguyên, không xóa dữ liệu/enrollment. OCI/local chỉ nhận migration khi
được deploy/migrate riêng.

## Nguồn đối chiếu

[Danh mục bằng chứng](../../thesis/assets/evidence/README.md) và
[manifest ngày 28/10](../../thesis/assets/evidence/review-20261028.json) lưu kết quả
đã lọc, đường dẫn nguồn, timestamp, SHA-256 và giới hạn. Cửa sổ 71/72 health probe
thuộc [đợt CI/CD trước đó](49-aws-cicd-and-pos-aws.md), không phải run sửa mã
nhân viên. Ảnh AWS bổ sung ghi revision 6 và một run khác; không dùng số bài của
run `39893576810` làm số bài của lượt sau.
