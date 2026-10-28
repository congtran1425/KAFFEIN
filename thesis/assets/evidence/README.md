# Bằng chứng dùng trong báo cáo

[aws-screenshots-20261028.json](aws-screenshots-20261028.json) ghi thông số
đọc trực tiếp từ 14 PNG người dùng cung cấp, kèm SHA-256. Đây là bộ ảnh
Console/GitHub bổ sung; không có phép đo tải hoặc nghiệm thu nghiệp vụ mới.
Giữ riêng timestamp trên ảnh, thời điểm của log và ngày tiếp nhận tư liệu.

[review-20261028.json](review-20261028.json) tổng hợp dữ liệu đã đối chiếu ngày
28/10/2026 từ log và hồ sơ phát hành ngày 23/10/2026. Lượt rà soát chỉ đọc dữ
liệu có sẵn; không chạy lại nghiệp vụ, truy cập AWS hay sửa cơ sở dữ liệu.

Manifest ghi số bài API/Web, trạng thái build JVM/APK, commit và GitHub run
của bản phát hành. Chín tệp bằng chứng đi kèm nằm trong
[results-20261023/](results-20261023/), nên có thể đối chiếu ngay từ bản nộp.

Năm tệp giữ nguyên byte và SHA-256 của bản gốc: ba log API/Web,
`github-jobs.json` và `final-rollout-health.json`. Ba log API/Web dùng
UTF-16LE có BOM, theo định dạng xuất của PowerShell.

Bốn tệp còn lại đã lọc dữ liệu riêng: `final-state.json`,
`public-verification.json`, `cicd-pos-build.log` và
`deployment-final-state.json`. Phần lọc loại digest xác thực, hồ sơ nhân viên,
định danh tài khoản AWS, IP nội bộ và đường dẫn máy; giữ thời điểm, commit,
tag image, task revision, số task, trạng thái target và kết quả kiểm tra.
Log POS được chuyển sang UTF-8. Mỗi mục ghi `originalSha256` của bản gốc,
`sha256` và `bytes` của tệp đi kèm, cùng trạng thái `redacted` và nội dung lọc.
Không sửa các tệp gốc khi tạo bộ bằng chứng này.

Hai bài integration bị bỏ qua gồm một bài MoMo Sandbox tạo/query QR và một
bài diễn tập Android Room; không phải hai bài thanh toán ví thật. Log Android
xác nhận tác vụ JVM và build thành công nhưng không ghi tổng số bài, nên
manifest không xác nhận con số 54. Cửa sổ 71/72 health probe thuộc lượt phát
hành sớm hơn trong cùng ngày, không gộp với run sửa mã nhân viên.

Khi dẫn số liệu trong luận, giữ đúng ngày, loại kiểm thử và giới hạn ở
manifest. Hash giúp đối chiếu tệp đã đọc, không tự chứng minh tệp là báo cáo
của mọi thay đổi trong repository. Bộ bằng chứng đi kèm không cần dữ liệu
phục hồi riêng để kiểm tra số liệu và SHA-256 của bản nộp.
