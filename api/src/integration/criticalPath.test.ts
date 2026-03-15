import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestDataSource, closeTestDataSource } from '../test/utils';
import { createTestProject, createTestUser } from '../test/fixtures';
import { IssueRepository } from '../repositories/IssueRepository';
import { IssueStatus } from '../constants/issues';

describe('Critical Path Integration Tests', () => {
  let ds: DataSource;
  let testProject: { id: number; name: string };
  let testUser: { id: number; email: string; name: string; projectId: number };

  beforeAll(async () => {
    ds = await createTestDataSource();
  });

  afterAll(async () => {
    await closeTestDataSource(ds);
  });

  beforeEach(async () => {
    testProject = await createTestProject(ds);
    testUser = await createTestUser(ds, testProject.id);
  });

  describe('Issue CRUD operations', () => {
    it('should create an issue', async () => {
      const issueData = {
        title: 'Integration Test Issue',
        description: 'Created during integration test',
        type: 'TASK' as const,
        status: 'BACKLOG' as const,
        priority: 'HIGH' as const,
      };

      const issueRepo = new IssueRepository(ds);
      const issue = await issueRepo.create(testProject.id, testUser.id, issueData);

      expect(issue.id).toBeDefined();
      expect(issue.title).toBe(issueData.title);
      expect(issue.projectId).toBe(testProject.id);
      expect(issue.reporterId).toBe(testUser.id);
    });

    it('should find issues by project', async () => {
      const issueRepo = new IssueRepository(ds);
      
      await issueRepo.create(testProject.id, testUser.id, {
        title: 'Issue 1',
        type: 'TASK',
        status: IssueStatus.BACKLOG,
        priority: 'MEDIUM',
      });
      
      await issueRepo.create(testProject.id, testUser.id, {
        title: 'Issue 2',
        type: 'BUG',
        status: IssueStatus.BACKLOG,
        priority: 'HIGH',
      });

      const issues = await issueRepo.findByProject({ projectId: testProject.id });
      expect(issues).toHaveLength(2);
      expect(issues.map(i => i.title)).toContain('Issue 1');
      expect(issues.map(i => i.title)).toContain('Issue 2');
    });

    it('should not find issues from other projects', async () => {
      const otherProject = await createTestProject(ds, 'Other Project');
      
      const issueRepo = new IssueRepository(ds);
      await issueRepo.create(testProject.id, testUser.id, {
        title: 'My Issue',
        type: 'TASK',
        status: IssueStatus.BACKLOG,
        priority: 'MEDIUM',
      });

      const otherProjectIssues = await issueRepo.findByProject({ projectId: otherProject.id });
      expect(otherProjectIssues).toHaveLength(0);
    });

    it('should update an issue', async () => {
      const issueRepo = new IssueRepository(ds);
      const issue = await issueRepo.create(testProject.id, testUser.id, {
        title: 'Original Title',
        type: 'TASK',
        status: IssueStatus.BACKLOG,
        priority: 'MEDIUM',
      });

      const updated = await issueRepo.update(issue.id, testProject.id, {
        title: 'Updated Title',
        status: IssueStatus.IN_PROGRESS,
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.status).toBe(IssueStatus.IN_PROGRESS);
    });

    it('should not update issue from different project', async () => {
      const otherProject = await createTestProject(ds, 'Other Project');
      const issueRepo = new IssueRepository(ds);
      
      const issue = await issueRepo.create(testProject.id, testUser.id, {
        title: 'My Issue',
        type: 'TASK',
        status: IssueStatus.BACKLOG,
        priority: 'MEDIUM',
      });

      await expect(
        issueRepo.update(issue.id, otherProject.id, { title: 'Hacked Title' })
      ).rejects.toThrow();
    });

    it('should delete an issue', async () => {
      const issueRepo = new IssueRepository(ds);
      const issue = await issueRepo.create(testProject.id, testUser.id, {
        title: 'To Delete',
        type: 'TASK',
        status: IssueStatus.BACKLOG,
        priority: 'MEDIUM',
      });

      await issueRepo.delete(issue.id, testProject.id);

      await expect(
        issueRepo.findByIdAndProject(issue.id, testProject.id)
      ).rejects.toThrow();
    });
  });
});
