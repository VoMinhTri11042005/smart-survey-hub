/**
 * Gemini AI Service
 * Tập trung logic gọi Gemini API, reusable cho parse và chat.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const MODEL = 'gemini-flash-latest';

async function generateWithRetry(config: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await genAI.models.generateContent(config);
    } catch (error: any) {
      const isUnavailable = error?.status === 503 || error?.status === 'UNAVAILABLE' || error?.message?.includes('503');
      if (isUnavailable && i < maxRetries - 1) {
        console.log(`[Gemini] Server busy (503), retrying in ${2000 * (i + 1)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('AI server is currently overloaded. Please try again later.');
}

/**
 * Parse raw text (from Word file) + topic into structured survey questions.
 */
export async function parseQuestionsFromText(extractedText: string, topic: string) {
  const prompt = `Bạn là chuyên gia tạo khảo sát. Dựa trên nội dung sau, hãy tạo một bộ câu hỏi khảo sát có cấu trúc.

${extractedText ? `NỘI DUNG FILE TÀI LIỆU:\n${extractedText}\n` : ''}
${topic ? `CHỦ ĐỀ KHẢO SÁT: ${topic}\n` : ''}

Hãy phân tích nội dung và tạo câu hỏi khảo sát. Với mỗi câu hỏi, tự động xác định loại câu hỏi phù hợp nhất:
- "single_choice": Câu hỏi chọn 1 đáp án (cần có mảng options)
- "multiple_choice": Câu hỏi chọn nhiều đáp án (cần có mảng options)
- "star_rating": Đánh giá bằng sao 1-5
- "text": Câu hỏi mở, tự do viết
- "nps": Net Promoter Score, thang điểm 0-10

Trả về JSON theo format sau (KHÔNG thêm text nào khác, CHỈ JSON):
{
  "title": "Tiêu đề khảo sát phù hợp",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "text": "Nội dung câu hỏi?",
      "options": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C"],
      "required": true
    },
    {
      "id": "q2",
      "type": "star_rating",
      "text": "Bạn đánh giá ... như thế nào?",
      "required": true
    }
  ]
}

Lưu ý:
- Nếu nội dung file đã có sẵn câu hỏi, giữ nguyên và chỉ cấu trúc lại
- Nếu chỉ có chủ đề, tự tạo 5-8 câu hỏi phù hợp
- Câu hỏi single_choice và multiple_choice BẮT BUỘC phải có mảng options (ít nhất 2 lựa chọn)
- ID tăng dần: q1, q2, q3...
- Ưu tiên đa dạng loại câu hỏi`;

  const response = await generateWithRetry({
    model: MODEL,
    contents: prompt,
  });

  const text = response.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Không tìm thấy JSON trong phản hồi AI.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error('AI không trả về câu hỏi hợp lệ.');
  }

  const questions = parsed.questions.map((q: any, idx: number) => ({
    id: q.id || `q${idx + 1}`,
    type: q.type || 'text',
    text: q.text || '',
    options: q.options || undefined,
    required: q.required !== false,
  }));

  return {
    title: parsed.title || topic || 'Khảo sát mới',
    questions,
  };
}

/**
 * Chat with AI using survey context.
 */
export async function chatWithContext(
  message: string,
  surveyTitle: string,
  surveyDescription: string,
  questions: any[],
  currentQuestionIndex?: number
): Promise<string> {
  const currentQ = questions && currentQuestionIndex !== undefined
    ? questions[currentQuestionIndex]
    : null;

  const questionsText = questions
    ? questions.map((q: any, i: number) => `${i + 1}. [${q.type}] ${q.text}`).join('\n')
    : 'Chưa có câu hỏi.';

  const systemPrompt = `Bạn là trợ lý AI thông minh cho một khảo sát. Vai trò của bạn là giúp người làm khảo sát hiểu rõ các câu hỏi và trả lời chính xác hơn.

THÔNG TIN KHẢO SÁT:
- Tiêu đề: ${surveyTitle || 'Không rõ'}
- Mô tả: ${surveyDescription || 'Không có mô tả'}

CÁC CÂU HỎI TRONG KHẢO SÁT:
${questionsText}

${currentQ ? `NGƯỜI DÙNG ĐANG Ở CÂU HỎI: "${currentQ.text}" (Loại: ${currentQ.type})` : ''}

QUY TẮC:
- Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu
- Giải thích ý nghĩa câu hỏi nếu người dùng không hiểu
- Không đưa ra câu trả lời thay người dùng, chỉ gợi ý và giải thích
- Nếu câu hỏi liên quan đến thuật ngữ chuyên ngành, giải thích đơn giản
- Thân thiện và chuyên nghiệp`;

  const response = await generateWithRetry({
    model: MODEL,
    contents: message,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  return response.text || 'Xin lỗi, tôi không thể trả lời lúc này.';
}
