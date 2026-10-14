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

// Older surveys used 0 as a sentinel for an unset time/attempt limit. Keep
// those records editable while retaining strict validation for new invalid
// values such as negative or fractional limits.
const OptionalPositiveIntegerSchema = (maximum: number) => z.preprocess(
  value => value === 0 ? null : value,
  z.number().int().positive().max(maximum).nullable().optional().default(null),
);

function validateQuestionConfiguration(
  question: {
    type: z.infer<typeof QuestionTypeSchema>;
    options?: string[];
    gridColumns?: string[];
    scaleMin?: number;
    scaleMax?: number;
    maxSelections?: number;
    screenOutAnswer?: string;
    correctAnswer?: string | string[];
    points?: number;
  },
  context: z.RefinementCtx,
) {
  const isGrid = question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid';
  const needsOptions = question.type === 'single_choice'
    || question.type === 'multiple_choice'
    || question.type === 'dropdown';
  const optionKey = (value: string) => value.trim().toLocaleLowerCase('vi-VN');
  const hasDuplicateOptions = Boolean(question.options && new Set(question.options.map(optionKey)).size !== question.options.length);

  if (needsOptions && !question.options?.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Câu hỏi lựa chọn cần ít nhất một đáp án.' });
  }
  if ((needsOptions || isGrid) && hasDuplicateOptions) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Các lựa chọn trong câu hỏi phải khác nhau.' });
  }
  if ((needsOptions || isGrid) && question.options?.some(option => !option.trim())) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Lựa chọn không được để trống.' });
  }
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
  if (isGrid && !question.options?.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Câu hỏi lưới cần ít nhất một hàng.' });
  }
  if (isGrid && !question.gridColumns?.length) {
    context.addIssue({ code: 'custom', path: ['gridColumns'], message: 'Câu hỏi lưới cần ít nhất một cột.' });
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

  if (question.correctAnswer !== undefined) {
    const answerValues = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
    const supportsAnswerKey = question.type === 'single_choice'
      || question.type === 'multiple_choice'
      || question.type === 'dropdown';
    if (!supportsAnswerKey) {
      context.addIssue({ code: 'custom', path: ['correctAnswer'], message: 'Đáp án đúng chỉ dùng cho câu hỏi lựa chọn.' });
    } else if (
      (question.type === 'multiple_choice' ? !Array.isArray(question.correctAnswer) : Array.isArray(question.correctAnswer))
      || answerValues.length === 0
      || new Set(answerValues).size !== answerValues.length
      || answerValues.some(answer => !question.options?.includes(answer))
    ) {
      context.addIssue({ code: 'custom', path: ['correctAnswer'], message: 'Đáp án đúng phải khớp với lựa chọn của câu hỏi.' });
    }
  }
  if (question.points !== undefined && (!(question.points > 0) || !Number.isFinite(question.points))) {
    context.addIssue({ code: 'custom', path: ['points'], message: 'Điểm số phải lớn hơn 0.' });
  }
}

const SurveyQuestionSchema = z.object({
  id: z.string().refine(value => value.trim().length > 0, 'Mã câu hỏi không được để trống.'),
  type: QuestionTypeSchema,
  text: z.string().refine(value => value.trim().length > 0, 'Nội dung câu hỏi không được để trống.'),
  sectionId: z.string().optional(),
  options: z.array(z.string().refine(value => value.trim().length > 0, 'Lựa chọn không được để trống.')).max(100).optional(),
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
  points: z.number().finite().positive().max(1_000_000).optional(),
  label: z.string().optional(),
  textAnalysisMode: z.enum(['auto', 'include', 'exclude']).optional(),
}).superRefine(validateQuestionConfiguration);

const SurveySectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional(),
});

function validateSurveyPayload(
  value: { questions?: Array<{ id: string; sectionId?: string }>; sections?: Array<{ id: string }> },
  context: z.RefinementCtx,
) {
  if (value.questions) {
    const ids = value.questions.map(question => question.id.trim());
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['questions'], message: 'Mã câu hỏi phải là duy nhất.' });
    }
  }
  if (value.sections) {
    const ids = value.sections.map(section => section.id.trim());
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['sections'], message: 'Mã phần phải là duy nhất.' });
    }
  }
  if (value.questions && value.sections) {
    const sectionIds = new Set(value.sections.map(section => section.id));
    value.questions.forEach((question, index) => {
      if (question.sectionId && !sectionIds.has(question.sectionId)) {
        context.addIssue({
          code: 'custom',
          path: ['questions', index, 'sectionId'],
          message: 'Câu hỏi đang tham chiếu đến phần không tồn tại.',
        });
      }
    });
  }
}

// ─── Survey ───
const SurveyPayloadSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Tiêu đề không được để trống.'),
  description: z.string().optional().default(''),
  questions: z.array(SurveyQuestionSchema),
  sections: z.array(SurveySectionSchema).max(100).optional().default([]),
  isQuiz: z.boolean().optional().default(false),
  displayMode: z.enum(['single', 'all']).optional().default('single'),
  showScore: z.boolean().optional().default(true),
  closesAt: z.string().nullable().optional().default(null),
  maxAttemptsPerDevice: OptionalPositiveIntegerSchema(100),
  timeLimitMinutes: OptionalPositiveIntegerSchema(1_440),
  status: z.enum(['draft', 'live', 'closed']).optional().default('live'),
});

export const CreateSurveySchema = SurveyPayloadSchema.superRefine(validateSurveyPayload);
export const UpdateSurveySchema = SurveyPayloadSchema.partial().superRefine(validateSurveyPayload);

export const SubmitResponseSchema = z.object({
  respondentId: z.string()
    .max(255)
    .regex(/^device-[a-z0-9-]+-attempt-[1-9]\d*$/i, 'Định danh lượt làm khảo sát không hợp lệ.'),
  answers: z.record(z.string(), AnswerValueSchema),
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
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  points: z.number().finite().positive().max(1_000_000).optional(),
  label: z.string().optional(),
  textAnalysisMode: z.enum(['auto', 'include', 'exclude']).optional(),
}).superRefine(validateQuestionConfiguration);

const ImportedResponseSchema = z.object({
  answers: z.record(z.string(), AnswerValueSchema),
  submittedAt: z.string().datetime({ offset: true }).optional(),
  // A self-exported quiz can carry its historical score even when the import
  // file does not contain answer keys. The service recalculates whenever keys
  // exist and only accepts this recorded value as a lossless fallback.
  score: z.number().finite().min(0).optional(),
  totalQuizQuestions: z.number().finite().positive().optional(),
}).superRefine((response, context) => {
  const hasScore = response.score !== undefined;
  const hasTotal = response.totalQuizQuestions !== undefined;
  if (hasScore !== hasTotal) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'Điểm và điểm tối đa phải đi cùng nhau.' });
  }
  if (hasScore && hasTotal && response.score! > response.totalQuizQuestions!) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'Điểm không được lớn hơn điểm tối đa.' });
  }
});

export const ImportResponsesSchema = z.object({
  idempotencyKey: z.string().min(16).max(128),
  mode: z.enum(['create', 'existing']),
  surveyId: z.string().min(1).optional(),
  newSurvey: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional().default(''),
    questions: z.array(ImportedQuestionSchema).min(1).max(100),
    isQuiz: z.boolean().optional().default(false),
  }).optional(),
  responses: z.array(ImportedResponseSchema).min(1).max(5000),
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
  sections: z.array(SurveySectionSchema).max(100).optional().default([]),
  isQuiz: z.boolean().optional().default(false),
  showScore: z.boolean().optional().default(true),
  displayMode: z.enum(['single', 'all']).optional().default('single'),
  closesAt: z.string().nullable().optional().default(null),
  maxAttemptsPerDevice: z.number().nullable().optional().default(null),
  timeLimitMinutes: z.number().nullable().optional().default(null),
});
