# 49. CI/CD AWS và POS AWS cài song song

Hồ sơ triển khai ngày 23/10/2026. Quyết định tại
[ADR 0014](../adr/0014-github-oidc-releases-and-pos-aws.md).

## Luồng phát hành

Push nhánh `desktop-work` chạy workflow `AWS release`, gồm:

1. Quality gate: API lint/unit/build/integration với PostgreSQL riêng; Web lint/test/build; CDK tests/synth; Android build/JVM bằng JDK 21.
2. Nhận quyền AWS qua GitHub OIDC, build và push image API/tooling/Web.
3. Change set cập nhật tooling, sau đó task chạy `prisma migrate deploy`.
4. Change set cập nhật API/Web; kiểm tra ECS, ALB và smoke API/Web qua HTTPS.

Tag image chứa commit SHA, run ID và attempt. Concurrency giữ release đang chạy;
PR và nhánh `main` chỉ chạy CI, không nhận quyền phát hành AWS. Markdown nằm ngoài
path filter của workflow deploy. `workflow_dispatch` còn phụ thuộc workflow có
trên default branch; tại mốc triển khai, phát hành dùng push hoặc Re-run jobs.

## IAM và giới hạn thay đổi

- `KaffeinCicdStack` quản lý role `kaffein-github-release` và role dịch vụ `kaffein-cloudformation-release`.
- OIDC trust giới hạn đúng repository và nhánh `desktop-work`, audience `sts.amazonaws.com`; subject dùng owner/repository ID bất biến. Không lưu AWS access key quản trị trong GitHub.
- Source: `scripts/setup-aws-cicd.mjs`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `scripts/aws-release.mjs`. Setup IAM dùng profile quản trị riêng; role GitHub không tự sửa IAM.
- Release dùng previous template, chỉ đổi ba image parameter. Guard kiểm tra change set chỉ sửa ECS task definitions/service; không thêm/xóa tài nguyên hoặc replace service. CDK update hạ tầng chạy riêng và giữ image parameter đang deploy.
- Metric dimensions dùng tên ECS service cố định để image update không kéo theo thay đổi CloudWatch. Release role không có quyền ghi monitoring hoặc ECR policy; ECR chỉ expire image untagged sau bảy ngày, giữ tagged releases phục vụ rollback.
- Migration lỗi thì không rollout API mới. Rollout/smoke lỗi thì khôi phục image parameter cũ; không đảo SQL, seed/reset database hoặc tự start môi trường đã stop.
- Smoke đọc bootstrap password trong bộ nhớ; CI không in secret/token. Bằng chứng phát hành chỉ ghi tag, task ARN, trạng thái và resource changes; không xuất toàn bộ log CloudWatch chứa dữ liệu vận hành lên artifact.

## POS AWS

- Build mặc định `:app:assembleDebug` tạo `KAFFEIN AWS`, package `vn.id.congtc145.coffeepos.aws`, URL `https://api-aws.congtc145.id.vn/api/v1/`.
- Build local dùng `:app:assembleDebug -PposEnvironment=local`; URL emulator là `http://10.0.2.2:3000/api/v1/`. Có thể đặt URL local bằng `-PposApiBaseUrl=http://.../api/v1/`; guard không cho package local trỏ vào AWS hoặc package AWS đổi sang server khác.
- Hai package có Room, outbox, preferences và Android Keystore UID riêng. POS AWS cần activation/enrollment mới do Owner cấp; không sao chép credential/outbox từ server local.
- APK debug của GitHub dùng key tạm của runner, không dùng cập nhật APK đang giữ dữ liệu với signer khác. Ký và phân phối APK release tự động chưa hoàn tất.

## Kết quả phát hành đầu tiên thành công

- [GitHub run 39888131251](https://github.com/congtran1425/Final-Project/actions/runs/39888131251), commit `121c492a24670e6bc714041ba4ceee1c896a07d8`: ba quality jobs API, Web/infra, POS và deploy đều SUCCESS. OIDC, ba image pushes, migration, runtime rollout và public smoke đã thực thi.
- Tag API/Web: `git-121c492a24670e6bc714041ba4ceee1c896a07d8-39888131251-1`; tooling thêm hậu tố `-tooling`. Runtime tag nằm trong CloudFormation Parameters; context CDK giữ bootstrap defaults.
- ECS task definition revision **4**, desired/running **1/1**, pending **0**, một deployment **COMPLETED**; hai ALB target groups healthy. CloudFormation **UPDATE_COMPLETE**. CDK diff ba stack sau release không có khác biệt.
- Cửa sổ health `02:19:16–02:25:54 UTC` ngày 23/10/2026 ghi **71/72** mẫu trả HTTP 200 với database hợp lệ. Một request timeout tại client sau năm giây lúc `02:25:17 UTC`, sau khi ECS hoàn tất rollout lúc `02:23:50 UTC`. Chưa xác định nguyên nhân; các mẫu này không chứng minh zero downtime hoặc SLA. Pipeline smoke độc lập vẫn SUCCESS.
- Chrome sau rollout: Owner và Manager Q1 đăng nhập, mở dashboard, khôi phục phiên khi refresh và đăng xuất đạt; không có page error hoặc failed request ở lượt đầy đủ. Lượt đầu timeout navigation/networkidle sau 30 giây được ghi riêng, không tính là đạt.

## Nguồn đối chiếu và giới hạn

[Danh mục bằng chứng](../../thesis/assets/evidence/README.md) và
[manifest ngày 28/10](../../thesis/assets/evidence/review-20261028.json) lưu số liệu
đã lọc, thời điểm, nguồn và hash. Manifest phân biệt cửa sổ health của run trên
với [đợt sửa mã nhân viên](50-employee-code-rds-correction.md): run `39893576810`,
commit `0666abf`, task revision 5.

Chưa có hồ sơ nghiệm thu đầu-cuối cash offline/reconnect, quỹ, tồn kho hoặc
thanh toán ví Sandbox thật trên APK AWS trong đợt này. Rollback image không
hoàn tác migration. Smoke đăng nhập dùng bootstrap Owner/Q1; khi credential
thay đổi cần cập nhật cơ chế smoke, không reset tài khoản hoặc chạy seed để
sửa lỗi deploy. Hồ sơ này không xác nhận credential Web cho Manager Q2.
