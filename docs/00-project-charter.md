# Project charter

## Đề tài

**Thiết kế và xây dựng hệ thống POS đa chi nhánh hỗ trợ hoạt động ngoại tuyến
và quản lý kho nguyên liệu cho chuỗi cà phê KAFFEIN trên nền tảng AWS.**

Tên tiếng Anh làm việc:

> Design and Development of a Multi-Branch Offline-Capable POS and Ingredient
> Inventory Management System for the KAFFEIN Coffee Chain on AWS

## Bối cảnh

- Đồ án cá nhân, ngành Công nghệ thông tin.
- Thời gian kế hoạch: 10 tuần.
- Ngôn ngữ tài liệu và UI: tiếng Việt.
- Tiền tệ: VND.
- Múi giờ nghiệp vụ: `Asia/Ho_Chi_Minh`; timestamp lưu trong database bằng UTC.
- Domain đã sở hữu: `congtc145.id.vn`, chưa cấu hình bản ghi cho dự án.

## Mô hình tổ chức

Hệ thống phục vụ chuỗi cà phê KAFFEIN có bán món điểm tâm. Owner quản lý nhiều chi
nhánh; mỗi chi nhánh có Store Manager và nhân viên. Đây không phải hệ thống
multi-tenant và không có `tenant_id`.

## Mục tiêu kỹ thuật chính

1. POS Android vẫn bán hàng tiền mặt khi mất kết nối.
2. Đồng bộ không tạo giao dịch trùng và có thể phục hồi sau lỗi.
3. Tồn kho nguyên liệu được trừ theo phiên bản công thức khi hoàn tất sale.
4. Dữ liệu doanh thu, kho, attendance và POS được phân tách theo chi nhánh.
5. Backend và web được triển khai có thể lặp lại trên AWS.

## Ràng buộc đã chốt

- Một active POS cho mỗi chi nhánh trong MVP.
- Không barcode, máy in thật, lô/hạn sử dụng, refund, chuyển kho hay kênh online.
- POS không phân phối qua Google Play.
- Cash hoạt động offline; ZaloPay và MoMo Sandbox chỉ hoạt động online.
- Sale đã thanh toán là bất biến trong MVP.

## Nguồn tham khảo học phần

File `Final Exam - Cloud Delopment Report and Presentation.pdf` yêu cầu một bài
Cloud Computing POS SaaS multi-tenant trên AWS. Đồ án này kế thừa phần triển
khai AWS, VPC/IAM/CloudWatch, public URL, email/receipt và cấu trúc báo cáo;
không kế thừa yêu cầu multi-tenant vì phạm vi tốt nghiệp đã chốt là một chuỗi.

