# ADR 0003: NestJS modular monolith

- Trạng thái: Accepted

## Quyết định

Backend là một deployable NestJS được chia module nghiệp vụ. Không dùng
microservices trong MVP.

## Hệ quả

Transaction sale/inventory đơn giản hơn, deployment gọn hơn và vẫn giữ được
ranh giới module để tách sau này.

