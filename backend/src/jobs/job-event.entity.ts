import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { JobStatus } from './job-status.enum';

@Entity('job_events')
export class JobEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  jobId: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  fromStatus: JobStatus | null;

  @Column({
    type: 'varchar',
    length: 20,
  })
  toStatus: JobStatus;

  @CreateDateColumn()
  createdAt: Date;
}
