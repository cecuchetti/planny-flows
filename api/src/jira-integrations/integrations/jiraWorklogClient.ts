import { HttpClient, HttpClientConfig } from './baseClient';
import { IJiraWorklogClient, CreateWorklogRequestPayload, WorklogResponse } from '../domain/interfaces';

/** Single configurable Jira worklog client. Use with config from getJiraInstanceConfig(instanceName). */
export class JiraWorklogClient implements IJiraWorklogClient {
  private httpClient: HttpClient;

  constructor(config: HttpClientConfig) {
    this.httpClient = new HttpClient(config);
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
