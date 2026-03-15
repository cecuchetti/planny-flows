import { IssueRepository, CreateIssueData, UpdateIssueData, SearchIssuesParams } from 'repositories/IssueRepository';
import { Issue } from 'entities';

export interface IssueServiceDeps {
  issueRepository: IssueRepository;
}

export class IssueService {
  private issueRepository: IssueRepository;

  constructor(deps?: IssueServiceDeps) {
    if (deps) {
      this.issueRepository = deps.issueRepository;
    } else {
      this.issueRepository = new IssueRepository();
    }
  }

  async searchByProject(params: SearchIssuesParams): Promise<Issue[]> {
    return this.issueRepository.findByProject(params);
  }

  async findByIdAndProject(issueId: number, projectId: number): Promise<Issue> {
    return this.issueRepository.findByIdAndProject(issueId, projectId);
  }

  async create(projectId: number, reporterId: number, data: CreateIssueData): Promise<Issue> {
    return this.issueRepository.create(projectId, reporterId, data);
  }

  async update(issueId: number, projectId: number, data: UpdateIssueData): Promise<Issue> {
    return this.issueRepository.update(issueId, projectId, data);
  }

  async delete(issueId: number, projectId: number): Promise<Issue> {
    return this.issueRepository.delete(issueId, projectId);
  }
}

export const issueService = new IssueService();
