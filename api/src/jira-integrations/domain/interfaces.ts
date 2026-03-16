import { DataSource } from 'typeorm';
import { IssueSummary } from './types';
import { WorklogTarget, SubmissionStatus, WorklogSubmissionRow, WorklogSubmissionResultRow } from './types';
import { HoursSource } from 'entities/ExternalHoursDaily';

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

export interface WorklogEntry {
  started: string;
  timeSpentSeconds: number;
  author: { accountId: string };
}

export interface GetWorklogsOptions {
  /** Number of results to return per page (default: 50, max: 5000) */
  maxResults?: number;
  /** Index of the first result to return (0-based) */
  startAt?: number;
  /** If true, fetch all worklogs automatically (handles pagination internally) */
  fetchAll?: boolean;
}

export interface GetWorklogsResponse {
  worklogs: WorklogEntry[];
  /** Pagination metadata from Jira API */
  startAt: number;
  maxResults: number;
  total: number;
}

export interface Transition {
  id: string;
  name: string;
  toStatus: string;
}

export interface IJiraWorklogClient {
  createWorklog(request: CreateWorklogRequestPayload): Promise<WorklogResponse>;
  getWorklogs(issueKey: string, options?: GetWorklogsOptions): Promise<GetWorklogsResponse>;
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

export interface IExternalHoursDailyRepository {
  addHours(workDate: string, secondsToAdd: number): Promise<void>;
  getByDateRange(fromDate: string, toDate: string): Promise<{ workDate: string; totalSeconds: number }[]>;
  getByDate(workDate: string): Promise<{ workDate: string; totalSeconds: number; source: HoursSource } | null>;
  setHours(workDate: string, totalSeconds: number, source?: HoursSource): Promise<void>;
}

export interface WorklogServiceDeps {
  internalClient: IJiraWorklogClient;
  externalClient: IJiraWorklogClient;
  submissionRepository: ISubmissionRepository;
  externalHoursDailyRepository?: IExternalHoursDailyRepository;
  tempoIssueKey: string;
  externalAccountId?: string;
}
