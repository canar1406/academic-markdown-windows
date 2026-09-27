# Windows checkpoint — 27/09/2026

## Kết luận

Đã có **mã nguồn bản Windows thử nghiệm**, transport cho editor, pipeline
Tectonic và script/CI đóng gói. **Chưa có bản `.exe`/ZIP đã build và chạy thật
trên Windows.** Người dùng không có máy Windows/runner; chưa cho phép đưa source
lên dịch vụ bên ngoài.

Worktree tích hợp:
`/Users/Heavietnam/Desktop/markdown-worktrees/zoom`.
Không reset/stash/commit/push các thay đổi cũ. Không thay đổi mã native macOS
trong lượt Windows này.

## Phần đã triển khai

| Phần | Phạm vi thực tế |
| --- | --- |
| Shell | WinUI 3 viết bằng C#, WebView2, x64, cấu hình self-contained dạng thư mục |
| Editor | Dùng lại Muya/Source, Markdown/LMX/theme/exporter TypeScript hiện có |
| Bridge | V1, WebKit giữ nguyên; thêm WebView2, request ID, timeout, validate envelope |
| Tài liệu | New/Open/Save/Save As, UTF-8 nghiêm ngặt, atomic write, kiểm tra sửa bên ngoài |
| Bảo vệ nội dung | Flush trước snapshot; không gán revision mới là đã lưu; chặn đóng khi lưu thất bại |
| Mở lại file | Đọc lại sau Save/Discard, tránh nạp bản cũ của chính file vừa lưu |
| Chọn đích xuất | Hộp thoại Win32 chỉ chọn path, không tạo file trước compile; xác nhận overwrite sau fingerprint |
| Công cụ | Visual/Source, Find/Replace, zoom và xử lý yêu cầu thêm/xóa/di chuyển trang |
| PDF | Shared exporter → C# → Tectonic; offline bundle, hủy process tree, timeout, log, kiểm tra revision |
| Đóng gói | Compiler Windows có checksum, 694 resource files, notices, ZIP + SHA-256 |
| CI | Workflow manual-only, Windows runner, không publish release tự động |

File chính:

- `apps/windows/AcademicMarkdown.Windows/`: UI, WebView2, file dialogs.
- `apps/windows/AcademicMarkdown.Core/`: IO, state, bridge requests, compiler.
- `apps/windows/AcademicMarkdown.Core.Tests/`: kiểm thử phần portable và hợp đồng native.
- `apps/editor/src/host-transport.ts`: transport không phụ thuộc semantic.
- `scripts/windows/Build-Windows.ps1`: lệnh build/đóng gói Windows.
- `.github/workflows/windows.yml`: workflow chưa chạy trên dịch vụ.
- `docs/adr/010-experimental-windows-shell.md`: ngoại lệ bắt đầu Windows sớm.

## Kiểm chứng đã chạy

| Gate | Kết quả và giới hạn |
| --- | --- |
| `pnpm typecheck` | Pass toàn workspace |
| `pnpm test` | 2.190 pass, 8 skip; các PDF integration opt-in không được tính là pass |
| `pnpm build:web` | Pass; còn cảnh báo bundle lớn |
| Transport/bridge unit | 126 pass trong lượt kiểm tra riêng |
| Chromium Windows-transport E2E | 1 pass: bundle thật, Unicode, source edit, Find, LaTeX; **mô phỏng channel**, không phải WebView2 Windows |
| C# core/native-contract tests | 53 pass với opt-in compiler; chạy trên macOS |
| Native PDF qua C# | Tectonic **macOS** thật, `--untrusted --only-cached`, cache trống; fixture offline và HCMUT compile thành công |
| HCMUT output | 5 trang A4; đã xem raster bìa và trang nội dung, kiểm tra tiếng Việt/logo/bảng/header/footer |
| Packaging Node + PowerShell | 39 pass, không skip, dùng PowerShell cục bộ để kiểm tra script |
| Resource staging | 694 file thật được stage và verify; có compiler **Windows**, không chạy nó trên macOS |
| C# shell API compilation | 0 lỗi; 7 warning CS1701/CS1702 trong kiểm tra Roslyn API-only |
| Full WinUI build | **Không pass**: Windows SDK `mt.exe` không chạy trên macOS, MSB3073 / exit 126 |

Cảnh báo không che giấu: bộ test DOM vẫn in cảnh báo KaTeX quirks-mode và tải
Prism trong happy-dom. Chúng không làm gate fail nhưng không được gọi là log sạch.

Trong khi chạy shared gate, phát hiện các test cũ chưa đồng bộ với ADR 009:
registry chưa liệt kê `theme-layout`, và test cover còn từ chối stack/body,
padding hoặc số cột đã được engine hỗ trợ. Đã cập nhật đúng hợp đồng hiện có và
thêm kiểm tra render/geometry; không xóa gate hoặc thay đổi exporter để qua test.

Evidence cục bộ:

```text
output/windows-core-native-check/shared-tests.log
output/windows-core-native-check/typecheck.log
output/windows-core-native-check/core-native-final.log
output/windows-core-native-check/core-native-macos-final.trx
output/windows-core-native-check/hcmut-cover.png
output/windows-core-native-check/hcmut-body.png
apps/windows/AcademicMarkdown.Windows/obj/full-build-macos.log
apps/windows/AcademicMarkdown.Windows/obj/api-compile.rsp
```

Các output/obj này được ignore, không phải thành phần nguồn phát hành.

## Chưa được nghiệm thu

- WinUI startup, WebView2 thật, bàn phím/IME tiếng Việt, native dialogs và close guard.
- Full Windows build/publish và Windows Tectonic; không lấy kết quả macOS thay thế.
- Theme Studio native authoring, sidebar thumbnail/outline và đầy đủ parity với macOS.
- Kéo thả import ảnh Windows: hiện từ chối có thông báo, không im lặng chờ vô hạn.
- Signed installer, ARM64, Store/auto-update và runtime WebView2 offline.
- HCMUT/logo và kiểm kê license/native dependencies trước public redistribution.
- Notice TeX bundle đang ghi checksum/inventory cũ; manifest Windows pin bytes
  hiện tại và ghi rõ chênh lệch, không coi đây là đã duyệt quyền phân phối.

## Bước tiếp theo khi người dùng không có Windows

Workflow đã chuẩn bị cho việc build bằng Windows runner, nhưng vẫn cần người
dùng **cho phép đưa source lên một repository GitHub riêng tư** và cấu hình
quyền/tài khoản phù hợp. Chưa tạo remote, chưa upload source, chưa dispatch CI,
chưa thuê máy ảo hay phát sinh chi phí.

Sau khi được phép: rà soát nội dung sẽ upload → tạo/chọn private repo → chạy
workflow thủ công → sửa lỗi Windows thật nếu có → lấy ZIP và TRX → kiểm tra
runtime tương tác trên Windows. Chỉ khi đó mới có thể giao artifact Windows
với trạng thái kiểm chứng đúng thực tế. Xem `docs/windows-build.md`.
