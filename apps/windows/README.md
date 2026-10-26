# Ứng dụng Academic Markdown trên Windows (WinUI 3 / WebView2)

Thư mục này chứa bản cài đặt giao diện gốc (native shell) dùng **WinUI 3 + WebView2** cho hệ điều hành Windows x64 theo kiến trúc tại `docs/adr/010-experimental-windows-shell.md`. Toàn bộ ngữ nghĩa Markdown, chỉ thị học thuật `:::lmx`, trích dẫn IEEE/APA, chủ đề (theme) và bộ xuất LaTeX vẫn nằm trong các gói TypeScript dùng chung; tầng C#/WinUI chỉ phụ trách đọc/ghi tệp an toàn và gọi tiến trình biên dịch PDF ngoại tuyến.

**Trạng thái hiện tại:** Workflow Windows x64 (`40210398000`, commit `9c00f67` ngày 25/10/2026) đã vượt qua toàn bộ các cổng kiểm tra: kiểm tra kiểu tĩnh, unit test toàn dự án, kiểm thử đóng gói tài nguyên, biên dịch PDF tiếng Việt ngoại tuyến bằng `tectonic.exe`, build/publish WinUI 3 (`0` cảnh báo, `0` lỗi) và kiểm thử khởi chạy cửa sổ thực tế (`startup-smoke.json`).

Ứng dụng hỗ trợ đầy đủ vòng đời tệp (`New`, `Open`, `Save`, `Save As`), chuyển đổi chế độ `Visual` / `Source`, Tìm kiếm & Thay thế (`Find` / `Replace`), thu phóng (`Zoom`), thao tác trang (`Thêm trang`, `Xóa trang`, `Di chuyển trang`) và xuất PDF ngoại tuyến (`Export PDF`).

---

## Cách Build trên máy Windows x64

Cài đặt đầy đủ công cụ theo hướng dẫn trong `docs/windows-build.md`:
- **PowerShell 7 x64**
- **Node.js 22.x** và **pnpm 10.15.0**
- **.NET SDK 8.0.425**
- **Visual Studio 2022 Windows SDK / C++ Build Tools** (hỗ trợ WinUI 3)

Từ thư mục gốc của dự án, mở PowerShell 7 và chạy:

```powershell
./scripts/windows/Build-Windows.ps1
```

Kịch bản trên sẽ tự động thực hiện tuần tự:
1. Cài đặt phụ thuộc khóa phiên bản (`pnpm install --frozen-lockfile`).
2. Chạy `pnpm typecheck` và `pnpm test` cho toàn bộ các gói dùng chung.
3. Chạy bộ kiểm thử đóng gói tài nguyên Windows.
4. Build mới gói giao diện web (`pnpm build:web` -> `apps/editor/dist`).
5. Gom tài nguyên và kiểm tra mã băm SHA-256 (`Stage-Resources.ps1`).
6. Chạy kiểm thử `.NET Core` kèm bài kiểm tra biên dịch PDF thực tế bằng `tectonic.exe`.
7. Biên dịch và xuất bản (publish) ứng dụng WinUI 3 dạng tự chứa (`self-contained`) và đóng gói thành tệp `.zip`.

Kết quả đầu ra nằm tại `apps/windows/artifacts/build-<UTC timestamp>-<unique suffix>/`:

```text
AcademicMarkdown-windows-x64-experimental.zip
AcademicMarkdown-windows-x64-experimental.zip.sha256
README.md
test-results/windows-core.trx
AcademicMarkdown-windows-x64-experimental/
  AcademicMarkdown.Windows.exe
  ... các tệp DLL của .NET / Windows App SDK / ứng dụng ...
  README.md
  THIRD_PARTY_NOTICES.md
  SHA256SUMS
  Resources/
    Web/        # bản build mới từ apps/editor/dist
    Tools/      # tectonic.exe cho Windows + giấy phép MIT
    TeX/        # gói hỗ trợ TeX ngoại tuyến (hcmut-offline-v1.ttb)
    Theme/      # biểu trưng, phông chữ bổ trợ và thông báo bản quyền
    Licenses/   # thông báo bản quyền + manifest đóng gói
    runtime-resources.json
    resource-inventory.json
```

> **Quan trọng:** Khi sử dụng hoặc sao chép sang máy khác, hãy **giữ nguyên toàn bộ thư mục sau khi giải nén**. Đây là gói ứng dụng Portable gồm nhiều tệp đi kèm, **không phải** một tệp `.exe` đơn lẻ. Máy đích chỉ cần có sẵn **Microsoft Edge WebView2 Evergreen Runtime** và phông chữ **Times New Roman** (không cần cài Node.js hay .NET SDK).

---

## Kiểm tra nhanh trên macOS / Linux

Bạn có thể chạy bộ kiểm tra tính toàn vẹn của manifest và kịch bản đóng gói Windows ngay trên macOS:

```sh
node --test scripts/test/windows-*.test.mjs
node scripts/windows/resource-tools.mjs validate
```
