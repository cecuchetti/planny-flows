import { v4 as uuidv4 } from 'uuid';
import {
  CreateWorklogRequest,
  WorklogTarget,
  SubmissionStatus,
  TargetSystem,
  TargetResultStatus,
  UnifiedWorklogResponse,
  TargetResult,
} from '../domain/types';
import { IJiraWorklogClient, ISubmissionRepository, WorklogServiceDeps } from '../domain/interfaces';
import { JiraWorklogClient } from '../integrations/jiraWorklogClient';
import { SubmissionRepository } from '../persistence/submissionRepository';
import { getWorklogInstanceNames, getJiraInstanceConfig } from '../config/instances';
import { logger } from 'utils/logger';

export class WorklogService {
  private internalClient: IJiraWorklogClient;
  private externalClient: IJiraWorklogClient;
  private submissionRepository: ISubmissionRepository;
  private externalHoursDailyRepository?: WorklogServiceDeps['externalHoursDailyRepository'];
  private tempoIssueKey: string;
  private externalAccountId?: string;

  constructor(deps?: WorklogServiceDeps) {
    if (deps) {
      this.internalClient = deps.internalClient;
      this.externalClient = deps.externalClient;
      this.submissionRepository = deps.submissionRepository;
      this.externalHoursDailyRepository = deps.externalHoursDailyRepository;
      this.tempoIssueKey = deps.tempoIssueKey;
      this.externalAccountId = deps.externalAccountId;
    } else {
      const { internal, external } = getWorklogInstanceNames();
      const internalConfig = getJiraInstanceConfig(internal);
      const externalConfig = getJiraInstanceConfig(external);
      this.internalClient = new JiraWorklogClient(internalConfig);
      this.externalClient = new JiraWorklogClient(externalConfig);
      this.submissionRepository = new SubmissionRepository();
      this.tempoIssueKey = internalConfig.fixedIssueKey ?? 'VIS-2';
      this.externalAccountId = externalConfig.myAccountId ?? undefined;
    }
  }

  async createWorklog(request: CreateWorklogRequest): Promise<UnifiedWorklogResponse> {
    const requestId = `wlr_${uuidv4().substring(0, 8)}`;
    const { workDate, startedAt } = this.normalizeDateTime(request.workDate, request.startedAt);

    const submission = {
      requestId,
      target: request.target,
      tempoIssueKey: this.tempoIssueKey,
      externalIssueKey: request.externalIssueKey ?? null,
      workDate,
      startedAt,
      timeSpentSeconds: request.timeSpentSeconds,
      description: request.description,
      overallStatus: 'PENDING' as SubmissionStatus,
    };

    const savedSubmission = await this.submissionRepository.createSubmission(submission);
    const results: TargetResult[] = [];

    if (request.target === WorklogTarget.TEMPO || request.target === WorklogTarget.BOTH) {
      const tempoResult = await this.createInternalWorklog(savedSubmission.id, {
        issueKey: this.tempoIssueKey,
        startedAt: startedAt ?? this.toIsoString(workDate),
        timeSpentSeconds: request.timeSpentSeconds,
        description: request.description,
      });
      results.push(tempoResult);
    }

    if (request.target === WorklogTarget.JIRA || request.target === WorklogTarget.BOTH) {
      if (!request.externalIssueKey) {
        throw new Error('externalIssueKey is required for Jira target');
      }
      const jiraResult = await this.createExternalWorklog(savedSubmission.id, {
        issueKey: request.externalIssueKey,
        startedAt: startedAt ?? this.toIsoString(workDate),
        timeSpentSeconds: request.timeSpentSeconds,
        description: request.description,
        authorAccountId: this.externalAccountId,
      });
      results.push(jiraResult);
    }

    const overallStatus = this.calculateOverallStatus(results);
    await this.submissionRepository.updateSubmissionStatus(requestId, overallStatus);

    if (
      this.externalHoursDailyRepository &&
      (request.target === WorklogTarget.JIRA || request.target === WorklogTarget.BOTH)
    ) {
      await this.externalHoursDailyRepository.addHours(workDate, request.timeSpentSeconds);
    }

    return {
      requestId,
      target: request.target,
      tempoIssueKey: this.tempoIssueKey,
      externalIssueKey: request.externalIssueKey ?? null,
      overallStatus,
      results,
    };
  }

  private async createInternalWorklog(
    submissionId: number,
    request: { issueKey: string; startedAt: string; timeSpentSeconds: number; description: string }
  ): Promise<TargetResult> {
    try {
      const response = await this.internalClient.createWorklog(request);
      await this.submissionRepository.createSubmissionResult({
        submissionId,
        targetSystem: TargetSystem.TEMPO,
        status: TargetResultStatus.SUCCESS,
        externalId: response.id,
        requestPayload: JSON.stringify(request),
        responsePayload: JSON.stringify(response),
        errorCode: null,
        errorMessage: null,
      });
      return {
        system: TargetSystem.TEMPO,
        issueKey: request.issueKey,
        status: TargetResultStatus.SUCCESS,
        externalId: response.id,
        message: 'Tempo worklog created successfully.',
      };
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; message?: string };
      logger.error({ error: err?.message, request }, 'Tempo worklog creation failed');
      await this.submissionRepository.createSubmissionResult({
        submissionId,
        targetSystem: TargetSystem.TEMPO,
        status: TargetResultStatus.FAILED,
        externalId: null,
        requestPayload: JSON.stringify(request),
        responsePayload: null,
        errorCode: err?.response?.status?.toString() ?? 'UNKNOWN',
        errorMessage: err?.message ?? 'Unknown error',
      });
      return {
        system: TargetSystem.TEMPO,
        issueKey: request.issueKey,
        status: TargetResultStatus.FAILED,
        externalId: null,
        message: `Tempo worklog creation failed: ${err?.message ?? 'Unknown error'}`,
      };
    }
  }

  private async createExternalWorklog(
    submissionId: number,
    request: {
      issueKey: string;
      startedAt: string;
      timeSpentSeconds: number;
      description: string;
      authorAccountId?: string;
    }
  ): Promise<TargetResult> {
    try {
      const response = await this.externalClient.createWorklog(request);
      await this.submissionRepository.createSubmissionResult({
        submissionId,
        targetSystem: TargetSystem.JIRA,
        status: TargetResultStatus.SUCCESS,
        externalId: response.id,
        requestPayload: JSON.stringify(request),
        responsePayload: JSON.stringify(response),
        errorCode: null,
        errorMessage: null,
      });
      return {
        system: TargetSystem.JIRA,
        issueKey: request.issueKey,
        status: TargetResultStatus.SUCCESS,
        externalId: response.id,
        message: 'Jira worklog created successfully.',
      };
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; message?: string };
      logger.error({ error: err?.message, request }, 'Jira worklog creation failed');
      await this.submissionRepository.createSubmissionResult({
        submissionId,
        targetSystem: TargetSystem.JIRA,
        status: TargetResultStatus.FAILED,
        externalId: null,
        requestPayload: JSON.stringify(request),
        responsePayload: null,
        errorCode: err?.response?.status?.toString() ?? 'UNKNOWN',
        errorMessage: err?.message ?? 'Unknown error',
      });
      return {
        system: TargetSystem.JIRA,
        issueKey: request.issueKey,
        status: TargetResultStatus.FAILED,
        externalId: null,
        message: `Jira worklog creation failed: ${err?.message ?? 'Unknown error'}`,
      };
    }
  }

  private normalizeDateTime(
    workDate?: string,
    startedAt?: string
  ): { workDate: string; startedAt: string | null } {
    if (startedAt) {
      const date = new Date(startedAt);
      return { workDate: date.toISOString().split('T')[0], startedAt };
    }
    if (workDate) return { workDate, startedAt: null };
    throw new Error('Either workDate or startedAt must be provided');
  }

  private toIsoString(dateStr: string): string {
    return `${dateStr}T00:00:00Z`;
  }

  private calculateOverallStatus(results: TargetResult[]): SubmissionStatus {
    const hasSuccess = results.some((r) => r.status === TargetResultStatus.SUCCESS);
    const hasFailure = results.some((r) => r.status === TargetResultStatus.FAILED);
    if (hasSuccess && !hasFailure) return SubmissionStatus.SUCCESS;
    if (!hasSuccess && hasFailure) return SubmissionStatus.FAILED;
    if (hasSuccess && hasFailure) return SubmissionStatus.PARTIAL_SUCCESS;
    return SubmissionStatus.PENDING;
  }
}
