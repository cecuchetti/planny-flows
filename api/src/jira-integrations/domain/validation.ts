import { z } from 'zod';

export const createWorklogRequestSchema = z.object({
  target: z.enum(['TEMPO', 'JIRA', 'BOTH']),
  externalIssueKey: z.string().optional(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startedAt: z.string().optional(),
  timeSpentSeconds: z.number().int().positive(),
  description: z.string().max(5000).default(''),
}).refine(
  (data) => data.workDate || data.startedAt,
  { message: 'Either workDate or startedAt must be provided', path: ['workDate', 'startedAt'] }
).refine(
  (data) => {
    if (data.target === 'JIRA' || data.target === 'BOTH') {
      return !!data.externalIssueKey;
    }
    return true;
  },
  { message: 'externalIssueKey is required when target includes JIRA', path: ['externalIssueKey'] }
);

export type CreateWorklogRequest = z.infer<typeof createWorklogRequestSchema>;

export const searchIssuesQuerySchema = z.object({
  issueKey: z.string().optional(),
  projectKey: z.string().optional(),
  assignee: z.string().optional(),
  text: z.string().optional(),
  status: z.string().optional(),
  excludeStatus: z.string().optional(),
  maxResults: z.coerce.number().int().min(1).max(100).default(50),
});

export type SearchIssuesQuery = z.infer<typeof searchIssuesQuerySchema>;

export const getSubmissionHistoryQuerySchema = z.object({
  target: z.enum(['TEMPO', 'JIRA', 'BOTH']).optional(),
  status: z.string().optional(),
  externalIssueKey: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetSubmissionHistoryQuery = z.infer<typeof getSubmissionHistoryQuerySchema>;

export const getHoursByDateQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetHoursByDateQuery = z.infer<typeof getHoursByDateQuerySchema>;

export const updateHoursForDateBodySchema = z.object({
  totalSeconds: z.number().int().min(0),
});

export type UpdateHoursForDateBody = z.infer<typeof updateHoursForDateBodySchema>;

export function parseWithZod<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
  }
  return result.data;
}
