# Academic Markdown — Bản Portable cho Windows x64

> **Lưu ý:** Đây là bản dựng kỹ thuật dạng Portable (chưa ký số công khai - unsigned). Không tách lẻ tệp `.exe` ra khỏi thư mục chứa nó.

## Cách chạy ứng dụng

1. Giải nén **toàn bộ tệp `.zip`** vào một thư mục có quyền đọc/ghi trên máy tính (ví dụ: `D:\AcademicMarkdown\`).
2. Mở thư mục `AcademicMarkdown-windows-x64-experimental` và chạy tệp **`AcademicMarkdown.Windows.exe`**.
3. **Không** di chuyển riêng tệp `AcademicMarkdown.Windows.exe` ra ngoài mà bỏ lại các tệp `.dll` và thư mục `Resources/` đi kèm.
4. Máy người dùng **không cần** cài đặt Node.js, pnpm hay .NET SDK.

---

## Yêu cầu hệ thống trên máy Windows

- **Hệ điều hành**: Windows 10 64-bit (phiên bản 2004 / build 19041 trở lên) hoặc Windows 11 64-bit.
- **Microsoft Edge WebView2 Evergreen Runtime**: Thường đã có sẵn trên Windows 10/11 hiện đại. Nếu máy chưa có, hãy cài đặt bộ WebView2 Runtime chính thức của Microsoft trước khi mở ứng dụng.
- **Phông chữ**: Mẫu báo cáo sử dụng phông **Times New Roman** (có sẵn mặc định trên Windows). Các phông Latin Modern Mono bổ trợ và gói biên dịch TeX ngoại tuyến đã được tích hợp sẵn trong thư mục `Resources/`.

---

## Kiểm tra tính toàn vẹn tệp tin

- Tệp `*.zip.sha256` đi kèm dùng để đối chiếu mã băm SHA-256 của toàn bộ gói `.zip`.
- Tệp `SHA256SUMS` bên trong thư mục ghi lại mã băm của từng tệp thành phần.
- `Resources/resource-inventory.json` và `Resources/runtime-resources.json` dùng để xác thực tài nguyên trình soạn thảo và bộ biên dịch PDF ngoại tuyến `tectonic.exe`.
- Vui lòng giữ nguyên các tệp thông báo bản quyền: `THIRD_PARTY_NOTICES.md`, `Resources/Licenses/`, `Resources/Tools/TECTONIC_LICENSE`, và `Resources/Theme/Fonts/`.

---

## Lưu ý về bản quyền & Phân phối

- Biểu trưng (logo) và tài nguyên mẫu báo cáo HCMUT đi kèm trong bản dựng nội bộ này chỉ dùng cho mục đích học tập, nghiên cứu và thử nghiệm kỹ thuật; không tự ý phát hành thương mại hoặc phân phối công khai khi chưa có sự chấp thuận bản quyền.
- Hãy luôn sao lưu các tệp `.md` quan trọng trong quá trình sử dụng thử nghiệm.
