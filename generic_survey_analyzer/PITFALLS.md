# PITFALLS — Nhật ký lỗi thực tế khi dùng openpyxl vẽ biểu đồ (và cách phát hiện)

Đây là log các lỗi **thật** đã xảy ra trong quá trình xây dựng bản gốc (không-generic)
trước khi tổng quát hoá thành bộ công cụ này. Ghi lại để Codex không lặp lại, và để biết
**cách phát hiện** — vì tất cả các lỗi này đều KHÔNG bị `recalc.py`/LibreOffice báo lỗi,
chỉ hiện ra khi soi trực tiếp ảnh render hoặc mở bằng Excel thật.

---

### Lỗi 1 — Category bị lệch 1 dòng (header lọt vào làm category)
**Triệu chứng**: cột đầu tiên của bar chart hiện đúng số nhưng KHÔNG có nhãn, cột thứ 2
hiện nhãn của cột 1, v.v. — toàn bộ trục danh mục bị lệch 1 vị trí.
**Nguyên nhân**: `Reference` cho category vô tình bao gồm cả header row:
```python
# SAI — top và top giống nhau nghĩa là chỉ lấy đúng 1 ô (chính là header)
cats = Reference(ws, min_col=DC, max_col=DC, min_row=top, max_row=top)
```
**Cách sửa**: luôn `min_row=header_row + 1, max_row=last_data_row`.
**Cách phát hiện**: so khớp thủ công 1-2 số trên biểu đồ với bảng dữ liệu nguồn ngay
cạnh đó — sai lệch sẽ lộ ra ngay (nhãn "Thói quen" xuất hiện làm 1 cột trên biểu đồ).

---

### Lỗi 2 — Chart "from_rows" kéo nhầm hàng tiêu đề section vào làm series
**Triệu chứng**: legend biểu đồ xuất hiện 1 mục lạ, tên dài (là câu tiêu đề section
"1. Tỷ lệ (%)..." thay vì tên 1 category thật), giá trị bằng 0/rỗng.
**Nguyên nhân**: dùng `min_row = data_top - 1` để "chừa" hàng tiêu đề nhưng vô tình kéo
luôn ô tiêu đề section (nằm ngay phía trên bảng) vào vùng dữ liệu.
**Cách sửa**: xác định rõ 2 khái niệm tách biệt — `header_row` (chứa tên cột) và
`data_rows` (chứa số liệu) — không bao giờ lùi xuống quá `header_row`.

---

### Lỗi 3 — `label_col` hardcode sai khi bảng không bắt đầu ở cột 1
**Triệu chứng**: y hệt lỗi 1 nhưng ở biểu đồ cross-tab dạng cột nhóm (clustered from
rows) — 1 "nhóm" giả tên là tiêu đề cột nhãn (VD: "Hạng mục") xuất hiện lẫn với các
nhóm thật (VD: "Sinh viên năm 1", "năm 2"...).
**Nguyên nhân**: hàm vẽ biểu đồ hardcode `min_col=1` cho cột nhãn, trong khi bảng dữ
liệu trên sheet thực tế được viết bắt đầu ở cột B (cột 2) để chừa lề.
**Cách sửa**: hàm vẽ biểu đồ phải nhận `label_col` làm tham số tường minh, và luôn
truyền đúng giá trị `start_col` đã dùng khi gọi `write_table()` cho chính bảng đó —
không được giả định cột 1.

---

### Lỗi 4 — Label hiện "TênSeries; giá_trị" thay vì chỉ giá trị
**Triệu chứng**: mỗi điểm trên biểu đồ hiện text kiểu `"Số lượt chọn; 12"` thay vì chỉ
`12`.
**Nguyên nhân**: chỉ gán `chart.dataLabels = DataLabelList(...)` mà không gán cho
`series.dLbls` — LibreOffice fallback về hiển thị mặc định (series;value) ở cấp series.
**Cách sửa**:
```python
dl = DataLabelList()
dl.showVal = True
dl.showSerName = False
dl.showCatName = False
chart.dataLabels = dl
series.dLbls = dl   # PHẢI gán cả 2, cùng 1 object
```

---

### Lỗi 5 — Chữ "None" thừa dưới trục biểu đồ
**Triệu chứng**: dưới trục giá trị (số 0,10,20...) xuất hiện thêm dòng chữ "None".
**Nguyên nhân**: gán `axis.title = ''` (chuỗi rỗng) cho trục không cần tiêu đề — vẫn
tạo ra title element, và khi render ra text lại thành "None".
**Cách sửa**: chỉ gán khi có nội dung thật:
```python
if title_text:
    axis.title = title_text
```

---

### Lỗi 6 — File mở trong Excel thật báo "We found a problem with some content"
**Triệu chứng**: file mở bình thường trong LibreOffice/Google Sheets, nhưng Microsoft
Excel thật hiện hộp thoại yêu cầu "Recover" nội dung.
**Nguyên nhân gốc rễ**: sau khi tạo file bằng `openpyxl`, đã chạy thêm bước "kiểm tra
công thức" (`recalc.py`) — bước này **mở file bằng LibreOffice rồi lưu đè** (macro
`ThisComponent.store()`), khiến toàn bộ XML biểu đồ bị LibreOffice viết lại theo
"phương ngữ" riêng của nó (thêm `roundedCorners`, style `spPr` phức tạp, font Calibri
mặc định...). File gốc do `openpyxl` xuất ra (chưa qua bước này) là XML chuẩn, sạch,
và Excel mở được bình thường.
**Cách sửa**: file loại báo cáo tĩnh (không công thức) thì **bỏ hẳn bước recalc**. Chỉ
validate bằng:
```python
import zipfile
from openpyxl import load_workbook
assert zipfile.ZipFile(path).testzip() is None
load_workbook(path)   # không raise exception là đạt
```
Nếu workbook thật sự có công thức cần verify, chạy recalc trên **1 bản sao riêng** chỉ
để đọc log lỗi công thức, rồi **giao bản gốc chưa qua LibreOffice** cho người dùng.

---

## Cách review nhanh 1 file mới trước khi giao cho người dùng (checklist)
1. `zipfile.ZipFile(path).testzip() is None`
2. `openpyxl.load_workbook(path)` không raise exception
3. Convert sang PDF bằng LibreOffice **trên 1 bản sao** (`shutil.copy` trước khi convert)
   để soi hình — KHÔNG bao giờ convert/recalc trực tiếp trên file sẽ giao cho người dùng
4. Đối chiếu bằng mắt ít nhất 2-3 con số trên mỗi biểu đồ với bảng dữ liệu nguồn cạnh nó
5. Kiểm tra không có chữ "None" lạ, không có category/series thừa trong legend
