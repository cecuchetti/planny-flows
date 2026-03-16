import { DataSource } from 'typeorm';
import { JiraWorklogClient } from './integrations/jiraWorklogClient';
import { JiraIssueClient } from './integrations/jiraIssueClient';
import { SubmissionRepository } from './persistence/submissionRepository';
import { ExternalHoursDailyRepository } from './persistence/externalHoursDailyRepository';
import { WorklogService } from './services/worklogService';
import { IssueService } from './services/issueService';
import { getJiraInstanceConfig, getWorklogInstanceNames } from './config/instances';
import { dataSource as defaultDataSource } from 'database/createConnection';
import type { IExternalHoursDailyRepository } from './domain/interfaces';
import { IJiraIssueClient, IJiraWorklogClient, ISubmissionRepository } from './domain/interfaces';

export interface JiraContainer {
  worklogService: WorklogService;
  issueService: IssueService;
  submissionRepository: ISubmissionRepository;
  externalHoursDailyRepository: IExternalHoursDailyRepository;
  externalIssueClient: IJiraIssueClient;
  internalWorklogClient: IJiraWorklogClient;
  externalWorklogClient: IJiraWorklogClient;
}

let containerInstance: JiraContainer | null = null;

export function createJiraContainer(dataSource: DataSource = defaultDataSource): JiraContainer {
  const { internal: internalName, external: externalName } = getWorklogInstanceNames();
  const internalConfig = getJiraInstanceConfig(internalName);
  const externalConfig = getJiraInstanceConfig(externalName);

  const internalWorklogClient = new JiraWorklogClient(internalConfig);
  const externalWorklogClient = new JiraWorklogClient(externalConfig);
  const externalIssueClient = new JiraIssueClient(externalConfig);
  const submissionRepository = new SubmissionRepository(dataSource);
  const externalHoursDailyRepository = new ExternalHoursDailyRepository(dataSource);

  const worklogService = new WorklogService({
    internalClient: internalWorklogClient,
    externalClient: externalWorklogClient,
    submissionRepository,
    externalHoursDailyRepository,
    tempoIssueKey: internalConfig.fixedIssueKey ?? 'VIS-2',
    externalAccountId: externalConfig.myAccountId ?? undefined,
  });

  const issueService = new IssueService({ issueClient: externalIssueClient });

  return {
    worklogService,
    issueService,
    submissionRepository,
    externalHoursDailyRepository,
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
