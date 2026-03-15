import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import WorklogSubmissionResult from './WorklogSubmissionResult';

export type WorklogTarget = 'TEMPO' | 'JIRA' | 'BOTH';
export type SubmissionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'PARTIAL_SUCCESS';

@Entity('worklog_submission')
export default class WorklogSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'request_id', type: 'varchar', unique: true })
  requestId: string;

  @Column({ type: 'varchar', length: 10 })
  target: WorklogTarget;

  @Column({ name: 'tempo_issue_key', type: 'varchar' })
  tempoIssueKey: string;

  @Column({ name: 'external_issue_key', type: 'varchar', nullable: true })
  externalIssueKey: string | null;

  @Column({ name: 'work_date', type: 'varchar', length: 10 })
  workDate: string;

  @Column({ name: 'started_at', type: 'varchar', nullable: true })
  startedAt: string | null;

  @Column({ name: 'time_spent_seconds', type: 'integer' })
  timeSpentSeconds: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'overall_status', type: 'varchar', length: 20 })
  overallStatus: SubmissionStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => WorklogSubmissionResult, (result) => result.submission)
  results: WorklogSubmissionResult[];
}
