import { DataSource } from 'typeorm';
import { Project, User, Issue } from 'entities';
import { ProjectCategory } from 'constants/projects';
import { IssueType, IssueStatus, IssuePriority } from 'constants/issues';
import { generateUniqueEmail, generateUniqueProjectName } from './utils';

export interface TestUser {
  id: number;
  email: string;
  name: string;
  projectId: number;
}

export interface TestProject {
  id: number;
  name: string;
}

export async function createTestProject(ds: DataSource, name?: string): Promise<TestProject> {
  const repo = ds.getRepository(Project);
  const project = repo.create({
    name: name || generateUniqueProjectName(),
    category: ProjectCategory.SOFTWARE,
  });
  const saved = await repo.save(project);
  return { id: saved.id, name: saved.name };
}

export async function createTestUser(ds: DataSource, projectId: number): Promise<TestUser> {
  const repo = ds.getRepository(User);
  const user = repo.create({
    name: 'Test User',
    email: generateUniqueEmail(),
    avatarUrl: '',
    project: { id: projectId } as Project,
  });
  const saved = await repo.save(user);
  return { id: saved.id, email: saved.email, name: saved.name, projectId };
}

export async function createTestIssue(
  ds: DataSource,
  projectId: number,
  reporterId: number,
  overrides?: Partial<{ title: string; description: string; type: IssueType; status: IssueStatus; priority: IssuePriority }>
): Promise<Issue> {
  const repo = ds.getRepository(Issue);
  const issue = repo.create({
    title: overrides?.title || 'Test Issue',
    description: overrides?.description || 'Test description',
    type: overrides?.type || IssueType.TASK,
    status: overrides?.status || IssueStatus.BACKLOG,
    priority: overrides?.priority || IssuePriority.MEDIUM,
    projectId,
    reporterId,
  });
  return repo.save(issue);
}
