# Hạ tầng AWS KAFFEIN

AWS CDK v2 mô tả hạ tầng của API và Web Admin. Web React được phục vụ bằng Nginx cổng 8080, API NestJS cổng 3000; hai container chạy trong một ECS Fargate task. ALB kết thúc HTTPS và định tuyến theo host. PostgreSQL chạy trên RDS Single-AZ trong isolated subnet; các bucket S3 giữ chế độ private.

Mã nguồn hiện gắn với account `634393786371`, region `ap-southeast-1` và các domain `api-aws.congtc145.id.vn`, `admin-aws.congtc145.id.vn`. Guard trong code từ chối account khác. Muốn tái sử dụng ở account mới cần rà và sửa đồng bộ cấu hình account, ARN, domain và guard trước khi triển khai.

## Kiểm tra mã CDK

Từ thư mục gốc, sau `npm.cmd ci`:

```powershell
npm.cmd run build -w @kaffein/infra
npm.cmd run test -w @kaffein/infra
npm.cmd run synth -w @kaffein/infra -- --quiet
node --test scripts/aws-release.test.mjs scripts/test-container-bootstrap.mjs scripts/test-prisma-cloud-config.mjs
```

Các kiểm thử kiểm tra security group, subnet, giới hạn tài nguyên, HTTPS, private bucket và quy tắc phát hành. Synth tạo CloudFormation template; build/synth thành công chưa xác nhận tài nguyên đang chạy trên AWS.

## AWS profile và cấu hình

Dùng AWS CLI profile hoặc biến môi trường chuẩn. Không lưu access key trong mã nguồn, CDK context hoặc workflow:

```powershell
$env:AWS_PROFILE = 'kaffein'
$env:AWS_REGION = 'ap-southeast-1'
aws sts get-caller-identity
```

Profile phải được cấu hình trước bằng phương thức đăng nhập của tài khoản. GitHub Actions dùng OIDC, không cần access key dài hạn. Các scripts vẫn hoạt động với môi trường AWS chuẩn khi không có cấu hình riêng trong thư mục dự án.

Các giá trị trong [cdk.json](cdk.json) gồm domain, email cảnh báo, `desiredCount`, `enableWeb`, `apiCertArn` và image tag mặc định. `desiredCount` chỉ cho phép 0 hoặc 1. Chứng chỉ ACM phải ở Singapore và được cấp thành công trước khi mở HTTPS. DNS của hai host trỏ tới ALB; Cloudflare dùng DNS only.

## Diff và deploy

Rà thay đổi trước khi áp dụng lên môi trường đã có:

```powershell
npm.cmd run diff -w @kaffein/infra -- KaffeinStack
npm.cmd run deploy -w @kaffein/infra -- KaffeinStack
```

`KaffeinStack` phụ thuộc stack ngân sách `KaffeinBudgetStack`. `KaffeinWebStack` chứa private buckets và certificate phụ trợ; Web đang được phục vụ qua ECS/ALB. Các thao tác tạo, cập nhật hoặc xóa stack có thể thay đổi dữ liệu và phát sinh chi phí; đây không phải bước khởi động local.

CloudFormation dùng ba parameter image:

| Parameter | Mục đích |
| --- | --- |
| `ApiImageTag` | Image API phục vụ yêu cầu |
| `ToolingImageTag` | Image chạy Prisma migration |
| `WebImageTag` | Image Web/Nginx |

Các tag phải tồn tại trong ECR và không ghi đè. Để đổi image khi deploy thủ công, truyền parameter tường minh; các parameter còn lại giữ giá trị đang có:

```powershell
npm.cmd run deploy -w @kaffein/infra -- KaffeinStack --parameters KaffeinStack:WebImageTag=TAG_DA_PUSH
```

Không chỉ sửa context `imageTag` để cập nhật runtime đã được phát hành bằng parameter. Trước migration cần kiểm tra tương thích schema với image API cũ; rollback image không đảo migration SQL.

## Khởi tạo một môi trường trống

1. Kiểm tra account, quyền AWS và cấu hình domain/certificate. Bootstrap CDK một lần nếu account/region chưa có bootstrap stack.
2. Provision với `desiredCount=0`, chưa bật Web nếu chưa có image và HTTPS. Tạo ECR rồi build/push các image API, tooling và Web từ thư mục gốc.
3. Chạy migration trong ECS tooling task, sau đó seed đúng một lần trên database trống. Seed cloud yêu cầu hostname RDS khớp cấu hình và mật khẩu được cấp qua `DEMO_WEB_PASSWORD`.
4. Chờ ACM được cấp, cấu hình DNS, bật Web rồi nâng `desiredCount` lên 1. Kiểm tra API, Web và health của hai target group.

```powershell
npm.cmd exec -w @kaffein/infra -- cdk bootstrap aws://634393786371/ap-southeast-1
```

[scripts/aws-demo.mjs](../scripts/aws-demo.mjs) có các thao tác `migrate`, `seed`, `status`, `start`, `stop` và kiểm tra sau triển khai. `seed` từ chối database đã có dữ liệu. Không chạy lại quy trình khởi tạo trên môi trường đang vận hành.

Container tooling và API nhận secret từ Secrets Manager; không đưa giá trị DB/JWT/provider vào task override hoặc tài liệu. Bootstrap secret chứa trường `DEMO_WEB_PASSWORD` cho tài khoản khởi tạo. Đọc giá trị bằng quyền quản trị phù hợp, giữ ngoài Git và không in trong log phát hành.

## CI/CD

[ci.yml](../.github/workflows/ci.yml) kiểm tra API với PostgreSQL test riêng, Web, CDK và Android. [deploy.yml](../.github/workflows/deploy.yml) chỉ phát hành khi có thay đổi được theo dõi trên `desktop-work`; nhánh nộp mã nguồn không tự phát hành.

[setup-aws-cicd.mjs](../scripts/setup-aws-cicd.mjs) định nghĩa role OIDC và quyền phát hành. [aws-release.mjs](../scripts/aws-release.mjs) dùng template đang có, đổi ba parameter image và thực hiện:

1. Cập nhật image tooling và chờ migration hoàn tất.
2. Cập nhật image API/Web, chờ ECS rollout và ALB health.
3. Kiểm tra HTTPS, đăng nhập, scope và Web SPA.
4. Nếu lỗi, đổi lại image trước đó và kiểm tra; giữ nguyên migration đã áp dụng.

Release guard chỉ cho đổi ECS task definition/service, từ chối thêm/xóa tài nguyên hoặc thay hạ tầng khác. Pipeline không tự bật một môi trường đã dừng. IAM role khóa repository và nhánh; không có quyền quản trị IAM hoặc đọc trực tiếp DB/JWT/provider secret.

## Kiểm tra môi trường đã triển khai

```powershell
node scripts/aws-demo.mjs status
node scripts/aws-demo.mjs smoke
```

Smoke có đăng nhập nên cần quyền đọc bootstrap credential. Khi dùng [smoke-deployment.mjs](../scripts/smoke-deployment.mjs) trực tiếp, cấp `DEMO_WEB_PASSWORD` qua môi trường hoặc tệp `.env` riêng, đồng thời đặt `KAFFEIN_SMOKE_API`, `KAFFEIN_SMOKE_ADMIN` và `KAFFEIN_SMOKE_WEB_HOSTING=ecs-alb` đúng backend cần kiểm tra. Không ghi password vào câu lệnh hoặc Git.

RDS không mở public. API/RDS dùng TLS có kiểm tra CA; API và Web nhận lưu lượng ứng dụng từ ALB qua security group. CloudWatch/SNS theo dõi lỗi và tài nguyên; AWS Budgets là cảnh báo chi phí, không phải giới hạn cứng. Dừng ECS/RDS vẫn còn ALB, storage và các tài nguyên lưu giữ. Chỉ xóa stack hoặc dữ liệu sau khi đã có bản sao lưu và xác nhận phạm vi xóa.
