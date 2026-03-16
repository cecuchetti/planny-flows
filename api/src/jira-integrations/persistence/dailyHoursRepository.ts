import { DataSource } from 'typeorm';
import { dataSource as defaultDataSource } from 'database/createConnection';
import DailyHoursEntity from 'entities/DailyHours';

export type HoursSource = 'tempo' | 'manual';

export interface DailyHoursRow {
  id: number;
  workDate: string;
  hoursLogged: number;
  source: HoursSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDailyHoursRepository {
  getByDate(workDate: string): Promise<DailyHoursRow | null>;
  getWeekHours(startDate: string, endDate: string): Promise<DailyHoursRow[]>;
  upsert(workDate: string, hours: number, source: HoursSource): Promise<DailyHoursRow>;
  delete(workDate: string): Promise<boolean>;
}

export class DailyHoursRepository implements IDailyHoursRepository {
  private dataSource: DataSource;

  constructor(dataSource: DataSource = defaultDataSource) {
    this.dataSource = dataSource;
  }

  private get repo() {
    return this.dataSource.getRepository(DailyHoursEntity);
  }

  /**
   * Get hours for a specific date
   */
  async getByDate(workDate: string): Promise<DailyHoursRow | null> {
    const entity = await this.repo.findOne({ where: { workDate } });
    return entity ? this.toRow(entity) : null;
  }

  /**
   * Get hours for a date range (e.g., Monday to Sunday)
   */
  async getWeekHours(startDate: string, endDate: string): Promise<DailyHoursRow[]> {
    const entities = await this.repo
      .createQueryBuilder('d')
      .where('d.work_date >= :startDate', { startDate })
      .andWhere('d.work_date <= :endDate', { endDate })
      .orderBy('d.work_date', 'ASC')
      .getMany();
    return entities.map((e) => this.toRow(e));
  }

  /**
   * Insert or update hours for a date
   */
  async upsert(workDate: string, hours: number, source: HoursSource): Promise<DailyHoursRow> {
    const repo = this.repo;
    const existing = await repo.findOne({ where: { workDate } });

    if (existing) {
      existing.hoursLogged = hours;
      existing.source = source;
      const saved = await repo.save(existing);
      return this.toRow(saved);
    } else {
      const entity = repo.create({ workDate, hoursLogged: hours, source });
      const saved = await repo.save(entity);
      return this.toRow(saved);
    }
  }

  /**
   * Delete hours for a date
   * @returns true if a record was deleted, false otherwise
   */
  async delete(workDate: string): Promise<boolean> {
    const result = await this.repo.delete({ workDate });
    return (result.affected ?? 0) > 0;
  }

  private toRow(entity: DailyHoursEntity): DailyHoursRow {
    return {
      id: entity.id,
      workDate: entity.workDate,
      hoursLogged: parseFloat(String(entity.hoursLogged)),
      source: entity.source as HoursSource,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
