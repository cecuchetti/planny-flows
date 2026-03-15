import { Request, Response } from 'express';

import * as authentication from 'controllers/authentication';
import * as comments from 'controllers/comments';
import * as issues from 'controllers/issues';
import * as projects from 'controllers/projects';
import * as test from 'controllers/test';
import * as users from 'controllers/users';
import * as health from 'controllers/health';
import * as maintenance from 'controllers/maintenance';
import { jiraIntegrationsRouter } from 'jira-integrations/routes';
import { appConfig } from 'config';

export const attachPublicRoutes = (app: any): void => {
  app.get('/health', health.healthCheck);
  app.get('/health/ready', health.readinessCheck);
  app.get('/health/live', health.livenessCheck);

  if (appConfig.env === 'test') {
    app.delete('/test/reset-database', test.resetDatabase);
    app.post('/test/create-account', test.createAccount);
  }

  app.get('/', (_req: Request, res: Response) => {
    res.redirect(302, appConfig.clientUrl);
  });

  app.post('/authentication/guest', authentication.createGuestAccount);
};

export const attachPrivateRoutes = (app: any): void => {
  app.post('/comments', comments.create);
  app.put('/comments/:commentId', comments.update);
  app.delete('/comments/:commentId', comments.remove);

  app.get('/issues', issues.getProjectIssues);
  app.get('/issues/:issueId', issues.getIssueWithUsersAndComments);
  app.post('/issues', issues.create);
  app.put('/issues/:issueId', issues.update);
  app.delete('/issues/:issueId', issues.remove);

  app.get('/project', projects.getProjectWithUsersAndIssues);
  app.put('/project', projects.update);

  app.get('/currentUser', users.getCurrentUser);

  app.get('/maintenance/actions/outlook-clean/status', maintenance.getOutlookCleanStatus);
  app.post('/maintenance/actions/outlook-clean', maintenance.triggerOutlookClean);

  // External Jira integrations - worklogs and issue management
  app.use('/api/v1/jira', jiraIntegrationsRouter);
};
