import { DataSource } from 'typeorm';
import { dataSource as defaultDataSource } from 'database/createConnection';
import WorklogSubmissionEntity from 'entities/WorklogSubmission';
import WorklogSubmissionResultEntity from 'entities/WorklogSubmissionResult';
import type { WorklogTarget, SubmissionStatus, WorklogSubmissionRow, WorklogSubmissionResultRow } from '../domain/types';
import { ISubmissionRepository } from '../domain/interfaces';

export class SubmissionRepository implements ISubmissionRepository {
  private dataSource: DataSource;

  constructor(dataSource: DataSource = defaultDataSource) {
    this.dataSource = dataSource;
  }

  private get submissionRepo() {
    return this.dataSource.getRepository(WorklogSubmissionEntity);
  }

  private get resultRepo() {
    return this.dataSource.getRepository(WorklogSubmissionResultEntity);
  }

  async createSubmission(submission: Omit<WorklogSubmissionRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorklogSubmissionRow> {
    const entity = this.submissionRepo.create({
      requestId: submission.requestId,
      target: submission.target,
      tempoIssueKey: submission.tempoIssueKey,
      externalIssueKey: submission.externalIssueKey,
      workDate: submission.workDate,
      startedAt: submission.startedAt,
      timeSpentSeconds: submission.timeSpentSeconds,
      description: submission.description,
      overallStatus: submission.overallStatus,
    });
    const saved = await this.submissionRepo.save(entity);
    return this.toSubmissionRow(saved);
  }

  async updateSubmissionStatus(requestId: string, status: SubmissionStatus): Promise<void> {
    await this.submissionRepo.update({ requestId }, { overallStatus: status });
  }

  async createSubmissionResult(result: Omit<WorklogSubmissionResultRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorklogSubmissionResultRow> {
    const entity = this.resultRepo.create({
      submissionId: result.submissionId,
      targetSystem: result.targetSystem,
      status: result.status,
      externalId: result.externalId,
      requestPayload: result.requestPayload,
      responsePayload: result.responsePayload,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
    const saved = await this.resultRepo.save(entity);
    return this.toResultRow(saved);
  }

  async searchSubmissions(filters: {
    target?: WorklogTarget;
    status?: string;
    externalIssueKey?: string;
    fromDate?: string;
    toDate?: string;
    page: number;
    size: number;
  }): Promise<{ items: WorklogSubmissionRow[]; total: number }> {
    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .orderBy('s.createdAt', 'DESC')
      .skip(filters.page * filters.size)
      .take(filters.size);

    if (filters.target) qb.andWhere('s.target = :target', { target: filters.target });
    if (filters.status) qb.andWhere('s.overallStatus = :status', { status: filters.status });
    if (filters.externalIssueKey) qb.andWhere('s.externalIssueKey = :externalIssueKey', { externalIssueKey: filters.externalIssueKey });
    if (filters.fromDate) qb.andWhere('s.workDate >= :fromDate', { fromDate: filters.fromDate });
    if (filters.toDate) qb.andWhere('s.workDate <= :toDate', { toDate: filters.toDate });

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((e) => this.toSubmissionRow(e)),
      total,
    };
  }

  private toSubmissionRow(e: WorklogSubmissionEntity): WorklogSubmissionRow {
    const toDateStr = (d: Date | string) => (typeof d === 'string' ? d : (d as Date).toISOString());
    const toDateFull = (d: Date | string) => (typeof d === 'string' ? d : (d as Date).toISOString());
    return {
      id: e.id,
      requestId: e.requestId,
      target: e.target as WorklogTarget,
      tempoIssueKey: e.tempoIssueKey,
      externalIssueKey: e.externalIssueKey,
      workDate: toDateStr(e.workDate as Date | string).slice(0, 10),
      startedAt: e.startedAt,
      timeSpentSeconds: e.timeSpentSeconds,
      description: e.description,
      overallStatus: e.overallStatus as SubmissionStatus,
      createdAt: toDateFull(e.createdAt as Date | string),
      updatedAt: toDateFull(e.updatedAt as Date | string),
    };
  }

  private toResultRow(e: WorklogSubmissionResultEntity): WorklogSubmissionResultRow {
    const toStr = (d: Date | string) => (typeof d === 'string' ? d : (d as Date).toISOString());
    return {
      id: e.id,
      submissionId: e.submissionId,
      targetSystem: e.targetSystem as WorklogSubmissionResultRow['targetSystem'],
      status: e.status as WorklogSubmissionResultRow['status'],
      externalId: e.externalId,
      requestPayload: e.requestPayload,
      responsePayload: e.responsePayload,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      createdAt: toStr(e.createdAt as Date | string),
      updatedAt: toStr(e.updatedAt as Date | string),
    };
  }
}
