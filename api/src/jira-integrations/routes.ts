import { Router, Request, Response } from 'express';
import * as worklogController from './controllers/worklogController';
import * as issueController from './controllers/issueController';
import { isJiraIntegrationsConfigured } from './config';

const router = Router();

function requireJiraConfig(_req: Request, res: Response, next: () => void): void {
  if (!isJiraIntegrationsConfigured()) {
    res.status(503).json({
      error: 'Jira integrations not configured. Set INTERNAL_ATLASSIAN_BASE_URL, EXTERNAL_ATLASSIAN_BASE_URL and API tokens in .env',
    });
    return;
  }
  next();
}

router.use(requireJiraConfig);

router.post('/worklogs', worklogController.createWorklog);
router.get('/worklogs', worklogController.getSubmissionHistory);
router.get('/worklogs/hours-by-date', worklogController.getHoursByDate);
router.patch('/worklogs/hours-by-date/:date', worklogController.updateHoursForDate);

router.get('/issues', issueController.searchIssues);
router.get('/issues/:issueKey', issueController.getIssueByKey);
router.get('/issues/:issueKey/transitions', issueController.getTransitions);
router.post('/issues/:issueKey/transitions', issueController.transitionIssue);

export default router;
export { router as jiraIntegrationsRouter };
