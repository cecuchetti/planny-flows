import { DataSource } from 'typeorm';
import { InternalJiraWorklogClient } from './integrations/internalJiraWorklogClient';
import { ExternalJiraWorklogClient } from './integrations/externalJiraWorklogClient';
import { ExternalJiraIssueClient } from './integrations/externalJiraIssueClient';
import { SubmissionRepository } from './persistence/submissionRepository';
import { WorklogService } from './services/worklogService';
import { IssueService } from './services/issueService';
import { jiraConfig } from './config';
import { dataSource as defaultDataSource } from 'database/createConnection';
import { IJiraIssueClient, IJiraWorklogClient, ISubmissionRepository } from './domain/interfaces';

export interface JiraContainer {
  worklogService: WorklogService;
  issueService: IssueService;
  submissionRepository: ISubmissionRepository;
  externalIssueClient: IJiraIssueClient;
  internalWorklogClient: IJiraWorklogClient;
  externalWorklogClient: IJiraWorklogClient;
}

let containerInstance: JiraContainer | null = null;

export function createJiraContainer(dataSource: DataSource = defaultDataSource): JiraContainer {
  const internalWorklogClient = new InternalJiraWorklogClient();
  const externalWorklogClient = new ExternalJiraWorklogClient();
  const externalIssueClient = new ExternalJiraIssueClient();
  const submissionRepository = new SubmissionRepository(dataSource);
  
  const worklogService = new WorklogService({
    internalClient: internalWorklogClient,
    externalClient: externalWorklogClient,
    submissionRepository,
    tempoIssueKey: jiraConfig.internal.jiraFixedIssueKey || 'VIS-2',
    externalAccountId: jiraConfig.external.myAccountId ?? undefined,
  });

  const issueService = new IssueService({ issueClient: externalIssueClient });

  return {
    worklogService,
    issueService,
    submissionRepository,
    externalIssueClient,
    internalWorklogClient,
    externalWorklogClient,
  };
}

export function getJiraContainer(): JiraContainer {
  if (!containerInstance) {
    containerInstance = createJiraContainer();
  }
  return containerInstance;
}

export function setJiraContainer(container: JiraContainer): void {
  containerInstance = container;
}

export function resetJiraContainer(): void {
  containerInstance = null;
}
