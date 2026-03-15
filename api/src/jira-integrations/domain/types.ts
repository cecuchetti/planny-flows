export enum WorklogTarget {
  TEMPO = 'TEMPO',
  JIRA = 'JIRA',
  BOTH = 'BOTH',
}

export enum SubmissionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
}

export enum TargetSystem {
  TEMPO = 'TEMPO',
  JIRA = 'JIRA',
}

export enum TargetResultStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface IssueSummary {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  projectName: string;
  status: string;
  assigneeDisplayName: string | null;
  assigneeAccountId: string | null;
  issueType: string;
}

export interface CreateWorklogRequest {
  target: WorklogTarget;
  externalIssueKey?: string;
  workDate?: string;
  startedAt?: string;
  timeSpentSeconds: number;
  description: string;
}

export interface WorklogSubmissionRow {
  id: number;
  requestId: string;
  target: WorklogTarget;
  tempoIssueKey: string;
  externalIssueKey: string | null;
  workDate: string;
  startedAt: string | null;
  timeSpentSeconds: number;
  description: string;
  overallStatus: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorklogSubmissionResultRow {
  id: number;
  submissionId: number;
  targetSystem: TargetSystem;
  status: TargetResultStatus;
  externalId: string | null;
  requestPayload: string;
  responsePayload: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedWorklogResponse {
  requestId: string;
  target: WorklogTarget;
  tempoIssueKey: string;
  externalIssueKey: string | null;
  overallStatus: SubmissionStatus;
  results: TargetResult[];
}

export interface TargetResult {
  system: TargetSystem;
  issueKey: string;
  status: TargetResultStatus;
  externalId: string | null;
  message: string;
}
