import { DataSource } from 'typeorm';
import { Issue } from 'entities';
import { EntityNotFoundError } from 'errors';
import { IssueType, IssueStatus, IssuePriority } from 'constants/issues';
import { dataSource as defaultDataSource } from 'database/createConnection';

export interface CreateIssueData {
  title: string;
  description?: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  userIds?: number[];
  estimate?: number;
  timeSpent?: number;
  timeRemaining?: number;
  listPosition?: number;
}

export interface UpdateIssueData {
  title?: string;
  description?: string;
  type?: IssueType;
  status?: IssueStatus;
  priority?: IssuePriority;
  userIds?: number[];
  estimate?: number;
  timeSpent?: number;
  timeRemaining?: number;
  listPosition?: number;
}

export interface SearchIssuesParams {
  projectId: number;
  searchTerm?: string;
}

export class IssueRepository {
  private dataSource: DataSource;

  constructor(dataSource: DataSource = defaultDataSource) {
    this.dataSource = dataSource;
  }

  async findByProject(params: SearchIssuesParams): Promise<Issue[]> {
    const { projectId, searchTerm } = params;

    let whereSQL = 'issue.projectId = :projectId';
    const queryParams: { projectId: number; searchTerm?: string } = { projectId };

    if (searchTerm) {
      whereSQL +=
        ' AND (LOWER(issue.title) LIKE :searchTerm OR LOWER(issue.descriptionText) LIKE :searchTerm)';
      queryParams.searchTerm = `%${searchTerm.toLowerCase()}%`;
    }

    return this.dataSource
      .getRepository(Issue)
      .createQueryBuilder('issue')
      .select()
      .where(whereSQL, queryParams)
      .getMany();
  }

  async findByIdAndProject(issueId: number, projectId: number): Promise<Issue> {
    const issue = await this.dataSource
      .getRepository(Issue)
      .findOne({
        where: { id: issueId, projectId },
        relations: ['users', 'comments', 'comments.user'],
      });
    if (!issue) {
      throw new EntityNotFoundError('Issue');
    }
    return issue;
  }

  async create(projectId: number, reporterId: number, data: CreateIssueData): Promise<Issue> {
    const listPosition = await this.calculateListPosition(projectId, data.status);
    const issue = this.dataSource.getRepository(Issue).create({
      ...data,
      projectId,
      reporterId,
      listPosition: data.listPosition ?? listPosition,
    });
    return issue.save();
  }

  async update(issueId: number, projectId: number, data: UpdateIssueData): Promise<Issue> {
    const issue = await this.findByIdAndProject(issueId, projectId);
    Object.assign(issue, data);
    return issue.save();
  }

  async delete(issueId: number, projectId: number): Promise<Issue> {
    const issue = await this.findByIdAndProject(issueId, projectId);
    await issue.remove();
    return issue;
  }

  private async calculateListPosition(projectId: number, status: IssueStatus): Promise<number> {
    const issues = await this.dataSource
      .getRepository(Issue)
      .find({
        where: { projectId, status },
      });
    const listPositions = issues.map(({ listPosition }) => listPosition);
    if (listPositions.length > 0) {
      return Math.min(...listPositions) - 1;
    }
    return 1;
  }
}
