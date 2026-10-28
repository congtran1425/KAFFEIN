# ADR 0013: Web Admin chạy cùng ECS task và ALB của API

- Trạng thái: Accepted, 23/10/2026, chủ dự án chọn ECS/ALB trong phiên triển khai.
- Bổ sung ADR 0005/0012, thay phương án Web S3 + CloudFront của AWS demo.

## Quyết định

- Web React build thành image Nginx unprivileged, port 8080, không chứa secret.
  Image Web có ECR/tag riêng; API giữ image hiện hành. Hai container cùng một
  Fargate task 256 CPU/512 MiB, Web giới hạn 64 MiB. Không thêm service/ALB/NAT.
- ALB hiện có dùng SNI và host rule: `admin-aws.congtc145.id.vn` đến Web:8080;
  API vẫn đến API:3000. Cả hai port chỉ nhận từ security group ALB.
- ACM certificate Web mới nằm tại Singapore, do CDK quản lý; tái sử dụng bản ghi
  DNS validation đã có. Chứng chỉ us-east-1 cũ được giữ, không gắn vào ALB.
- Bỏ tài nguyên CloudFront khỏi CDK. Hai bucket S3 private và dữ liệu đã upload
  được giữ nguyên; S3 phục vụ lưu trữ artifact/backup, không làm public website.
- HTML không cache, asset có tên hash cache immutable; SPA deep links trả index,
  asset bị thiếu và `/api/` trên Web trả 404. Có health endpoint riêng.
- Provision ECR/certificate trước; build/push image và kiểm thử container rồi mới
  bật `enableWeb`. Rolling deployment, min healthy 100%, circuit breaker giữ API.
  Không migration/seed/reset DB hoặc thay enrollment POS trong thay đổi hosting.

## Hệ quả

Web và API cùng vòng đời start/stop và cùng lần rolling deployment. Lỗi container
essential có thể làm task khởi động lại; kiểm thử health cả hai, giới hạn bộ nhớ
Web và theo dõi task/target/CloudWatch trước khi nghiệm thu. Không có CDN/cache
phân tán. Nếu cần scale Web độc lập, thiết kế service riêng bằng ADR tiếp theo.

Cloudflare thêm CNAME `admin-aws` đến ALB hiện có, DNS only. OCI/Vercel và database
local tiếp tục giữ nguyên. Thông tin riêng của lần deploy lưu trong recovery/private.

Nguồn: [ECS multiple target groups](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/register-multiple-targetgroups.html),
[ACM DNS validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html),
[Nginx unprivileged](https://github.com/nginx/docker-nginx-unprivileged).
