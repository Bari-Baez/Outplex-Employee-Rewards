import { z } from 'zod';

export const supportDepartmentSchema = z.enum(['it', 'moderator']);
export const supportTicketStatusSchema = z.enum(['open', 'in_progress', 'resolved']);

export const createSupportTicketSchema = z.object({
  department: supportDepartmentSchema,
  message: z.string().trim().min(1).max(4_000),
}).strict();

export const updateSupportTicketSchema = z.object({
  status: supportTicketStatusSchema,
}).strict();

export const supportTicketIdSchema = z.uuid();

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
export type SupportDepartment = z.infer<typeof supportDepartmentSchema>;
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;
