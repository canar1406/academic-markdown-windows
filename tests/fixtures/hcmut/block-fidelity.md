---
lmx:
  schema: 1
  theme: hcmut-report-v1
  structure:
    cover: true
    toc: true
    tocDepth: 4
    listOfFigures: true
    listOfTables: true
  cover:
    university: ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH
    school: TRƯỜNG ĐẠI HỌC BÁCH KHOA
    faculty: KHOA KHOA HỌC ỨNG DỤNG
    reportType: BÁO CÁO KIỂM THỬ THỊ GIÁC
    title: ĐỐI CHIẾU TỪNG KHỐI MARKDOWN VÀ LATEX
    major: TOÁN ỨNG DỤNG
    council: GIẢI TÍCH 2
    supervisor: TS. NGUYỄN VĂN A
    secretary: TS. TRẦN THỊ B
    students:
      - name: Nguyễn Văn An
        id: "2210001"
    locationDate: TP. HỒ CHÍ MINH, 2026
  header:
    enabled: true
    institution: Trường Đại Học Bách Khoa - Đại học Quốc gia TP.HCM
    faculty: KHOA KHOA HỌC ỨNG DỤNG
  footer:
    enabled: true
    left: Báo cáo đối chiếu block - Giải tích 2
    pageNumber: current-total
---

:::cover
:::

:::toc
:::

:::list-of-figures
:::

:::list-of-tables
:::

# Tiêu đề cấp một - Chuỗi Fourier

Nội dung neo cho tiêu đề cấp một.

:::pagebreak
:::

## Tiêu đề cấp hai - Tích phân suy rộng

Nội dung neo cho tiêu đề cấp hai.

:::pagebreak
:::

### Tiêu đề cấp ba - Hội tụ đều

Nội dung neo cho tiêu đề cấp ba.

:::pagebreak
:::

#### Tiêu đề cấp bốn - Khai triển Taylor

Nội dung neo cho tiêu đề cấp bốn.

:::pagebreak
:::

:::theorem {#thm-fidelity title="Định lý hội tụ"}
Nếu $f_n$ hội tụ đều đến $f$ trên $[a,b]$ thì giới hạn bảo toàn tính liên tục.
:::

:::pagebreak
:::

:::property {#property-fidelity title="Tính chất tuyến tính"}
Tích phân xác định là một ánh xạ tuyến tính trên không gian hàm khả tích.
:::

:::pagebreak
:::

:::proposition {#proposition-fidelity title="Mệnh đề so sánh"}
Nếu $0 \leq f(x) \leq g(x)$ thì tích phân của $f$ không vượt quá tích phân của $g$.
:::

:::pagebreak
:::

:::corollary {#corollary-fidelity title="Hệ quả hội tụ"}
Chuỗi tuyệt đối hội tụ thì chuỗi ban đầu hội tụ.
:::

:::pagebreak
:::

:::lemma {#lemma-fidelity title="Bổ đề tích phân"}
Hàm liên tục trên đoạn đóng thì khả tích Riemann trên đoạn đó.
:::

:::pagebreak
:::

:::exercise {#exercise-fidelity title="Bài toán mẫu"}
Tính tích phân $\int_0^1 x^2\,dx$ và giải thích từng bước.
:::

:::pagebreak
:::

$$
\int_0^{2\pi} \sin^2(x)\,dx = \pi
$$

:::pagebreak
:::

:::figure {#fig-fidelity caption="Đồ thị minh họa miền tích phân" width=0.45 placement="h!"}
![Đồ thị minh họa](apps/editor/test/fixtures/block-fidelity.png)
:::

:::pagebreak
:::

:::table {#tbl-fidelity caption="Giá trị gần đúng của tích phân" placement="h!"}
| Số khoảng chia | Giá trị gần đúng |
| ---: | ---: |
| 4 | 0.328125 |
| 8 | 0.332031 |
| 16 | 0.333008 |
:::

:::pagebreak
:::

:::listing {#lst-fidelity caption="Xấp xỉ tích phân bằng quy tắc hình thang" language="swift" lineNumbers=true}
```swift
sum = 0
for i from 1 to n - 1:
  sum = sum + f(a + i * h)
result = h * (f(a) / 2 + sum + f(b) / 2)
```
:::

:::pagebreak
:::

ĐIỂM KIỂM TRA TRƯỚC NGẮT TRANG.

:::pagebreak
:::

ĐIỂM KIỂM TRA SAU NGẮT TRANG.
