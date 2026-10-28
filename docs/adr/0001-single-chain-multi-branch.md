# ADR 0001: Một chuỗi nhiều chi nhánh, không multi-tenant

- Trạng thái: Accepted

## Quyết định

Hệ thống phục vụ một doanh nghiệp có nhiều store. Không có tenant onboarding,
subscription hoặc `tenant_id`. `store_id` phân tách dữ liệu theo chi nhánh.

## Hệ quả

Giảm đáng kể độ phức tạp trong 10 tuần nhưng không còn được mô tả là SaaS
multi-tenant. Tài liệu Cloud Computing multi-tenant chỉ là tài liệu tham khảo.

