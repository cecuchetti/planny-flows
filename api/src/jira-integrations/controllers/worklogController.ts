import { createWorklogRequestSchema, getSubmissionHistoryQuerySchema, parseWithZod } from '../domain/validation';
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
