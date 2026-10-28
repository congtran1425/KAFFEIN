# ADR 0014: GitHub OIDC phát hành AWS và POS AWS độc lập

- Trạng thái: Accepted, 23/10/2026, theo yêu cầu CI/CD AWS và lựa chọn của chủ dự án: POS AWS cài song song.
- Bổ sung ADR 0012/0013; giữ nguyên quy tắc một active POS/chi nhánh trong từng backend.

## Quyết định

- Push `desktop-work` chạy quality gate API/Web/CDK/Android, sau đó phát hành API/tooling/Web lên ECR và ECS/ALB hiện có. PR và `main` chỉ chạy CI.
- GitHub OIDC dùng subject immutable của đúng owner ID, repository ID và nhánh `desktop-work`; không nạp IAM admin access key vào GitHub.
- `KaffeinCicdStack` quản lý OIDC provider và hai role. GitHub role push hai ECR, tạo/kiểm tra/execute change set cho `KaffeinStack`, chạy task migration, đọc trạng thái và bootstrap secret để smoke login. Không có quyền trực tiếp đọc DB/JWT/payment secrets hay quản trị IAM/RDS/VPC/S3.
- Role CloudFormation release chỉ đăng ký task definition, cập nhật ECS service hiện có và pass các task roles đã xác định. Hạ tầng thay đổi qua CDK bằng profile quản trị riêng, không cấp quyền đó cho application pipeline.
- CDK cung cấp `ApiImageTag`, `ToolingImageTag`, `WebImageTag`. Release dùng previous template, giữ các parameter còn lại và từ chối change set thêm/xóa tài nguyên, thay service hoặc thay tài nguyên ngoài ECS. Không tạo drift bằng `ecs update-service` ngoài CloudFormation.
- Metric CPU/memory/dashboard dùng tên ECS service cố định đã khai báo, giữ đúng dimensions/ngưỡng hiện có. Không tham chiếu GetAtt Service.Name để tránh mỗi image update kéo CloudWatch resources vào change set release; CI vẫn không được ghi monitoring.
- Tag chứa commit SHA + run ID + attempt, tránh ghi đè tag khi retry. Migration tooling mới chạy trước khi đổi API/Web. Không seed/reset và không tự khởi động môi trường đang stop. Schema migration phải tương thích API trước đó.
- ECR chỉ tự expire image **untagged** sau 7 ngày. Không dùng count limit chung cho tất cả image: nhiều build thất bại có thể làm tag đang deploy/rollback trở thành image cũ bị xóa. Tagged releases được giữ; dọn tag thủ công phải đối chiếu service/task/CloudFormation parameters trước. Theo dõi chi phí storage.
- Quality gate dùng PostgreSQL test riêng; provider transport giả lập trong integration, không thu tiền Sandbox thật trên CI. Một concurrency group cho toàn bộ AWS release.
- Khi phát hành/smoke lỗi: khôi phục parameter image cũ. Không reverse migration hoặc restore database tự động.
- POS mặc định gọi `https://api-aws.congtc145.id.vn/api/v1/`, package `vn.id.congtc145.coffeepos.aws`, nhãn `KAFFEIN AWS`, HTTPS only, thiết kế preview tắt. Package có Room/preferences/Android Keystore UID độc lập. Enrollment AWS tạo mới; không sao chép credential/outbox local lên AWS.
- Local build dùng `-PposEnvironment=local`, giữ package cũ `vn.id.congtc145.coffeepos` và URL emulator local; không cho đổi package AWS sang URL khác hoặc package local sang AWS.
- Bỏ tracking `.env`, SQLite root và `apps/pos/local.properties` trong commit mới, giữ nguyên file trên máy. Lịch sử Git cũ không bị rewrite; recovery private vẫn bị ignore.

## Hệ quả và giới hạn

API và Web cùng task, nên mọi release rolling cả hai. CI có thể chạy mã nguồn đã được tin cậy từ nhánh phát hành; bảo vệ quyền push nhánh này là một phần của kiểm soát deploy. IAM không ngăn mã ứng dụng đã phát hành sử dụng những quyền runtime vốn có của ứng dụng.

Migration tương thích ngược là trách nhiệm review; rollback image không thể hoàn tác dữ liệu/schema đã thay đổi. Hạ tầng IAM được dựng lại bằng `scripts/setup-aws-cicd.mjs --apply`; application template vẫn thuộc CDK. CDK deploy sau này giữ parameter hiện có theo mặc định, không ép image về default context cũ.

APK cài trên desktop dùng debug keystore project-local đã sao lưu. APK debug build ở GitHub có keystore tạm của runner, chỉ là bằng chứng build; không dùng thay APK đang giữ dữ liệu. Chưa cấu hình release signing/distribution tự động.

Nguồn: [GitHub OIDC subjects](https://docs.github.com/en/actions/reference/security/oidc), [CloudFormation change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html), [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html).
