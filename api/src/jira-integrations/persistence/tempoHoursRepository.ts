import { DataSource } from 'typeorm';
import { dataSource as defaultDataSource } from 'database/createConnection';
import TempoHoursDailyEntity from 'entities/TempoHoursDaily';

export interface TempoHoursRecord {
  workDate: string;
  hoursLogged: number;
  confirmedAt: Date | null;
}

export interface ITempoHoursRepository {
  getByDate(workDate: string): Promise<TempoHoursRecord | null>;
  getByDateRange(fromDate: string, toDate: string): Promise<TempoHoursRecord[]>;
  save(workDate: string, hoursLogged: number): Promise<void>;
  clearAll(): Promise<void>;
}

/**
 * Repository for Tempo hours (VIS-2) tracking.
 * Separate from ExternalHoursDailyRepository which is for external Jira tickets.
 */
export class TempoHoursRepository implements ITempoHoursRepository {
  private dataSource: DataSource;

  constructor(dataSource: DataSource = defaultDataSource) {
    this.dataSource = dataSource;
  }

  private get repo() {
    return this.dataSource.getRepository(TempoHoursDailyEntity);
  }

  async getByDate(workDate: string): Promise<TempoHoursRecord | null> {
    const row = await this.repo.findOne({ where: { workDate } });
    if (!row) {
      return null;
    }
    return {
      workDate: row.workDate,
      hoursLogged: parseFloat(String(row.hoursLogged)),
      confirmedAt: row.confirmedAt,
    };
  }

  async getByDateRange(fromDate: string, toDate: string): Promise<TempoHoursRecord[]> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .where('t.work_date >= :fromDate', { fromDate })
      .andWhere('t.work_date <= :toDate', { toDate })
      .orderBy('t.work_date', 'ASC')
      .getMany();

    return rows.map((row) => ({
      workDate: row.workDate,
      hoursLogged: parseFloat(String(row.hoursLogged)),
      confirmedAt: row.confirmedAt,
    }));
  }

  /**
   * Save Tempo hours for a date.
   * Should only be called when hours >= 8 (complete workday).
   */
  async save(workDate: string, hoursLogged: number): Promise<void> {
    const repo = this.repo;
    const existing = await repo.findOne({ where: { workDate } });
    const now = new Date();

    if (existing) {
      existing.hoursLogged = hoursLogged;
      existing.confirmedAt = now;
      await repo.save(existing);
    } else {
      await repo.save(
        repo.create({
          workDate,
          hoursLogged,
          confirmedAt: now,
        }),
      );
    }
  }

  /**
   * Clear all records - used for cleanup/migration purposes.
   */
  async clearAll(): Promise<void> {
    await this.repo.clear();
  }
}
