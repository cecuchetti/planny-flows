import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadUserInputError } from 'errors';
import { IssueRepository } from 'repositories/IssueRepository';
import { IssuePriority, IssueStatus, IssueType } from 'constants/issues';
import { createTestDataSource, closeTestDataSource } from '../test/utils';
import { createTestProject, createTestUser } from '../test/fixtures';

describe('Issue status validation', () => {
  let ds: DataSource;
  let project: { id: number; name: string };
  let user: { id: number; email: string; name: string; projectId: number };

  beforeAll(async () => {
    ds = await createTestDataSource();
  });

  afterAll(async () => {
    await closeTestDataSource(ds);
  });

  beforeEach(async () => {
    await ds.synchronize(true);
    project = await createTestProject(ds, 'Validation Project');
    user = await createTestUser(ds, project.id);
  });

  it('rejects creating an issue with an invalid status', async () => {
    const repo = new IssueRepository(ds);

    await expect(
      repo.create(project.id, user.id, {
        title: 'Bad issue',
        type: IssueType.TASK,
        status: 'board-columns' as IssueStatus,
        priority: IssuePriority.MEDIUM,
      }),
    ).rejects.toBeInstanceOf(BadUserInputError);
  });

  it('rejects updating an issue with an invalid status', async () => {
    const repo = new IssueRepository(ds);
    const issue = await repo.create(project.id, user.id, {
      title: 'Good issue',
      type: IssueType.TASK,
      status: IssueStatus.BACKLOG,
      priority: IssuePriority.MEDIUM,
    });

    await expect(
      repo.update(issue.id, project.id, {
        status: 'board-columns' as IssueStatus,
      }),
    ).rejects.toBeInstanceOf(BadUserInputError);
  });
});
