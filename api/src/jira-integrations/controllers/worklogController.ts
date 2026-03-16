import {
  createWorklogRequestSchema,
  getSubmissionHistoryQuerySchema,
  getHoursByDateQuerySchema,
  updateHoursForDateBodySchema,
  parseWithZod,
} from '../domain/validation';
import { WorklogTarget } from '../domain/types';
import { catchErrors, BadUserInputError } from 'errors';
import { getJiraContainer } from '../container';

export const createWorklog = catchErrors(async (req, res) => {
  let parsed;
  try {
    parsed = parseWithZod(createWorklogRequestSchema, req.body);
  } catch (error) {
    throw new BadUserInputError({ 
      message: error instanceof Error ? error.message : 'Invalid request body' 
    });
  }

  const requestData = { ...parsed, target: parsed.target as WorklogTarget };
  const { worklogService } = getJiraContainer();
  const result = await worklogService.createWorklog(requestData);
  res.respond(result);
});

export const getSubmissionHistory = catchErrors(async (req, res) => {
  let query;
  try {
    query = parseWithZod(getSubmissionHistoryQuerySchema, req.query);
  } catch (error) {
    throw new BadUserInputError({ 
      message: error instanceof Error ? error.message : 'Invalid query parameters' 
    });
  }

  const { submissionRepository } = getJiraContainer();
  const { items, total } = await submissionRepository.searchSubmissions({
    target: query.target as WorklogTarget | undefined,
    status: query.status,
    externalIssueKey: query.externalIssueKey,
    fromDate: query.fromDate,
    toDate: query.toDate,
    page: query.page,
    size: query.size,
  });
  
  res.respond({
    items,
    page: query.page,
    size: query.size,
    total,
  });
});

export const getHoursByDate = catchErrors(async (req, res) => {
  let query;
  try {
    query = parseWithZod(getHoursByDateQuerySchema, req.query);
  } catch (error) {
    throw new BadUserInputError({
      message: error instanceof Error ? error.message : 'Invalid query parameters',
    });
  }
  const { externalHoursDailyRepository } = getJiraContainer();
  const items = await externalHoursDailyRepository.getByDateRange(query.from, query.to);
  res.respond({ items });
});

export const updateHoursForDate = catchErrors(async (req, res) => {
  const workDate = req.params.date as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw new BadUserInputError({ message: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  let body;
  try {
    body = parseWithZod(updateHoursForDateBodySchema, req.body);
  } catch (error) {
    throw new BadUserInputError({
      message: error instanceof Error ? error.message : 'Invalid request body',
    });
  }
  const { externalHoursDailyRepository } = getJiraContainer();
  await externalHoursDailyRepository.setHours(workDate, body.totalSeconds);
  res.respond({ workDate, totalSeconds: body.totalSeconds });
});
