# KAFFEIN Android POS

POS viết bằng Kotlin và Jetpack Compose. Room là nguồn dữ liệu cho giao diện; WorkManager gửi outbox và kéo dữ liệu từ API. Ứng dụng tách kích hoạt thiết bị, chấm công, đăng nhập thu ngân và phiên quỹ. Thanh toán tiền mặt ghi cục bộ trước khi đồng bộ; thanh toán QR cần xác nhận trực tuyến.

## Yêu cầu

- JDK 21 và Android Studio có hỗ trợ phiên bản Android Gradle Plugin của dự án.
- Android SDK Platform 36.1, Build Tools 36.0.0, Platform Tools.
- Máy ảo hoặc thiết bị Android API 26 trở lên.

Gradle wrapper được lưu trong dự án và dùng phiên bản 9.5.0. Cấu hình phiên bản tại [gradle/libs.versions.toml](gradle/libs.versions.toml); namespace và cấu hình môi trường tại [app/build.gradle.kts](app/build.gradle.kts).

Mở thư mục `apps/pos` bằng Android Studio, chọn Gradle JDK 21 và SDK đã cài. Android Studio tạo `local.properties` chứa đường dẫn SDK riêng của máy; không đưa tệp này vào Git.

## Build local cho Android Emulator

Chạy API local cổng 3000 theo [README gốc](../../README.md), sau đó từ thư mục `apps/pos`:

```powershell
.\gradlew.bat :app:assembleDebug -PposEnvironment=local
.\gradlew.bat :app:installDebug -PposEnvironment=local
```

Trên Linux/macOS, dùng `./gradlew`. API base URL mặc định của bản local là `http://10.0.2.2:3000/api/v1/`; `10.0.2.2` trỏ từ Android Emulator tới máy tính chạy API. APK nằm tại `app/build/outputs/apk/debug/app-debug.apk`.

Với thiết bị thật trên cùng mạng, thay địa chỉ bằng IP LAN của máy tính:

```powershell
.\gradlew.bat :app:installDebug -PposEnvironment=local -PposApiBaseUrl=http://192.168.1.10:3000/api/v1/
```

Đổi IP mẫu thành IP máy chạy API và cho phép thiết bị truy cập cổng 3000. URL phải kết thúc bằng `/api/v1/`.

## Bản kết nối AWS

```powershell
.\gradlew.bat :app:assembleDebug
```

Không truyền `posEnvironment` thì build dùng AWS:

| Môi trường | Package | API |
| --- | --- | --- |
| local | `vn.id.congtc145.coffeepos` | `http://10.0.2.2:3000/api/v1/` hoặc URL local được cấu hình |
| aws | `vn.id.congtc145.coffeepos.aws` | `https://api-aws.congtc145.id.vn/api/v1/` |

Hai package cài song song và giữ database, credential riêng. Bản AWS cố định backend để tránh đưa enrollment hoặc outbox sang máy chủ khác. APK debug dùng cho thử nghiệm; phát hành chính thức cần cấu hình ký riêng, không lưu khóa ký trong repository.

## Kích hoạt và thử nghiệp vụ

1. Đăng nhập Web bằng Owner và tạo mã kích hoạt cho chi nhánh.
2. Nhập mã trên POS, chờ tải dữ liệu ban đầu.
3. Chấm công, đăng nhập thu ngân tại chi nhánh nhà và mở phiên quỹ bằng nhân sự/PIN phù hợp.
4. Thử bán tiền mặt khi có mạng rồi ngắt mạng; khôi phục mạng và kiểm tra trạng thái đồng bộ.
5. Thử QR với backend có cấu hình Sandbox. Chỉ xác nhận hoàn tất sau khi API ghi nhận thanh toán.

Owner có thể đặt PIN cho nhân sự trong Web trước khi thử. Không gỡ ứng dụng, xóa dữ liệu hoặc đổi backend khi còn giao dịch/outbox chưa đồng bộ.

## Kiểm thử

```powershell
.\gradlew.bat :app:testDebugUnitTest -PposEnvironment=local
.\gradlew.bat :app:connectedDebugAndroidTest -PposEnvironment=local
```

Unit test tại `app/src/test` kiểm tra tính tiền, lượng nguyên liệu, điều kiện truy cập và trạng thái thanh toán. Instrumentation test tại `app/src/androidTest` cần thiết bị test riêng. Chỉ chạy các bài có tương tác API với database test tách biệt; không dùng thiết bị đang vận hành để chạy test.
