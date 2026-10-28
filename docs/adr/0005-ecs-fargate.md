# ADR 0005: ECS/Fargate cho NestJS container

- Trạng thái: Accepted with cost review

## Quyết định

Triển khai NestJS container bằng ECS trên Fargate ở `ap-southeast-1` và mô tả
hạ tầng bằng AWS CDK TypeScript.

## Hệ quả

Không quản lý EC2 host nhưng ALB/Fargate có thể đắt hơn một EC2 nhỏ. Phải lập
AWS Budget và đánh giá lại chi phí trước khi provision.

