import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Stores total seconds logged (externally) per calendar date.
 * Updated when user creates a JIRA/BOTH worklog and can be edited from the UI.
 */
@Entity('external_hours_daily')
export default class ExternalHoursDaily {
  /** Date in YYYY-MM-DD format */
  @PrimaryColumn({ name: 'work_date', type: 'varchar', length: 10 })
  workDate: string;

  @Column({ name: 'total_seconds', type: 'integer', default: 0 })
  totalSeconds: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
