# ADR 0004: Android native cho POS

- Trạng thái: Accepted

## Quyết định

POS dùng Kotlin, Jetpack Compose, Room và WorkManager; demo bằng Android
emulator. Không dùng Flutter hoặc React Native.

## Hệ quả

Ưu tiên offline/background work và khả năng tích hợp Android POS sau này, đổi
lại không chia sẻ TypeScript model trực tiếp; OpenAPI sẽ sinh client Kotlin.

