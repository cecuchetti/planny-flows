import { IJiraIssueClient, Transition } from '../domain/interfaces';
import type { IssueSummary } from '../domain/types';
import { ExternalJiraIssueClient } from '../integrations/externalJiraIssueClient';

export interface JiraIssueServiceDeps {
  issueClient: IJiraIssueClient;
}

export class IssueService {
  private issueClient: IJiraIssueClient;

  constructor(deps?: JiraIssueServiceDeps) {
    if (deps) {
      this.issueClient = deps.issueClient;
    } else {
      this.issueClient = new ExternalJiraIssueClient();
    }
  }

  async searchIssues(params: {
    issueKey?: string;
    projectKey?: string;
    assignee?: string;
    text?: string;
    status?: string;
    excludeStatus?: string;
    maxResults?: number;
  }): Promise<IssueSummary[]> {
    return this.issueClient.searchIssues(params);
  }

  async getIssueByKey(issueKey: string): Promise<IssueSummary> {
    return this.issueClient.getIssueByKey(issueKey);
  }

  async getTransitions(issueKey: string): Promise<Transition[]> {
    return this.issueClient.getTransitions(issueKey);
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    return this.issueClient.transitionIssue(issueKey, transitionId);
  }
}
