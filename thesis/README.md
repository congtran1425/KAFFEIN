# Báo cáo đồ án KAFFEIN

- [Báo cáo PDF](31231027506_TranChiCong_DATN.pdf).
- [Nguồn Typst](31231027506_TranChiCong_DATN.typst).
- [Tài liệu tham khảo](references/bibliography.bib).
- [Bằng chứng kiểm thử và triển khai](assets/evidence/README.md).
- [Tài liệu kỹ thuật được dẫn trong báo cáo](../docs/README.md).

`assets/` chứa các hình được sử dụng trong báo cáo cùng bản vẽ Draw.io tương
ứng. Các PNG sơ đồ gốc có dữ liệu Draw.io nhúng; có thể mở bằng diagrams.net.

Để biên dịch PDF, cài Typst 0.15.1 và phông Times New Roman, Consolas, rồi
chạy từ thư mục gốc dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/export-thesis.ps1 -TypstPath "C:\path\to\typst.exe"
```

Nếu `typst` đã có trên PATH, có thể bỏ tham số `-TypstPath`.

Thư mục tư liệu của đồ án trên
[Google Drive](https://drive.google.com/drive/folders/1wdwwHIi8vouFsOt2kym_0qYmnL6fI6R4?usp=drive_link)
chứa bản vẽ, hình sơ đồ và ảnh giao diện/cấu hình.
