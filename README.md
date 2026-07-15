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
echo "GEMINI_API_KEY=your_key_here" > .env.local

# Chạy cả frontend + backend
npm run dev

# Hoặc chạy riêng
npm run dev:client   # Frontend: http://localhost:3000
npm run dev:server   # Backend:  http://localhost:3001
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
| POST | `/api/chat` | AI chatbot |

## 🔧 Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4
- **Backend**: Express 5 + TypeScript
- **AI**: Google Gemini 2.0 Flash
- **File Parsing**: Mammoth.js (Word → text)
