/**
 * Zod schemas for Survey, Response, and Draft validation.
 */
import { z } from 'zod';

// ─── Survey ───
export const CreateSurveySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Tiêu đề không được để trống.'),
  description: z.string().optional().default(''),
  questions: z.array(z.object({
    id: z.string(),
    type: z.enum(['single_choice', 'multiple_choice', 'star_rating', 'text', 'nps']),
    text: z.string(),
    options: z.array(z.string()).optional(),
    required: z.boolean().optional().default(true),
    correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
    points: z.number().optional(),
    label: z.string().optional(),
  })),
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
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number()])),
  score: z.number().nullable().optional(),
  totalQuizQuestions: z.number().nullable().optional(),
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
