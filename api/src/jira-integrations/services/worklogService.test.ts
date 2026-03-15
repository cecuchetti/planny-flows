import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorklogService } from './worklogService';
import { WorklogTarget, SubmissionStatus, TargetSystem, TargetResultStatus } from '../domain/types';
import { IJiraWorklogClient, ISubmissionRepository, WorklogServiceDeps } from '../domain/interfaces';

function createMockWorklogClient(): IJiraWorklogClient {
  return {
    createWorklog: vi.fn().mockResolvedValue({ id: 'wl-123', issueId: '1', started: '2024-01-15T09:00:00.000+0000', timeSpentSeconds: 3600, comment: '', author: { accountId: 'test' } }),
  };
}

function createMockSubmissionRepository(): ISubmissionRepository {
  return {
    createSubmission: vi.fn().mockResolvedValue({ id: 1, requestId: 'wlr_12345678', target: WorklogTarget.TEMPO, tempoIssueKey: 'VIS-2', externalIssueKey: null, workDate: '2024-01-15', startedAt: null, timeSpentSeconds: 3600, description: 'Test', overallStatus: SubmissionStatus.PENDING, createdAt: '2024-01-15T09:00:00Z', updatedAt: '2024-01-15T09:00:00Z' }),
    updateSubmissionStatus: vi.fn().mockResolvedValue(undefined),
    createSubmissionResult: vi.fn().mockResolvedValue({ id: 1, submissionId: 1, targetSystem: TargetSystem.TEMPO, status: TargetResultStatus.SUCCESS, externalId: 'wl-123', requestPayload: '{}', responsePayload: '{}', errorCode: null, errorMessage: null, createdAt: '2024-01-15T09:00:00Z', updatedAt: '2024-01-15T09:00:00Z' }),
    searchSubmissions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function createTestDeps(overrides?: Partial<WorklogServiceDeps>): WorklogServiceDeps {
  return {
    internalClient: createMockWorklogClient(),
    externalClient: createMockWorklogClient(),
    submissionRepository: createMockSubmissionRepository(),
    tempoIssueKey: 'VIS-2',
    externalAccountId: 'test-account-id',
    ...overrides,
  };
}

describe('WorklogService', () => {
  let mockInternalClient: IJiraWorklogClient;
  let mockExternalClient: IJiraWorklogClient;
  let mockSubmissionRepo: ISubmissionRepository;
  let service: WorklogService;

  beforeEach(() => {
    mockInternalClient = createMockWorklogClient();
    mockExternalClient = createMockWorklogClient();
    mockSubmissionRepo = createMockSubmissionRepository();
    
    service = new WorklogService({
      internalClient: mockInternalClient,
      externalClient: mockExternalClient,
      submissionRepository: mockSubmissionRepo,
      tempoIssueKey: 'VIS-2',
      externalAccountId: 'test-account-id',
    });
  });

  describe('createWorklog', () => {
    it('should create a TEMPO worklog', async () => {
      const request = {
        target: WorklogTarget.TEMPO,
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = await service.createWorklog(request);

      expect(result.target).toBe(WorklogTarget.TEMPO);
      expect(result.tempoIssueKey).toBe('VIS-2');
      expect(result.overallStatus).toBe(SubmissionStatus.SUCCESS);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].system).toBe(TargetSystem.TEMPO);
      expect(mockInternalClient.createWorklog).toHaveBeenCalledOnce();
      expect(mockExternalClient.createWorklog).not.toHaveBeenCalled();
    });

    it('should create a JIRA worklog', async () => {
      const request = {
        target: WorklogTarget.JIRA,
        externalIssueKey: 'VIS-123',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = await service.createWorklog(request);

      expect(result.target).toBe(WorklogTarget.JIRA);
      expect(result.externalIssueKey).toBe('VIS-123');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].system).toBe(TargetSystem.JIRA);
      expect(mockInternalClient.createWorklog).not.toHaveBeenCalled();
      expect(mockExternalClient.createWorklog).toHaveBeenCalledOnce();
    });

    it('should create both TEMPO and JIRA worklogs for BOTH target', async () => {
      const request = {
        target: WorklogTarget.BOTH,
        externalIssueKey: 'VIS-123',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = await service.createWorklog(request);

      expect(result.target).toBe(WorklogTarget.BOTH);
      expect(result.results).toHaveLength(2);
      expect(mockInternalClient.createWorklog).toHaveBeenCalledOnce();
      expect(mockExternalClient.createWorklog).toHaveBeenCalledOnce();
    });

    it('should throw error when JIRA target is missing externalIssueKey', async () => {
      const request = {
        target: WorklogTarget.JIRA,
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      await expect(service.createWorklog(request)).rejects.toThrow(/externalIssueKey is required/);
    });

    it('should handle TEMPO failure gracefully', async () => {
      vi.mocked(mockInternalClient.createWorklog).mockRejectedValueOnce(new Error('Tempo API error'));

      const request = {
        target: WorklogTarget.TEMPO,
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = await service.createWorklog(request);

      expect(result.overallStatus).toBe(SubmissionStatus.FAILED);
      expect(result.results[0].status).toBe(TargetResultStatus.FAILED);
      expect(result.results[0].message).toContain('Tempo worklog creation failed');
    });

    it('should handle partial success for BOTH target', async () => {
      vi.mocked(mockInternalClient.createWorklog).mockRejectedValueOnce(new Error('Tempo API error'));

      const request = {
        target: WorklogTarget.BOTH,
        externalIssueKey: 'VIS-123',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = await service.createWorklog(request);

      expect(result.overallStatus).toBe(SubmissionStatus.PARTIAL_SUCCESS);
      expect(result.results).toHaveLength(2);
      expect(result.results.find(r => r.system === TargetSystem.TEMPO)?.status).toBe(TargetResultStatus.FAILED);
      expect(result.results.find(r => r.system === TargetSystem.JIRA)?.status).toBe(TargetResultStatus.SUCCESS);
    });

    it('should use startedAt when provided', async () => {
      const request = {
        target: WorklogTarget.TEMPO,
        startedAt: '2024-01-15T09:30:00Z',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      await service.createWorklog(request);

      expect(mockInternalClient.createWorklog).toHaveBeenCalledWith(
        expect.objectContaining({
          startedAt: '2024-01-15T09:30:00Z',
        })
      );
    });

    it('should call createSubmission with correct data', async () => {
      const request = {
        target: WorklogTarget.TEMPO,
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      await service.createWorklog(request);

      expect(mockSubmissionRepo.createSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          target: WorklogTarget.TEMPO,
          workDate: '2024-01-15',
          timeSpentSeconds: 3600,
          description: 'Test work',
          overallStatus: SubmissionStatus.PENDING,
        })
      );
    });

    it('should update submission status after completion', async () => {
      const request = {
        target: WorklogTarget.TEMPO,
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      await service.createWorklog(request);

      expect(mockSubmissionRepo.updateSubmissionStatus).toHaveBeenCalledWith(
        expect.stringMatching(/^wlr_[a-f0-9]{8}$/),
        SubmissionStatus.SUCCESS
      );
    });

    it('should call createSubmissionResult for each target', async () => {
      const request = {
        target: WorklogTarget.BOTH,
        externalIssueKey: 'VIS-123',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      await service.createWorklog(request);

      expect(mockSubmissionRepo.createSubmissionResult).toHaveBeenCalledTimes(2);
    });
  });
});
