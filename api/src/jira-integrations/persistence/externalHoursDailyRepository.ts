import { DataSource } from 'typeorm';
import { dataSource as defaultDataSource } from 'database/createConnection';
import ExternalHoursDailyEntity, { HoursSource } from 'entities/ExternalHoursDaily';

export interface HoursByDateRow {
  workDate: string;
  totalSeconds: number;
}

export interface DailyHoursRecord {
  workDate: string;
  totalSeconds: number;
  source: HoursSource;
}

export interface IExternalHoursDailyRepository {
  addHours(workDate: string, secondsToAdd: number): Promise<void>;
  getByDateRange(fromDate: string, toDate: string): Promise<HoursByDateRow[]>;
  getByDate(workDate: string): Promise<DailyHoursRecord | null>;
  setHours(workDate: string, totalSeconds: number, source?: HoursSource): Promise<void>;
  clearTempoSourcedRecords(): Promise<number>;
}

export class ExternalHoursDailyRepository implements IExternalHoursDailyRepository {
  private dataSource: DataSource;

  constructor(dataSource: DataSource = defaultDataSource) {
    this.dataSource = dataSource;
  }

  private get repo() {
    return this.dataSource.getRepository(ExternalHoursDailyEntity);
  }

  async addHours(workDate: string, secondsToAdd: number): Promise<void> {
    const repo = this.repo;
    const existing = await repo.findOne({ where: { workDate } });
    if (existing) {
      existing.totalSeconds = (existing.totalSeconds || 0) + secondsToAdd;
      await repo.save(existing);
    } else {
      await repo.save(repo.create({ workDate, totalSeconds: secondsToAdd, source: 'tempo' }));
    }
  }

  async getByDateRange(fromDate: string, toDate: string): Promise<DailyHoursRecord[]> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e.work_date', 'workDate')
      .addSelect('e.total_seconds', 'totalSeconds')
      .addSelect('e.source', 'source')
      .where('e.work_date >= :fromDate', { fromDate })
      .andWhere('e.work_date <= :toDate', { toDate })
      .orderBy('e.work_date', 'ASC')
      .getRawMany<DailyHoursRecord>();
    return rows;
  }

  async getByDate(workDate: string): Promise<DailyHoursRecord | null> {
    const row = await this.repo.findOne({ where: { workDate } });
    if (!row) {
      return null;
    }
    return {
      workDate: row.workDate,
      totalSeconds: row.totalSeconds,
      source: row.source,
    };
  }

  async setHours(workDate: string, totalSeconds: number, source: HoursSource = 'tempo'): Promise<void> {
    const repo = this.repo;
    const existing = await repo.findOne({ where: { workDate } });
    if (existing) {
      existing.totalSeconds = totalSeconds;
      existing.source = source;
      await repo.save(existing);
    } else {
      await repo.save(repo.create({ workDate, totalSeconds, source }));
    }
  }

  /**
   * Clear all records that were wrongly saved with source='tempo'.
   * These should have been saved in tempo_hours_daily instead.
   * Returns the number of records deleted.
   */
  async clearTempoSourcedRecords(): Promise<number> {
    const result = await this.repo.delete({ source: 'tempo' });
    return result.affected ?? 0;
  }
}
