import { HttpClient, HttpClientConfig } from './baseClient';
import { IssueSummary } from '../domain/types';
import { IJiraIssueClient, Transition } from '../domain/interfaces';
import { jiraConfig } from '../config';
import { logger } from '../logger';

export interface SearchIssuesParams {
  issueKey?: string;
  projectKey?: string;
  assignee?: string;
  text?: string;
  status?: string;
  excludeStatus?: string;
  maxResults?: number;
}

export class ExternalJiraIssueClient implements IJiraIssueClient {
  private httpClient: HttpClient;

  constructor(configOverride?: Partial<HttpClientConfig>) {
    const httpConfig: HttpClientConfig = {
      baseURL: configOverride?.baseURL ?? jiraConfig.external.atlassianBaseUrl,
      authType: configOverride?.authType ?? jiraConfig.external.jiraAuthType,
      email: configOverride?.email ?? jiraConfig.external.jiraEmail,
      apiToken: configOverride?.apiToken ?? jiraConfig.external.jiraApiToken,
      timeoutMs: configOverride?.timeoutMs ?? jiraConfig.http.connectTimeoutMs,
      systemName: 'external-jira',
    };
    this.httpClient = new HttpClient(httpConfig);
  }

  setRequestId(requestId: string | undefined): void {
    this.httpClient.setRequestId(requestId);
  }

  async searchIssues(params: SearchIssuesParams): Promise<IssueSummary[]> {
    const jql = this.buildJql(params);
    const fields = 'summary,project,status,assignee,issuetype';
    try {
      logger.debug({ jql, maxResults: params.maxResults ?? 50 }, 'Searching Jira');
      const response = await this.httpClient.get<{
        issues?: Array<Record<string, unknown>>;
        values?: Array<Record<string, unknown>>;
        total?: number;
      }>('/rest/api/3/search/jql', {
        params: { jql, fields, maxResults: params.maxResults ?? 50 },
      });
      const issues = Array.isArray(response.issues)
        ? response.issues
        : Array.isArray(response.values)
          ? response.values
          : [];
      return issues.map((issue: Record<string, unknown>) => this.mapIssue(issue));
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error, params }, 'Failed to search issues');
      throw new Error('Failed to search issues in external Jira');
    }
  }

  async getIssueByKey(issueKey: string): Promise<IssueSummary> {
    try {
      const response = await this.httpClient.get<Record<string, unknown>>(
        `/rest/api/3/issue/${issueKey}`,
        { params: { fields: 'summary,project,status,assignee,issuetype' } }
      );
      return this.mapIssue(response);
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      if (err.response?.status === 404) {
        throw new Error(`Issue ${issueKey} not found in external Jira`);
      }
      logger.error({ error: error instanceof Error ? error.message : error, issueKey }, 'Failed to get issue');
      throw new Error('Failed to retrieve issue from external Jira');
    }
  }

  async getTransitions(issueKey: string): Promise<Transition[]> {
    try {
      const response = await this.httpClient.get<{ transitions?: Array<Record<string, unknown>> }>(
        `/rest/api/3/issue/${issueKey}/transitions`
      );
      const transitions = response.transitions || [];
      return transitions.map((t) => ({
        id: String(t.id ?? ''),
        name: String(t.name ?? ''),
        toStatus: String((t.to as Record<string, unknown>)?.name ?? ''),
      }));
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error, issueKey }, 'Failed to get transitions');
      throw new Error('Failed to get transitions from external Jira');
    }
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    try {
      await this.httpClient.post(
        `/rest/api/3/issue/${issueKey}/transitions`,
        { transition: { id: transitionId } }
      );
      logger.info({ issueKey, transitionId }, 'Issue transitioned');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error, issueKey, transitionId }, 'Failed to transition issue');
      throw new Error('Failed to transition issue in external Jira');
    }
  }

  private buildJql(params: SearchIssuesParams): string {
    const clauses: string[] = [];
    if (params.issueKey) clauses.push(`key = "${params.issueKey}"`);
    if (params.projectKey) clauses.push(`project = "${params.projectKey}"`);
    if (params.assignee) {
      clauses.push(
        params.assignee === '__currentUser__'
          ? 'assignee = currentUser()'
          : `assignee = "${params.assignee}"`,
      );
    }
    if (params.text) clauses.push(`text ~ "${params.text}"`);
    if (params.status) clauses.push(`status = "${params.status}"`);
    if (params.excludeStatus) {
      const statuses = params.excludeStatus.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        clauses.push(`status != "${statuses[0]}"`);
      } else if (statuses.length > 1) {
        const list = statuses.map(s => `"${s}"`).join(', ');
        clauses.push(`status not in (${list})`);
      }
    }
    if (clauses.length === 0) clauses.push('updated >= -30d');
    return clauses.join(' AND ') + ' ORDER BY updated DESC';
  }

  private mapIssue(issue: Record<string, unknown>): IssueSummary {
    const fields = (issue.fields as Record<string, unknown>) || {};
    const project = (fields.project as Record<string, unknown>) || {};
    const assignee = (fields.assignee as Record<string, unknown>) || null;
    const issuetype = (fields.issuetype as Record<string, unknown>) || {};
    const status = (fields.status as Record<string, unknown>) || {};
    return {
      id: String(issue.id ?? ''),
      key: String(issue.key ?? ''),
      summary: String(fields.summary ?? ''),
      projectKey: String(project.key ?? ''),
      projectName: String(project.name ?? ''),
      status: String(status.name ?? ''),
      assigneeDisplayName: assignee ? String(assignee.displayName ?? '') : null,
      assigneeAccountId: assignee ? String(assignee.accountId ?? '') : null,
      assigneeAvatarUrl: assignee
        ? String((assignee.avatarUrls as Record<string, unknown>)?.['48x48'] ?? '')
        : null,
      issueType: String(issuetype.name ?? ''),
    };
  }
}
