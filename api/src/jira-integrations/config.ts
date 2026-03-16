import { appConfig } from 'config';
import { getWorklogInstanceNames, getJiraInstanceConfig } from './config/instances';

export const jiraConfig = {
  app: appConfig.jira.app,
  internal: appConfig.jira.internal,
  external: appConfig.jira.external,
  http: appConfig.jira.http,
};

export function isJiraIntegrationsConfigured(): boolean {
  try {
    const { internal, external } = getWorklogInstanceNames();
    const internalConfig = getJiraInstanceConfig(internal);
    const externalConfig = getJiraInstanceConfig(external);
    return !!(
      internalConfig.baseURL &&
      externalConfig.baseURL &&
      (internalConfig.apiToken || externalConfig.apiToken)
    );
  } catch {
    return !!(
      jiraConfig.internal.atlassianBaseUrl &&
      jiraConfig.external.atlassianBaseUrl &&
      (jiraConfig.internal.jiraApiToken || jiraConfig.external.jiraApiToken)
    );
  }
}
