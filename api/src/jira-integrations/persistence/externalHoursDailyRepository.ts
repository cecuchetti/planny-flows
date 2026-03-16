import { DataSource } from 'typeorm';
import { dataSource as defaultDataSource } from 'database/createConnection';
import ExternalHoursDailyEntity from 'entities/ExternalHoursDaily';

export interface HoursByDateRow {
  workDate: string;
  totalSeconds: number;
}

export interface IExternalHoursDailyRepository {
  addHours(workDate: string, secondsToAdd: number): Promise<void>;
  getByDateRange(fromDate: string, toDate: string): Promise<HoursByDateRow[]>;
  setHours(workDate: string, totalSeconds: number): Promise<void>;
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
      await repo.save(repo.create({ workDate, totalSeconds: secondsToAdd }));
    }
  }

  async getByDateRange(fromDate: string, toDate: string): Promise<HoursByDateRow[]> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e.work_date', 'workDate')
      .addSelect('e.total_seconds', 'totalSeconds')
      .where('e.work_date >= :fromDate', { fromDate })
      .andWhere('e.work_date <= :toDate', { toDate })
      .orderBy('e.work_date', 'ASC')
      .getRawMany<HoursByDateRow>();
    return rows;
  }

  async setHours(workDate: string, totalSeconds: number): Promise<void> {
    const repo = this.repo;
    const existing = await repo.findOne({ where: { workDate } });
    if (existing) {
      existing.totalSeconds = totalSeconds;
      await repo.save(existing);
    } else {
      await repo.save(repo.create({ workDate, totalSeconds }));
    }
  }
}
