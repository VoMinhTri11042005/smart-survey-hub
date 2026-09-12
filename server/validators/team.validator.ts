/**
 * Zod schemas for Team member validation.
 */
import { z } from 'zod';

export const InviteTeamMemberSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên.'),
  email: z.string().email('Email không hợp lệ.'),
  role: z.enum(['admin', 'editor', 'viewer']).optional().default('viewer'),
});

export const UpdateTeamMemberSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
});
