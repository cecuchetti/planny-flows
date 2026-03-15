import { HttpClient, HttpClientConfig } from './baseClient';
import { jiraConfig } from '../config';
import { IJiraWorklogClient, CreateWorklogRequestPayload, WorklogResponse } from '../domain/interfaces';

export interface CreateJiraWorklogRequest {
  issueKey: string;
  startedAt: string;
  timeSpentSeconds: number;
  description: string;
  authorAccountId?: string;
}

export interface JiraWorklogResponse {
  id: string;
  issueId: string;
  started: string;
  timeSpentSeconds: number;
  comment: string;
  author: { accountId: string };
}

export class InternalJiraWorklogClient implements IJiraWorklogClient {
  private httpClient: HttpClient;

  constructor(configOverride?: Partial<HttpClientConfig>) {
    const httpConfig: HttpClientConfig = {
      baseURL: configOverride?.baseURL ?? jiraConfig.internal.atlassianBaseUrl,
      authType: configOverride?.authType ?? jiraConfig.internal.jiraAuthType,
      email: configOverride?.email ?? jiraConfig.internal.jiraEmail,
      apiToken: configOverride?.apiToken ?? jiraConfig.internal.jiraApiToken,
      timeoutMs: configOverride?.timeoutMs ?? jiraConfig.http.connectTimeoutMs,
      systemName: 'internal-jira',
    };
    this.httpClient = new HttpClient(httpConfig);
  }

  setRequestId(requestId: string | undefined): void {
    this.httpClient.setRequestId(requestId);
  }

  private formatJiraDateTime(isoString: string): string {
    const date = new Date(isoString);
    const isoWithMs = date.toISOString().replace('Z', '');
    const msPart = isoWithMs.includes('.') ? isoWithMs.split('.')[1].slice(0, 3) : '000';
    const datePart = isoWithMs.split('.')[0];
    return `${datePart}.${msPart}+0000`;
  }

  private createAdfComment(text: string): Record<string, unknown> {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    };
  }

  async createWorklog(request: CreateWorklogRequestPayload): Promise<WorklogResponse> {
    const payload: Record<string, unknown> = {
      started: this.formatJiraDateTime(request.startedAt),
      timeSpentSeconds: request.timeSpentSeconds,
    };
    if (request.description) {
      payload.comment = this.createAdfComment(request.description);
    }
    if (request.authorAccountId) {
      payload.author = { accountId: request.authorAccountId };
    }

    const response = await this.httpClient.post<WorklogResponse>(
      `/rest/api/3/issue/${request.issueKey}/worklog`,
      payload
    );
    return response;
  }
}
