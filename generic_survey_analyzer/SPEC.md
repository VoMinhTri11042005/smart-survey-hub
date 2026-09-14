# SPEC — Bộ công cụ tự động phân tích & trực quan hoá MỌI file khảo sát

## 0. Mục tiêu
Một pipeline **generic**: nhận vào bất kỳ file khảo sát nào (CSV/XLSX xuất từ Google
Form, SurveyMonkey, Tally, v.v.), **tự phát hiện loại từng câu hỏi**, và xuất ra một
file Excel phân tích (Dashboard + biểu đồ chi tiết + phân tích chéo) — **không hardcode
bất kỳ tên câu hỏi nào**.

Repo đính kèm (`survey_analyzer/`) là **bản tham chiếu chạy được**, đã test thật với
dữ liệu khảo sát "thói quen xấu sinh viên" (153 phản hồi) mà không sửa 1 dòng code nào
cho riêng bộ dữ liệu đó — chứng minh hướng thiết kế khả thi. Codex dùng bản này làm
điểm xuất phát để mở rộng, không cần viết lại từ đầu.

## 1. Pipeline tổng quát
```
input.csv/.xlsx --> load --> classify_dataframe() --> build_workbook() --> validate() --> save
```

## 2. Phân loại cột (không cần biết nội dung câu hỏi) — `detect.py`
Mỗi cột được gán 1 trong các nhãn sau, dựa thuần vào **dtype + cardinality + có
delimiter hay không** — KHÔNG dựa vào từ khoá tiếng Việt cụ thể của câu hỏi:

| Loại | Cách nhận diện | Trực quan hoá |
|---|---|---|
| `IDENTIFIER` | header chứa từ khoá id/email/tên/timestamp, hoặc unique_ratio > 0.9 + chuỗi ngắn | Bỏ qua, không phân tích |
| `DATE` | ≥80% giá trị parse được thành ngày/giờ | (mở rộng: biểu đồ xu hướng theo thời gian) |
| `RATING` | numeric, ≤12 giá trị khác nhau, range ≤10 | Cột/histogram phân phối điểm + nhóm mức |
| `MULTI_CHOICE` | có ký tự phân tách (`;`/`\|`) trong >15% giá trị | Luôn dùng **bar ngang** (không bao giờ pie — xem mục 4) |
| `SINGLE_CHOICE` | object, ≤12 giá trị khác nhau, không delimiter | Pie/donut nếu ≤6 lựa chọn, ngược lại bar |
| `FREEFORM_CATEGORICAL` | object, cardinality vừa (≤50% N), text ngắn (≤40 ký tự) | Bar top-N + gộp "Khác" |
| `OPEN_TEXT` | text dài/cardinality cao, không khớp các loại trên | Liệt kê trong sheet riêng, KHÔNG trực quan hoá |

Ngưỡng (`SMALL_CARD=12`, `FREEFORM_MAX_RATIO=0.5`, `FREEFORM_MAX_LEN=40`...) đặt ở đầu
`detect.py`, Codex có thể expose thành tham số CLI (`--small-card 15`) nếu muốn linh hoạt hơn.

## 3. Cấu trúc file Excel đầu ra — `report.py`
| Sheet | Nội dung |
|---|---|
| `Dữ liệu gốc` | Toàn bộ dữ liệu thô, không chỉnh sửa |
| `Dashboard` | KPI cards (N, top category, rating trung bình) + 4 biểu đồ nổi bật đầu tiên |
| `Chi tiết câu hỏi` | 1 khối biểu đồ cho **mỗi cột** thuộc MULTI/SINGLE/FREEFORM/RATING |
| `Phân tích chéo` | Tự chọn 1 cột `SINGLE_CHOICE` có 2–6 giá trị làm biến nhóm (`group_col`), rồi: (1) % theo nhóm của top-5 hạng mục MULTI_CHOICE đầu tiên, (2) điểm RATING trung bình theo từng nhóm |
| `Phản hồi mở` | Liệt kê nguyên văn các cột `OPEN_TEXT` (nếu có) |

## 4. QUY TẮC THIẾT KẾ BẮT BUỘC
1. **Không bao giờ vẽ pie/donut cho câu hỏi MULTI_CHOICE.** Multi-choice = 1 người chọn
   nhiều đáp án → tổng % các lát > 100%, pie sẽ hiển thị % sai (chia theo tổng lượt chọn
   chứ không phải theo số người trả lời). Pie/donut chỉ dùng cho `SINGLE_CHOICE`.
2. **Luôn định dạng số liệu trực tiếp (giá trị tĩnh), không dùng công thức Excel** cho
   loại báo cáo phân tích một lần này. Nếu tương lai cần công thức sống (VD: dashboard
   cập nhật tự động khi sửa dữ liệu thô), phải tách riêng pha "verify formulas" khỏi pha
   "ship file" — xem mục 5.4.
3. Mọi bảng dữ liệu phụ trợ cho biểu đồ được viết ở cột xa bên phải mỗi sheet (cột 20+)
   để không đè lên nội dung chính — xem `DATA_COL_START` trong `report.py`.
4. Không hardcode tên câu hỏi tiếng Việt ở bất kỳ đâu trong `detect.py`/`aggregate.py`/
   `report.py`/`charts.py`. Nếu cần văn bản mẫu (ví dụ nhãn KPI), luôn lấy từ `df.columns`
   hoặc dữ liệu thực tế, cắt ngắn bằng `[:N]` khi cần.

## 5. CÁC LỖI THỰC TẾ ĐÃ GẶP KHI XÂY DỰNG BẢN GỐC (đọc kỹ trước khi sửa charts.py)
Chi tiết đầy đủ + cách phát hiện từng lỗi nằm trong `PITFALLS.md`. Tóm tắt:

1. **Category off-by-one**: `Reference` cho trục danh mục phải bắt đầu từ `header_row + 1`,
   không được trùng header row — nếu không, header text ("Thói quen") sẽ lọt vào làm
   1 category/series giả và toàn bộ trục bị lệch.
2. **Clustered "from_rows" chart cần đúng `label_col`**: nếu bảng dữ liệu được viết bắt
   đầu ở cột 2 (chừa cột A làm lề) nhưng hàm vẽ biểu đồ hardcode cột 1 là cột nhãn, header
   sẽ bị kéo vào làm 1 "nhóm" giả (xem bug đã sửa trong `add_clustered_from_rows`, tham
   số `label_col` phải khớp với `start_col` đã dùng ở `write_table`).
3. **`DataLabelList` phải gán vào CẢ `chart.dataLabels` LẪN `series.dLbls`** (cùng 1
   object) — nếu không, một số renderer (LibreOffice) sẽ hiện "TênSeries; giá_trị" đè
   lên mỗi điểm dữ liệu thay vì chỉ hiện giá trị.
4. **Không bao giờ gán `axis.title = ''`** (chuỗi rỗng) — vẫn tạo ra 1 title element và
   có thể hiện chữ **"None"** thừa dưới trục. Chỉ gán khi chuỗi khác rỗng:
   ```python
   if y_title:
       chart.y_axis.title = y_title
   ```
5. **TUYỆT ĐỐI không chạy bước "recalculate formulas" qua LibreOffice
   (`ThisComponent.store()`) trên file không có công thức nào.** Bước này mở file bằng
   LibreOffice rồi lưu đè, viết lại toàn bộ XML biểu đồ theo "phương ngữ" riêng của
   LibreOffice — và đây chính là nguyên nhân khiến Microsoft Excel thật báo lỗi **"We
   found a problem with some content"** khi mở file, dù file mở bình thường trong
   LibreOffice. File loại báo cáo này (số liệu tĩnh, không công thức) **không cần** bước
   đó — chỉ validate bằng `zipfile.testzip()` + `openpyxl.load_workbook()` (xem `cli.py`).
   Nếu tương lai thêm công thức Excel thật, hãy chạy recalculate trên **1 bản sao** chỉ để
   đọc kết quả kiểm tra, rồi **ship bản gốc chưa qua LibreOffice**.
6. Luôn tô màu riêng từng cột trong 1 series bar chart bằng danh sách `DataPoint(idx=i,
   graphicalProperties=...)` thay vì tạo nhiều series — giữ được biểu đồ sạch, không cần
   legend thừa.
7. Dữ liệu categorical tự điền (ví dụ tên trường, tên ngành) cần chuẩn hoá (viết hoa/thường,
   gộp biến thể) trước khi group — nếu không sẽ ra hàng chục "category" trùng lặp vô nghĩa.

## 6. Kiến trúc mã nguồn (đã hiện thực trong repo đính kèm)
```
survey_analyzer/
  style.py       # màu sắc, font, style dùng chung
  detect.py      # phân loại cột — xem mục 2
  aggregate.py   # tính toán số liệu theo từng loại cột
  charts.py      # các hàm vẽ biểu đồ tái sử dụng, ĐÃ vá mọi lỗi ở mục 5
  report.py      # ráp toàn bộ workbook từ kết quả detect + aggregate
  cli.py         # entrypoint: python cli.py input.csv output.xlsx ["Tiêu đề"]
```

## 7. Việc còn để Codex mở rộng (chưa làm trong bản tham chiếu)
- Tự động nhận diện cột có tính **thứ bậc** (ordinal: "Hiếm khi < Thỉnh thoảng < ...")
  để mã hoá đúng thứ tự thay vì sort theo tần suất, và tự tính tương quan
  Pearson **và** Spearman giữa mọi cặp RATING/ordinal.
- Sheet "Biểu đồ tròn & Phân tích sâu" riêng (bản demo cho bộ dữ liệu thói quen xấu đã
  có ở hội thoại trước) — hiện `report.py` gộp pie vào luôn 2 sheet chính, có thể tách
  ra thành sheet riêng nếu muốn UI gọn hơn.
- Sinh insight text tự động (câu nhận xét 📌 dưới mỗi biểu đồ chéo) dựa trên số liệu —
  bản gốc (không-generic) trong hội thoại trước đã làm thủ công, cần viết template hoá.
- Xử lý trường hợp nhiều cột `RATING`/`group_col` khả dĩ — hiện chỉ lấy cột đầu tiên
  thoả điều kiện; nên cho phép CLI chỉ định cột cụ thể qua `--group-col "..."`.
- Giới hạn độ dài KPI label trong Dashboard đang cắt bằng `[:28]` khá thô, dễ đè chữ khi
  câu hỏi dài — nên tự động wrap hoặc rút gọn thông minh hơn (ví dụ giữ từ khoá chính).
- Test với ít nhất 2–3 bộ khảo sát khác nhau (số cột, loại câu hỏi khác nhau) để chắc
  chắn ngưỡng phân loại ở mục 2 tổng quát tốt, không chỉ đúng cho 1 bộ dữ liệu.

## 8. Cách chạy & kiểm chứng
```bash
python cli.py input.csv output.xlsx "Tiêu đề dashboard"
```
Script tự in ra bảng phân loại cột để review nhanh, rồi validate file trước khi báo
"Saved". Nếu `zipfile.testzip()` hoặc `load_workbook()` lỗi, script dừng và báo lỗi —
không bao giờ giao 1 file chưa qua validate.
