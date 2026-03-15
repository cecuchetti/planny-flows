import { searchIssuesQuerySchema, parseWithZod } from '../domain/validation';
import { jiraConfig } from '../config';
import { catchErrors, BadUserInputError, EntityNotFoundError, ExternalServiceError } from 'errors';
import { getJiraContainer } from '../container';

export const searchIssues = catchErrors(async (req, res) => {
  let query;
  try {
    query = parseWithZod(searchIssuesQuerySchema, req.query);
  } catch (error) {
    throw new BadUserInputError({ 
      message: error instanceof Error ? error.message : 'Invalid query parameters' 
    });
  }

  let assignee = query.assignee;
  if (query.assignee === 'me') {
    assignee = jiraConfig.external.myAccountId || '__currentUser__';
  }
  
  const { issueService } = getJiraContainer();
  const issues = await issueService.searchIssues({ ...query, assignee });
  res.respond({ items: issues, count: issues.length });
});

export const getIssueByKey = catchErrors(async (req, res) => {
  const { issueKey } = req.params;
  const { issueService } = getJiraContainer();
  try {
    const issue = await issueService.getIssueByKey(String(issueKey));
    res.respond(issue);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('not found')) {
      throw new EntityNotFoundError(`Issue ${issueKey}`);
    }
    throw new ExternalServiceError(message || 'Failed to retrieve issue', 'Jira');
  }
});

export const getTransitions = catchErrors(async (req, res) => {
  const { issueKey } = req.params;
  const { issueService } = getJiraContainer();
  const transitions = await issueService.getTransitions(String(issueKey));
  res.respond({ transitions });
});

export const transitionIssue = catchErrors(async (req, res) => {
  const { issueKey } = req.params;
  const { transitionId } = req.body;
  
  if (!transitionId) {
    throw new BadUserInputError({ transitionId: 'transitionId is required' });
  }
  
  const { issueService } = getJiraContainer();
  await issueService.transitionIssue(String(issueKey), String(transitionId));
  res.respond({ success: true });
});
