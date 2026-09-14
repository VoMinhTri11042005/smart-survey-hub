# Survey Analyzer — bộ công cụ generic phân tích file khảo sát

Đọc `SPEC.md` trước (đặc tả đầy đủ), `PITFALLS.md` khi sửa/mở rộng `charts.py`.

## Chạy nhanh
```bash
pip install -r requirements.txt
python cli.py <input.csv|.xlsx> <output.xlsx> ["Tiêu đề dashboard"]
```

## Demo có sẵn
`demo_output.xlsx` = kết quả chạy thật trên bộ dữ liệu khảo sát "thói quen xấu sinh
viên" (153 phản hồi), dùng để đối chiếu khi Codex chỉnh sửa code — nếu sau khi sửa,
chạy lại trên cùng input mà số liệu lệch so với bản demo này (dù đã đổi UI/style) thì
khả năng cao là đã có bug.

## File
- `detect.py` — tự phân loại từng cột khảo sát (xem SPEC.md mục 2)
- `aggregate.py` — tính số liệu theo từng loại cột
- `charts.py` — các hàm vẽ biểu đồ, đã vá mọi lỗi trong PITFALLS.md
- `report.py` — ráp toàn bộ workbook
- `style.py` — màu sắc / font dùng chung
- `cli.py` — entrypoint dòng lệnh, có validate trước khi lưu
