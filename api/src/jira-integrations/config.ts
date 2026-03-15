import { appConfig } from 'config';

export const jiraConfig = {
  app: appConfig.jira.app,
  internal: appConfig.jira.internal,
  external: appConfig.jira.external,
  http: appConfig.jira.http,
};

export function isJiraIntegrationsConfigured(): boolean {
  return !!(
    jiraConfig.internal.atlassianBaseUrl &&
    jiraConfig.external.atlassianBaseUrl &&
    (jiraConfig.internal.jiraApiToken || jiraConfig.external.jiraApiToken)
  );
}
