# ADR 0012: Triển khai AWS demo bằng CDK

- Trạng thái: Accepted, 22/10/2026, theo yêu cầu chủ dự án triển khai kế hoạch AWS.
- Bổ sung ADR 0005 và ADR 0009; không thay đổi nghiệp vụ POS.
- Cập nhật 23/10: phần Web/CloudFront được thay bằng [ADR 0013](0013-web-admin-ecs-alb.md)
  theo lựa chọn ECS/ALB của chủ dự án. Certificate Web hiện hành ở Singapore.

## Quyết định

- Tài khoản 634393786371, region `ap-southeast-1`. Đây là database demo AWS độc lập;
  không di chuyển, reset hoặc thay đổi dữ liệu OCI/local. OCI/Vercel tiếp tục hoạt động.
- Dùng `api-aws.congtc145.id.vn` và `admin-aws.congtc145.id.vn`, DNS Cloudflare.
  API ACM ở Singapore, Web ACM ở `us-east-1`; xác thực DNS cần chủ domain thêm CNAME.
- CDK chia Budget, Backend và Web thành ba stack. Hạn chế xác minh CloudFront của
  tài khoản mới không được làm rollback backend trong những lần triển khai sau.
- VPC hai AZ, không NAT; Fargate có public IP nhưng port 3000 chỉ nhận từ ALB.
  RDS PostgreSQL 17 nằm trong isolated subnets, mã hóa, không public, chỉ nhận 5432
  từ task security group. Giữ 20GB gp3, Single-AZ, `db.t4g.micro`.
- RDS yêu cầu TLS: container dựng URL từ từng secret DB, mã hóa username/password
  trong URL và kiểm tra chứng chỉ bằng RDS global CA. Không lưu URL có password
  trong template, outputs hoặc mã nguồn. JWT và sandbox keys nằm trong Secrets Manager.
- Khởi tạo service ở 0 task, đẩy image, chạy migration bằng task tooling một lần,
  seed chỉ database trống có cờ tường minh và hostname được đối chiếu. Sau đó mới
  bật API. Endpoint kiểm tra thật là `/health`, không phải `/api/v1/health`.
- Account hiện ở Free plan. Backup retention phù hợp giới hạn thực tế của
  account: AWS đã chấp nhận 1 ngày sau khi từ chối 3 ngày. Không tự nâng cấp
  sang Paid plan. Chỉ chủ tài khoản xử lý xác minh/đổi gói.
- Database có deletion protection và snapshot khi xóa. ECR/secrets/S3 được giữ
  khi cập nhật/xóa stack thành công; rollback lần tạo đầu dọn tài nguyên chưa dùng.
- Budgets $20/tháng, cảnh báo ACTUAL $10/$20/$30 tới email được chủ dự án chỉ định.
  CloudWatch logs giữ 7 ngày, dashboard và alarms qua SNS; người nhận xác nhận SNS.

## Chi phí và vận hành

Budget là cảnh báo, không phải cơ chế khóa chi tiêu. Free plan/credit có hạn;
không dùng ước tính Free Tier 750 giờ cũ để cam kết chi phí của tài khoản mới.
IPv4 công khai, ALB, storage, secrets và các tài nguyên giữ lại cần được tính riêng.

`node scripts/aws-demo.mjs stop` đưa ECS về 0 trước khi dừng RDS; không tuyên bố
chi phí về 0. RDS tự khởi động lại sau 7 ngày. Không tự động xóa database hoặc
snapshot để tiết kiệm tiền. Runbook tại `infra/README.md`.
