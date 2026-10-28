# ADR 0002: Một active POS cho mỗi chi nhánh trong MVP

- Trạng thái: Accepted

## Quyết định

Mỗi store có tối đa một device ACTIVE. Vẫn giữ `device_id` và lịch sử thiết bị.

## Hệ quả

Giảm xung đột tồn kho offline. `device_id` vẫn cần cho enrollment, revoke,
operation origin, checkpoint, app version và audit.

