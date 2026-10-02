/**
 * Zod schemas for Survey, Response, and Draft validation.
 */
import { z } from 'zod';

const QuestionTypeSchema = z.enum([
  'single_choice',
  'multiple_choice',
  'dropdown',
  'date',
  'linear_scale',
  'multiple_choice_grid',
  'checkbox_grid',
  'star_rating',
  'text',
  'nps',
]);
const GridRowAnswerSchema = z.union([z.string(), z.array(z.string())]);
const AnswerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number(),
  z.record(z.string(), GridRowAnswerSchema),
]);

function validateQuestionConfiguration(
  question: {
    type: z.infer<typeof QuestionTypeSchema>;
    options?: string[];
    gridColumns?: string[];
    scaleMin?: number;
    scaleMax?: number;
    maxSelections?: number;
    screenOutAnswer?: string;
  },
  context: z.RefinementCtx,
) {
  const isGrid = question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid';
  if (question.maxSelections !== undefined) {
    if (question.type !== 'multiple_choice') {
      context.addIssue({ code: 'custom', path: ['maxSelections'], message: 'Giới hạn chỉ dùng cho câu hỏi nhiều lựa chọn.' });
    } else if (question.options && question.maxSelections > question.options.length) {
      context.addIssue({ code: 'custom', path: ['maxSelections'], message: 'Giới hạn không thể lớn hơn số đáp án.' });
    }
  }
  if (question.screenOutAnswer !== undefined && (
    question.type !== 'single_choice' || !question.options?.includes(question.screenOutAnswer)
  )) {
    context.addIssue({ code: 'custom', path: ['screenOutAnswer'], message: 'Đáp án kết thúc phải thuộc câu hỏi một lựa chọn.' });
  }
  if (question.type === 'dropdown' && !question.options?.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Câu hỏi menu thả xuống cần ít nhất một lựa chọn.' });
  }
  if (isGrid && !question.options?.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Câu hỏi lưới cần ít nhất một hàng.' });
  }
  if (isGrid && !question.gridColumns?.length) {
    context.addIssue({ code: 'custom', path: ['gridColumns'], message: 'Câu hỏi lưới cần ít nhất một cột.' });
  }
  if (isGrid && question.options && new Set(question.options).size !== question.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Tên các hàng trong câu hỏi lưới phải khác nhau.' });
  }
  if (isGrid && question.options?.some(option => !option.trim())) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Tên hàng trong câu hỏi lưới không được để trống.' });
  }
  if (isGrid && question.gridColumns && new Set(question.gridColumns).size !== question.gridColumns.length) {
    context.addIssue({ code: 'custom', path: ['gridColumns'], message: 'Tên các cột trong câu hỏi lưới phải khác nhau.' });
  }
  if (isGrid && question.gridColumns?.some(column => !column.trim())) {
    context.addIssue({ code: 'custom', path: ['gridColumns'], message: 'Tên cột trong câu hỏi lưới không được để trống.' });
  }
  if (question.gridColumns !== undefined && !isGrid) {
    context.addIssue({ code: 'custom', path: ['gridColumns'], message: 'Chỉ câu hỏi lưới mới có cấu hình cột.' });
  }
  if (question.type === 'linear_scale') {
    if (question.scaleMin === undefined || question.scaleMax === undefined || question.scaleMax <= question.scaleMin) {
      context.addIssue({ code: 'custom', path: ['scaleMax'], message: 'Thang tuyến tính cần có mức tối đa lớn hơn mức tối thiểu.' });
    }
  } else if (question.scaleMin !== undefined || question.scaleMax !== undefined) {
    context.addIssue({ code: 'custom', path: ['scaleMin'], message: 'Chỉ câu hỏi thang tuyến tính mới có mức min/max.' });
  }
}

const SurveyQuestionSchema = z.object({
  id: z.string(),
  type: QuestionTypeSchema,
  text: z.string(),
  options: z.array(z.string()).optional(),
  gridColumns: z.array(z.string()).max(100).optional(),
  scaleMin: z.number().int().min(0).max(100).optional(),
  scaleMax: z.number().int().min(0).max(100).optional(),
  scaleMinLabel: z.string().max(100).optional(),
  scaleMaxLabel: z.string().max(100).optional(),
  maxSelections: z.number().int().min(1).max(100).optional(),
  screenOutAnswer: z.string().min(1).optional(),
  screenOutMessage: z.string().max(500).optional(),
  required: z.boolean().optional().default(true),
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  points: z.number().optional(),
  label: z.string().optional(),
  textAnalysisMode: z.enum(['auto', 'include', 'exclude']).optional(),
}).superRefine(validateQuestionConfiguration);

// ─── Survey ───
export const CreateSurveySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Tiêu đề không được để trống.'),
  description: z.string().optional().default(''),
  questions: z.array(SurveyQuestionSchema),
  isQuiz: z.boolean().optional().default(false),
  displayMode: z.enum(['single', 'all']).optional().default('single'),
  showScore: z.boolean().optional().default(true),
  closesAt: z.string().nullable().optional().default(null),
  maxAttemptsPerDevice: z.number().nullable().optional().default(null),
  timeLimitMinutes: z.number().nullable().optional().default(null),
  status: z.enum(['draft', 'live', 'closed']).optional().default('live'),
});

export const UpdateSurveySchema = CreateSurveySchema.partial();

export const SubmitResponseSchema = z.object({
  respondentId: z.string().min(1, 'Thiếu định danh người dùng.'),
  answers: z.record(z.string(), AnswerValueSchema),
  score: z.number().nullable().optional(),
  totalQuizQuestions: z.number().nullable().optional(),
});

const ImportedQuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  text: z.string().min(1),
  options: z.array(z.string()).max(100).optional(),
  gridColumns: z.array(z.string()).max(100).optional(),
  scaleMin: z.number().int().min(0).max(100).optional(),
  scaleMax: z.number().int().min(0).max(100).optional(),
  scaleMinLabel: z.string().max(100).optional(),
  scaleMaxLabel: z.string().max(100).optional(),
  maxSelections: z.number().int().min(1).max(100).optional(),
  screenOutAnswer: z.string().min(1).optional(),
  screenOutMessage: z.string().max(500).optional(),
  required: z.boolean().default(false),
  label: z.string().optional(),
  textAnalysisMode: z.enum(['auto', 'include', 'exclude']).optional(),
}).superRefine(validateQuestionConfiguration);

export const ImportResponsesSchema = z.object({
  idempotencyKey: z.string().min(16).max(128),
  mode: z.enum(['create', 'existing']),
  surveyId: z.string().min(1).optional(),
  newSurvey: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional().default(''),
    questions: z.array(ImportedQuestionSchema).min(1).max(100),
  }).optional(),
  responses: z.array(z.object({
    answers: z.record(z.string(), AnswerValueSchema),
    submittedAt: z.string().datetime({ offset: true }).optional(),
  })).min(1).max(5000),
}).superRefine((value, context) => {
  if (value.mode === 'existing' && !value.surveyId) {
    context.addIssue({ code: 'custom', path: ['surveyId'], message: 'Hãy chọn khảo sát nhận dữ liệu.' });
  }
  if (value.mode === 'create' && !value.newSurvey) {
    context.addIssue({ code: 'custom', path: ['newSurvey'], message: 'Thiếu thông tin khảo sát mới.' });
  }
  if (value.mode === 'create' && value.newSurvey) {
    const questionIds = value.newSurvey.questions.map(question => question.id);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({ code: 'custom', path: ['newSurvey', 'questions'], message: 'Mã câu hỏi phải là duy nhất.' });
    }
  }
});

// ─── Draft ───
export const SaveDraftSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional().default('Khảo sát nháp'),
  description: z.string().optional().default(''),
  questions: z.array(z.any()).optional().default([]),
  isQuiz: z.boolean().optional().default(false),
  showScore: z.boolean().optional().default(true),
  displayMode: z.enum(['single', 'all']).optional().default('single'),
  closesAt: z.string().nullable().optional().default(null),
  maxAttemptsPerDevice: z.number().nullable().optional().default(null),
  timeLimitMinutes: z.number().nullable().optional().default(null),
});
