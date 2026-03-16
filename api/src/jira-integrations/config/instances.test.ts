import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  getJiraInstanceConfig,
  getAllInstanceNames,
  getWorklogInstanceNames,
  resetJiraInstancesCache,
  type JiraInstanceConfig,
} from './instances';

describe('jira instances config', () => {
  beforeEach(() => {
    resetJiraInstancesCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fallback to appConfig when YAML missing', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('returns worklog instance names', () => {
      const names = getWorklogInstanceNames();
      expect(names).toEqual({ internal: 'internal', external: 'external' });
    });

    it('returns all instance names', () => {
      const names = getAllInstanceNames();
      expect(names).toContain('internal');
      expect(names).toContain('external');
      expect(names.length).toBe(2);
    });

    it('returns internal instance config with expected shape', () => {
      const config = getJiraInstanceConfig('internal');
      expect(config).toMatchObject({
        authType: expect.any(String),
        systemName: 'internal-jira',
      });
      expect(config).toHaveProperty('baseURL');
      expect(config).toHaveProperty('timeoutMs');
      expect(config).toHaveProperty('fixedIssueKey');
    });

    it('returns external instance config with expected shape', () => {
      const config = getJiraInstanceConfig('external');
      expect(config).toMatchObject({
        authType: expect.any(String),
        systemName: 'external-jira',
      });
      expect(config).toHaveProperty('baseURL');
      expect(config).toHaveProperty('myAccountId');
    });

    it('throws for unknown instance name', () => {
      expect(() => getJiraInstanceConfig('unknown')).toThrow(/Unknown Jira instance/);
    });
  });

  describe('JiraInstanceConfig shape for clients', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('internal config can be used as HttpClientConfig', () => {
      const config = getJiraInstanceConfig('internal') as JiraInstanceConfig;
      expect(config.baseURL).toBeDefined();
      expect(['basic', 'bearer']).toContain(config.authType);
      expect(config.timeoutMs).toBeGreaterThan(0);
      expect(config.systemName).toBe('internal-jira');
    });
  });
});
