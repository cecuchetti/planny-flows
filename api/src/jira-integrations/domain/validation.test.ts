import { describe, it, expect } from 'vitest';
import {
  createWorklogRequestSchema,
  searchIssuesQuerySchema,
  getSubmissionHistoryQuerySchema,
  parseWithZod,
} from './validation';

describe('Zod Validation', () => {
  describe('createWorklogRequestSchema', () => {
    it('should validate a valid TEMPO worklog request', () => {
      const input = {
        target: 'TEMPO',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = parseWithZod(createWorklogRequestSchema, input);
      expect(result.target).toBe('TEMPO');
      expect(result.workDate).toBe('2024-01-15');
      expect(result.timeSpentSeconds).toBe(3600);
    });

    it('should validate a valid JIRA worklog request with externalIssueKey', () => {
      const input = {
        target: 'JIRA',
        externalIssueKey: 'VIS-123',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = parseWithZod(createWorklogRequestSchema, input);
      expect(result.target).toBe('JIRA');
      expect(result.externalIssueKey).toBe('VIS-123');
    });

    it('should validate a valid BOTH worklog request', () => {
      const input = {
        target: 'BOTH',
        externalIssueKey: 'VIS-123',
        startedAt: '2024-01-15T09:00:00Z',
        timeSpentSeconds: 3600,
        description: 'Test work',
      };

      const result = parseWithZod(createWorklogRequestSchema, input);
      expect(result.target).toBe('BOTH');
      expect(result.startedAt).toBe('2024-01-15T09:00:00Z');
    });

    it('should reject JIRA target without externalIssueKey', () => {
      const input = {
        target: 'JIRA',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
      };

      expect(() => parseWithZod(createWorklogRequestSchema, input)).toThrow(/externalIssueKey is required/);
    });

    it('should reject missing workDate and startedAt', () => {
      const input = {
        target: 'TEMPO',
        timeSpentSeconds: 3600,
      };

      expect(() => parseWithZod(createWorklogRequestSchema, input)).toThrow(/Either workDate or startedAt/);
    });

    it('should reject invalid workDate format', () => {
      const input = {
        target: 'TEMPO',
        workDate: '2024/01/15',
        timeSpentSeconds: 3600,
      };

      expect(() => parseWithZod(createWorklogRequestSchema, input)).toThrow(/Validation failed/);
    });

    it('should reject negative timeSpentSeconds', () => {
      const input = {
        target: 'TEMPO',
        workDate: '2024-01-15',
        timeSpentSeconds: -100,
      };

      expect(() => parseWithZod(createWorklogRequestSchema, input)).toThrow(/Validation failed/);
    });

    it('should reject invalid target', () => {
      const input = {
        target: 'INVALID',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
      };

      expect(() => parseWithZod(createWorklogRequestSchema, input)).toThrow(/Validation failed/);
    });

    it('should default empty description', () => {
      const input = {
        target: 'TEMPO',
        workDate: '2024-01-15',
        timeSpentSeconds: 3600,
      };

      const result = parseWithZod(createWorklogRequestSchema, input);
      expect(result.description).toBe('');
    });
  });

  describe('searchIssuesQuerySchema', () => {
    it('should validate with all fields', () => {
      const input = {
        issueKey: 'VIS-123',
        projectKey: 'VIS',
        assignee: 'me',
        text: 'search term',
        status: 'In Progress',
        excludeStatus: 'Done,Closed',
        maxResults: 25,
      };

      const result = parseWithZod(searchIssuesQuerySchema, input);
      expect(result.issueKey).toBe('VIS-123');
      expect(result.maxResults).toBe(25);
    });

    it('should apply defaults for maxResults', () => {
      const input = {};

      const result = parseWithZod(searchIssuesQuerySchema, input);
      expect(result.maxResults).toBe(50);
    });

    it('should coerce string maxResults to number', () => {
      const input = {
        maxResults: '30',
      };

      const result = parseWithZod(searchIssuesQuerySchema, input);
      expect(result.maxResults).toBe(30);
      expect(typeof result.maxResults).toBe('number');
    });

    it('should reject maxResults > 100', () => {
      const input = {
        maxResults: 150,
      };

      expect(() => parseWithZod(searchIssuesQuerySchema, input)).toThrow(/Validation failed/);
    });

    it('should reject maxResults < 1', () => {
      const input = {
        maxResults: 0,
      };

      expect(() => parseWithZod(searchIssuesQuerySchema, input)).toThrow(/Validation failed/);
    });
  });

  describe('getSubmissionHistoryQuerySchema', () => {
    it('should validate with all fields', () => {
      const input = {
        target: 'TEMPO',
        status: 'SUCCESS',
        externalIssueKey: 'VIS-123',
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        page: 1,
        size: 50,
      };

      const result = parseWithZod(getSubmissionHistoryQuerySchema, input);
      expect(result.target).toBe('TEMPO');
      expect(result.page).toBe(1);
      expect(result.size).toBe(50);
    });

    it('should apply defaults for page and size', () => {
      const input = {};

      const result = parseWithZod(getSubmissionHistoryQuerySchema, input);
      expect(result.page).toBe(0);
      expect(result.size).toBe(20);
    });

    it('should coerce string page and size to numbers', () => {
      const input = {
        page: '2',
        size: '30',
      };

      const result = parseWithZod(getSubmissionHistoryQuerySchema, input);
      expect(result.page).toBe(2);
      expect(result.size).toBe(30);
    });

    it('should reject invalid target', () => {
      const input = {
        target: 'INVALID',
      };

      expect(() => parseWithZod(getSubmissionHistoryQuerySchema, input)).toThrow(/Validation failed/);
    });

    it('should reject size > 100', () => {
      const input = {
        size: 150,
      };

      expect(() => parseWithZod(getSubmissionHistoryQuerySchema, input)).toThrow(/Validation failed/);
    });
  });
});
