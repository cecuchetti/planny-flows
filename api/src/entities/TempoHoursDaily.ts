import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Stores Tempo hours logged for VIS-2 per calendar date.
 * This is separate from external_hours_daily which is for external Jira tickets.
 * Only saved when hours >= 8 (complete workday).
 */
@Entity('tempo_hours_daily')
export default class TempoHoursDaily {
  /** Date in YYYY-MM-DD format */
  @PrimaryColumn({ name: 'work_date', type: 'varchar', length: 10 })
  workDate: string;

  /** Hours logged from Tempo API */
  @Column({ name: 'hours_logged', type: 'decimal', precision: 6, scale: 2, default: 0 })
  hoursLogged: number;

  /** Timestamp when the hours were confirmed as complete (>= 8 hours) */
  @Column({ name: 'confirmed_at', type: 'datetime', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
