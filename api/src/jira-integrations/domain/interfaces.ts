import { DataSource } from 'typeorm';
import { IssueSummary } from './types';
import { WorklogTarget, SubmissionStatus, WorklogSubmissionRow, WorklogSubmissionResultRow } from './types';

export interface CreateWorklogRequestPayload {
  issueKey: string;
  startedAt: string;
  timeSpentSeconds: number;
  description: string;
  authorAccountId?: string;
}

export interface WorklogResponse {
  id: string;
  issueId: string;
  started: string;
  timeSpentSeconds: number;
  comment: string;
  author: { accountId: string };
}

export interface Transition {
  id: string;
  name: string;
  toStatus: string;
}

export interface IJiraWorklogClient {
  createWorklog(request: CreateWorklogRequestPayload): Promise<WorklogResponse>;
}

export interface IJiraIssueClient {
  searchIssues(params: {
    issueKey?: string;
    projectKey?: string;
    assignee?: string;
    text?: string;
    status?: string;
    excludeStatus?: string;
    maxResults?: number;
  }): Promise<IssueSummary[]>;
  getIssueByKey(issueKey: string): Promise<IssueSummary>;
  getTransitions(issueKey: string): Promise<Transition[]>;
  transitionIssue(issueKey: string, transitionId: string): Promise<void>;
}

export interface ISubmissionRepository {
  createSubmission(submission: Omit<WorklogSubmissionRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorklogSubmissionRow>;
  updateSubmissionStatus(requestId: string, status: SubmissionStatus): Promise<void>;
  createSubmissionResult(result: Omit<WorklogSubmissionResultRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorklogSubmissionResultRow>;
  searchSubmissions(filters: {
    target?: WorklogTarget;
    status?: string;
    externalIssueKey?: string;
    fromDate?: string;
    toDate?: string;
    page: number;
    size: number;
  }): Promise<{ items: WorklogSubmissionRow[]; total: number }>;
}

export interface WorklogServiceDeps {
  internalClient: IJiraWorklogClient;
  externalClient: IJiraWorklogClient;
  submissionRepository: ISubmissionRepository;
  tempoIssueKey: string;
  externalAccountId?: string;
}
