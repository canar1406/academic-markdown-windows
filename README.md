# Academic Markdown — Trình soạn thảo Báo cáo Học thuật & LaTeX (Markdown-first)

**Academic Markdown** là trình soạn thảo báo cáo học thuật ưu tiên Markdown (Markdown-first), kết hợp trải nghiệm soạn thảo trực quan theo trang A4 với bộ xuất LaTeX/PDF chuẩn xác:

- **macOS (`apps/macos`)**: Ứng dụng gốc (native) viết bằng SwiftUI, nhúng trình soạn thảo Visual (Muya) và Source (CodeMirror) bên trong `WKWebView`, tích hợp thanh điều hướng trang Retina (`480px`), thanh công cụ **Quick Edit Pro** phong cách Microsoft Word Ribbon & Styles Pane, và trình biên dịch PDF ngoại tuyến `tectonic`.
- **Windows (`apps/windows`)**: Ứng dụng gốc WinUI 3 + WebView2 (`win-x64` self-contained portable), dùng chung toàn bộ lõi xử lý Markdown/LMX, giao diện soạn thảo theo trang và trình biên dịch `tectonic.exe` ngoại tuyến.
- **Lõi dùng chung (`packages/*`)**: Các gói TypeScript đảm nhiệm phân tích cú pháp YAML front matter, chỉ thị học thuật `:::lmx`, trích dẫn học thuật chuẩn **IEEE / APA 7th**, áp dụng chủ đề (theme) và sinh mã LaTeX tất định (deterministic).

---

## Tính năng nổi bật

1. **Hai chế độ soạn thảo đồng bộ (Visual & Source)**:
   - **Visual Mode**: Soạn thảo trực tiếp trên trang giấy A4 có phân trang tự động, đầu trang/chân trang, xem trước công thức toán học KaTeX và khối cấu trúc báo cáo HCMUT.
   - **Source Mode**: Soạn thảo mã nguồn Markdown/YAML/LMX bằng CodeMirror kèm tô sáng cú pháp và kiểm tra lỗi thời gian thực.
2. **Viết báo cáo môn học & Bài báo khoa học (IEEE / APA 7th / HCMUT)**:
   - Menu chèn nhanh `/` (**Quick Insert**) mượt mà bằng bàn phím với đầy đủ các khối học thuật:
     - **Trích dẫn IEEE** (`[@key]` -> `[1]`) & **Trích dẫn APA 7th** (`[@key, tr. 15]` -> `(Tác giả, Năm, tr. 15)`).
     - **Danh mục tài liệu tham khảo** (`:::bibliography`) tự động định dạng theo chuẩn IEEE hoặc APA 7th.
     - **Tóm tắt báo cáo & Từ khóa** (`:::abstract`), **Định lý** (`:::theorem`), **Bổ đề** (`:::lemma`), **Mệnh đề** (`:::proposition`), **Hệ quả** (`:::corollary`), **Chứng minh** (`:::proof` kèm ký hiệu `∎`), **Thuật toán / Mã giả** (`:::algorithm`).
     - Các khối báo cáo chuẩn HCMUT: Trang bìa (`:::cover`), Mục lục (`:::toc`), Danh sách hình (`:::list-of-figures`), Danh sách bảng (`:::list-of-tables`), Ngắt trang (`:::pagebreak`).
3. **Quick Edit Pro (Phong cách Microsoft Word)**:
   - **Bộ mẫu nhanh (Styles Gallery)** 2×3: `HCMUT Report`, `IEEE Paper`, `APA 7th`, `Modern Lecture`, `Academic Callout`, `Formal Boxed` và nút đặt lại `Mặc định`.
   - **Phông chữ (Font)**: Chọn họ chữ (`Times New Roman`, `Computer Modern`, `Helvetica / Arial`, `Latin Modern Mono`), cỡ chữ (`pt`), tăng/giảm cỡ chữ nhanh (`A▲` / `A▼`), kiểu chữ (`Đậm`, `Nghiêng`, `Đậm nghiêng`) và màu chữ.
   - **Đoạn văn & Giãn cách (Paragraph)**: Căn lề (`Trái`, `Giữa`, `Phải`, `Đều 2 bên`), giãn dòng, thụt đầu dòng, khoảng cách trên/dưới và đệm trong (`mm`).
   - **Viền & Màu nền khung (Borders & Shading)**: Bật/tắt viền khung, chọn màu nền và màu viền trực tiếp.
4. **Quản lý trang trực quan**:
   - Xem trước hình thu nhỏ (thumbnail) trang A4 sắc nét chuẩn Retina, thêm trang mới, di chuyển trang lên/xuống và xóa trang trực tiếp.
5. **Xuất LaTeX & Biên dịch PDF ngoại tuyến**:
   - Xuất trực tiếp tệp `.tex` hoặc biên dịch ra `.pdf` bằng `tectonic` với gói hỗ trợ TeX ngoại tuyến (`hcmut-offline-v1.ttb`), không cần cài đặt TeX Live rời trên máy người dùng.

---

## Cấu trúc thư mục

- [`apps/editor`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/apps/editor): Ứng dụng web trung tâm (Muya + CodeMirror + quản lý phân trang A4 + thumbnail renderer).
- [`apps/macos`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/apps/macos): Ứng dụng macOS gốc (SwiftUI, Quick Edit Pro, Document Properties, tích hợp WKWebView & Tectonic).
- [`apps/windows`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/apps/windows): Ứng dụng Windows gốc (WinUI 3 + WebView2, `.NET 8.0` x64 portable).
- [`packages/document-core`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/packages/document-core): Bộ phân tích cú pháp front matter, chỉ thị `:::lmx`, trích dẫn IEEE/APA và chỉ mục tài liệu.
- [`packages/latex-exporter`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/packages/latex-exporter): Bộ chuyển đổi Markdown/LMX sang mã nguồn LaTeX chuẩn.
- [`packages/muya-fork`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/packages/muya-fork): Nhân soạn thảo khối WYSIWYG đã tùy biến cho tiếng Việt (IME) và chỉ thị học thuật.
- [`packages/theme-engine`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/packages/theme-engine) & [`packages/theme-hcmut-report-v1`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/packages/theme-hcmut-report-v1): Hệ thống chủ đề báo cáo.

---

## Hướng dẫn phát triển & Kiểm thử

### 1. Cài đặt phụ thuộc & Chạy kiểm thử dùng chung

```bash
npx --yes pnpm@10.15.0 install --ignore-scripts
npx --yes pnpm@10.15.0 -r typecheck
npx --yes pnpm@10.15.0 -r test
npx --yes pnpm@10.15.0 --filter @markdown/editor build
zsh scripts/sync-editor-bundle.sh
```

### 2. Build & Chạy ứng dụng trên macOS

```bash
# Chạy bộ kiểm thử SwiftPM
swift test --package-path apps/macos

# Biên dịch bản Release (Universal arm64 + x86_64)
swift build --package-path apps/macos --configuration release --arch arm64 --arch x86_64
```

Sau khi thay đổi mã nguồn ở `apps/editor` hoặc `packages/*`, luôn chạy lại `zsh scripts/sync-editor-bundle.sh` để cập nhật bundle web vào `apps/macos/Sources/MarkdownMacOS/Resources/Web`.

### 3. Build trên Windows x64 (hoặc qua GitHub Actions)

Trên máy Windows x64 (cài sẵn PowerShell 7 x64, Node 22.x, `pnpm 10.15.0`, `.NET SDK 8.0.425` và Visual Studio 2022 C++/WinUI 3 build tools):

```powershell
./scripts/windows/Build-Windows.ps1
```

Hoặc kích hoạt workflow tự động trên GitHub Actions (`windows.yml`):

```bash
gh workflow run windows.yml --ref codex/windows-ci -f acknowledge_private_experimental_build=true
```

Chi tiết về cách đóng gói và vận hành bản Windows x64 được mô tả trong [`apps/windows/README.md`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/apps/windows/README.md) và [`docs/windows-build.md`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/docs/windows-build.md).

---

## Bản quyền & Lưu ý phân phối

- **Bản quyền phần mềm**: © 2026 **heavietnam**. Bảo lưu mọi quyền (*All rights reserved*).
- Biểu trưng (logo) và mẫu báo cáo HCMUT đi kèm chỉ phục vụ mục đích học tập, nghiên cứu và phát triển nội bộ; không tự ý phân phối công khai khi chưa được cấp phép.
- Các thông báo bản quyền phần mềm bên thứ ba được lưu giữ đầy đủ tại [`THIRD_PARTY_NOTICES.md`](file:///Users/Heavietnam/Desktop/markdown-worktrees/zoom/THIRD_PARTY_NOTICES.md).
