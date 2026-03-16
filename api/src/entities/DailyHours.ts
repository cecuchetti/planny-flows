import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Stores daily hours logged for tracking purposes.
 * Used by VIS-2 for tracking daily work hours from various sources.
 */
@Entity('daily_hours')
@Index('IDX_daily_hours_work_date', ['workDate'], { unique: true })
export default class DailyHours {
  @PrimaryGeneratedColumn()
  id: number;

  /** Date in YYYY-MM-DD format */
  @Column({ name: 'work_date', type: 'varchar', length: 10 })
  workDate: string;

  /** Number of hours logged for the day */
  @Column({ name: 'hours_logged', type: 'decimal', precision: 6, scale: 2 })
  hoursLogged: number;

  /** Source of the data: 'tempo' or 'manual' */
  @Column({ type: 'varchar', length: 20 })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
