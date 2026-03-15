import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import WorklogSubmission from './WorklogSubmission';

export type TargetSystem = 'TEMPO' | 'JIRA';
export type TargetResultStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

@Entity('worklog_submission_result')
export default class WorklogSubmissionResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'submission_id' })
  submissionId: number;

  @ManyToOne(() => WorklogSubmission, (sub) => sub.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission: WorklogSubmission;

  @Column({ name: 'target_system', type: 'varchar', length: 10 })
  targetSystem: TargetSystem;

  @Column({ type: 'varchar', length: 10 })
  status: TargetResultStatus;

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ name: 'request_payload', type: 'text' })
  requestPayload: string;

  @Column({ name: 'response_payload', type: 'text', nullable: true })
  responsePayload: string | null;

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
