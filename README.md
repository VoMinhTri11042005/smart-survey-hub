# Smart Survey Hub (SH)

Nền tảng khảo sát thông minh tích hợp AI — tự động phân tích file Word, tạo câu hỏi, và hỗ trợ người làm khảo sát bằng chatbot AI.

## 🏗️ Cấu trúc dự án

```
SH/
├── src/                          # Frontend (React + Vite + Tailwind v4)
│   ├── components/
│   │   ├── layout/               # Sidebar, TopBar
│   │   ├── survey/               # Builder, Respondent, Chatbot
│   │   ├── dashboard/            # Dashboard, Analytics
│   │   └── common/               # Auth, Toast
│   ├── context/                  # SurveyContext (state management)
│   ├── types/                    # TypeScript types
│   ├── styles/                   # CSS
│   ├── App.tsx
│   └── main.tsx
├── server/                       # Backend (Express)
│   ├── routes/                   # API route handlers
│   │   ├── upload.routes.ts      # Upload & parse file Word
│   │   ├── survey.routes.ts      # Survey CRUD
│   │   └── chat.routes.ts        # AI chatbot
│   ├── services/                 # Business logic
│   │   └── gemini.service.ts     # Gemini AI wrapper
│   ├── store.ts                  # In-memory data store
│   └── index.ts                  # Server entry point
├── package.json
├── vite.config.ts
├── tsconfig.json
└── .env.example
```

## 🚀 Chạy dự án

```bash
# Cài dependencies
npm install

# Tạo file .env.local với API key
cp .env.example .env.local
# hoặc manual:
echo "GEMINI_API_KEY=your_key_here" > .env.local

# Chạy cả frontend + backend
npm run dev

# Hoặc chạy riêng
npm run dev:client   # Frontend: http://localhost:3000
npm run dev:server   # Backend:  http://localhost:3001
```

## Nhập phản hồi Google Forms

Trong mục **Phân tích**, chọn **Nhập Excel** rồi tải file `.xlsx` hoặc `.csv` đã xuất từ Google Forms. Có thể tạo khảo sát mới từ tiêu đề cột hoặc ghép các cột vào khảo sát hiện có. Hệ thống hiển thị xem trước và kiểm tra lựa chọn trước khi xác nhận nhập. File `.xls` cần được lưu lại thành `.xlsx` trước khi tải lên.

Import chỉ thêm phản hồi; không cập nhật hay xóa response hiện có. Việc tạo survey và thêm responses chạy trong cùng transaction PostgreSQL để lỗi sẽ rollback cả lần nhập. Phản hồi trùng được bỏ qua; thời gian gửi được giữ nếu file có cột Timestamp/Thời gian. Mỗi file hỗ trợ tối đa 5 MB, 5000 phản hồi và 100 câu hỏi.

## 🚀 Deploy lên Render

1. Đẩy repo lên GitHub.
2. Truy cập Render → New + Project → Import Repository.
3. Chọn repo này.
4. Chọn service type: Web Service.
5. Build command:
   ```bash
   npm install && npm run build
   ```
6. Start command:
   ```bash
   npm start
   ```
7. Thiết lập env vars trong Render:
   - `NODE_ENV=production`
   - `PORT=3001`
   - `GEMINI_API_KEY=...`
   - `DATABASE_URL=...` (PostgreSQL)
   - `FIREBASE_SERVICE_ACCOUNT=...` (JSON service account Firebase, lưu dưới dạng secret)
   - `ADMIN_EMAILS=admin@example.com` (email quản trị, nhiều email phân tách bằng dấu phẩy)
   - `VITE_ADMIN_EMAILS=admin@example.com` (phải khớp `ADMIN_EMAILS`; được nhúng vào frontend lúc build)
   - Các biến Firebase client `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` và `VITE_FIREBASE_APP_ID`
   - `CORS_ORIGIN=https://your-app.vercel.app` (origin frontend; nhiều origin phân tách bằng dấu phẩy)
8. Render sẽ chạy cả frontend + backend trên cùng 1 service; app sẽ phục vụ static build từ `dist/` và API từ `/api`.

Trong Firebase Console, bật phương thức **Email/Password** và tạo tài khoản quản trị với email/mật khẩu bạn muốn dùng. Thêm email đó vào cả `ADMIN_EMAILS` và `VITE_ADMIN_EMAILS`. Mật khẩu được Firebase xác thực, không lưu trong source code. Trong production, server từ chối khởi động nếu thiếu Firebase service account, danh sách email quản trị hoặc CORS origin. Không commit service-account JSON vào Git. API quản trị yêu cầu đăng nhập Firebase và email thuộc allowlist; đọc khảo sát và gửi phản hồi vẫn công khai.

## 🌐 Deploy lên Vercel

1. Tạo project trên Vercel.
2. Import repo.
3. Set environment variable:
   - `VITE_API_URL=https://your-render-service-name.onrender.com/api`
   - `VITE_ADMIN_EMAILS=admin@example.com`
   - Các biến cấu hình Firebase client (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`)
4. Build command: `npm run build`
5. Output directory: `dist`
6. Kết quả: frontend chạy trên Vercel, backend API chạy trên Render.

Trên Render, đặt `FIREBASE_SERVICE_ACCOUNT`, `ADMIN_EMAILS`, `DATABASE_URL` và `CORS_ORIGIN` trong Environment. `ADMIN_EMAILS` và `VITE_ADMIN_EMAILS` phải khớp nhau.

## 🐳 Deploy bằng Docker

```bash
# Build image
docker build -t smart-survey-hub .

# Run container
docker run -p 3001:3001 --env-file .env.local smart-survey-hub
```

Hoặc dùng docker-compose:

```bash
docker-compose up --build -d
```

## 📋 API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/parse-docx` | Upload file Word, AI trích xuất câu hỏi |
| POST | `/api/surveys` | Tạo khảo sát mới |
| GET | `/api/surveys` | Danh sách khảo sát |
| GET | `/api/surveys/:id` | Chi tiết khảo sát |
| DELETE | `/api/surveys/:id` | Xóa khảo sát |
| POST | `/api/surveys/:id/responses` | Gửi phản hồi |
| GET | `/api/surveys/:id/responses` | Lấy phản hồi |
| POST | `/api/surveys/import-responses` | Tạo khảo sát mới hoặc thêm phản hồi từ bảng tính |
| POST | `/api/chat` | AI chatbot |

## Nhập phản hồi từ Google Forms

Trong trang **Phân tích**, chọn **Nhập file** rồi tải lên file `.xlsx` hoặc `.csv` (tối đa 5 MB). Hệ thống nhận diện cột thời gian nếu có, đề xuất loại câu hỏi, cho xem trước dữ liệu và ghép cột trước khi xác nhận. Có thể tạo khảo sát mới hoặc chỉ thêm phản hồi vào khảo sát đã có; với khảo sát hiện tại, câu hỏi và phản hồi cũ không bị sửa hoặc xóa. Mỗi lần nhập được thực hiện trong một transaction và có mã chống tạo bản ghi lặp khi yêu cầu phải thử lại. Nên xuất bản sao lưu trước lần nhập đầu tiên. Cần PostgreSQL đã cấu hình để sử dụng chức năng này.

Với câu hỏi **Nhiều lựa chọn**, người tạo có thể đặt giới hạn số đáp án được chọn; mặc định không giới hạn. Giới hạn này được hiển thị cho người tham gia và được kiểm tra lại tại API khi lưu phản hồi.

Với câu hỏi **Một lựa chọn**, người tạo có thể chọn một đáp án kết thúc khảo sát và tùy chỉnh thông báo. Khi người tham gia chọn đáp án đó, khảo sát dừng ngay; phản hồi được lưu riêng với nhãn sàng lọc và không tính vào thống kê chính.

Trình tạo khảo sát cũng hỗ trợ **Menu thả xuống**, **Ngày**, **Thang tuyến tính** (tùy chỉnh mức và nhãn hai đầu), **Lưới trắc nghiệm** và **Lưới hộp kiểm**. Với câu hỏi lưới, người tạo cấu hình hàng và cột; phản hồi được lưu theo từng hàng, được kiểm tra ở máy chủ và có phân tích riêng cho từng hàng. Các kiểu câu hỏi cũ và dữ liệu phản hồi hiện có vẫn được giữ nguyên.

## 🔧 Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4
- **Backend**: Express 5 + TypeScript
- **AI**: Google Gemini 2.0 Flash
- **File Parsing**: Mammoth.js (Word → text)
