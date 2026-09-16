import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { Job } from './job.entity';
import { JobEvent } from './job-event.entity';
import {
  JobStatus,
  ALLOWED_TRANSITIONS,
  getAllowedSourceStatuses,
} from './job-status.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { QueryJobsDto } from './dto/query-jobs.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { TransactionRunner } from '../common/transaction.runner';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobEvent)
    private readonly jobEventRepository: Repository<JobEvent>,
    private readonly transactionRunner: TransactionRunner,
  ) {}

  private validateUuid(id: string): void {
    if (!isUUID(id)) {
      throw new BadRequestException(`Invalid UUID: "${id}". Must be a valid UUID.`);
    }
  }

  /**
   * Creates a new job.
   * A new job ALWAYS starts as 'pending' with version 1.
   * An initial audit event (null -> pending) is created in the same database transaction.
   */
  async createJob(dto: CreateJobDto): Promise<Job> {
    return this.transactionRunner.run(async (manager) => {
      // Always enforce pending status regardless of input
      const job = manager.create(Job, {
        title: dto.title.trim(),
        type: dto.type.trim(),
        status: JobStatus.PENDING,
      });

      const savedJob = await manager.save(job);

      // Audit trail: initial creation event
      const initialEvent = manager.create(JobEvent, {
        jobId: savedJob.id,
        fromStatus: null,
        toStatus: JobStatus.PENDING,
      });
      await manager.save(initialEvent);

      return savedJob;
    });
  }

  /**
   * Retrieves all jobs, ordered by newest first (createdAt DESC).
   * Supports optional status filter.
   */
  async getJobs(query: QueryJobsDto): Promise<Job[]> {
    const qb = this.jobRepository
      .createQueryBuilder('job')
      .orderBy('job.createdAt', 'DESC');

    if (query.status) {
      qb.where('job.status = :status', { status: query.status });
    }

    return qb.getMany();
  }

  /**
   * Returns counts of jobs grouped by status.
   * Calculated directly in the database. Always returns all 4 status keys.
   */
  async getCounts(): Promise<Record<JobStatus, number>> {
    const rawCounts = await this.jobRepository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(job.id)', 'count')
      .groupBy('job.status')
      .getRawMany<{ status: JobStatus; count: string | number }>();

    const counts: Record<JobStatus, number> = {
      [JobStatus.PENDING]: 0,
      [JobStatus.RUNNING]: 0,
      [JobStatus.COMPLETED]: 0,
      [JobStatus.FAILED]: 0,
    };

    for (const row of rawCounts) {
      if (row.status in counts) {
        counts[row.status] = parseInt(String(row.count), 10) || 0;
      }
    }

    return counts;
  }

  /**
   * Retrieves a single job by its UUID.
   */
  async getJobById(id: string): Promise<Job> {
    this.validateUuid(id);

    const job = await this.jobRepository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return job;
  }

  /**
   * Retrieves the audit event trail for a job, ordered by createdAt ASC.
   */
  async getJobEvents(jobId: string): Promise<JobEvent[]> {
    this.validateUuid(jobId);

    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return this.jobEventRepository.find({
      where: { jobId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Updates job status using an atomic database-level conditional UPDATE
   * with optimistic locking.
   *
   * 1. Executes:
   *    UPDATE jobs
   *    SET status = :target, version = version + 1
   *    WHERE id = :id AND status IN (:...allowedFrom) [AND version = :expectedVersion]
   *
   * 2. If affected === 1: insert JobEvent in same transaction and return updated job.
   * 3. If affected === 0: diagnose whether not found, already target, stale version, or invalid transition.
   */
  async updateJobStatus(id: string, dto: UpdateJobStatusDto): Promise<Job> {
    this.validateUuid(id);

    const targetStatus = dto.status;
    const allowedFrom = getAllowedSourceStatuses(targetStatus);

    return this.transactionRunner.run(async (manager) => {
      // Step 1: Atomic conditional update
      const updateQb = manager
        .createQueryBuilder()
        .update(Job)
        .set({
          status: targetStatus,
          version: () => 'version + 1',
        })
        .where('id = :id', { id });

      if (allowedFrom.length > 0) {
        updateQb.andWhere('status IN (:...allowedFrom)', { allowedFrom });
      } else {
        // Target status cannot be transitioned into (e.g. pending is only for creation)
        updateQb.andWhere('1 = 0');
      }

      if (dto.expectedVersion !== undefined) {
        updateQb.andWhere('version = :expectedVersion', {
          expectedVersion: dto.expectedVersion,
        });
      }

      const updateResult = await updateQb.execute();

      // Step 2: If atomic update succeeded (affected === 1)
      if (updateResult.affected === 1) {
        // In our deterministic state machine:
        // running <- pending
        // completed <- running
        // failed <- running
        const fromStatus =
          targetStatus === JobStatus.RUNNING
            ? JobStatus.PENDING
            : JobStatus.RUNNING;

        const event = manager.create(JobEvent, {
          jobId: id,
          fromStatus,
          toStatus: targetStatus,
        });
        await manager.save(event);

        const updatedJob = await manager.findOne(Job, { where: { id } });
        return updatedJob!;
      }

      // Step 3: Atomic update affected 0 rows -> diagnose the failure reason
      const currentJob = await manager.findOne(Job, { where: { id } });

      // Case 1: Job does not exist
      if (!currentJob) {
        throw new NotFoundException(`Job ${id} not found`);
      }

      // Case 2: Job already has target status
      if (currentJob.status === targetStatus) {
        throw new ConflictException(
          `Job is already "${targetStatus}". Someone else probably updated it first.`,
        );
      }

      // Case 3: Optimistic locking conflict (expectedVersion is stale)
      if (
        dto.expectedVersion !== undefined &&
        currentJob.version !== dto.expectedVersion
      ) {
        throw new ConflictException(
          `Job was modified by someone else (expected version ${dto.expectedVersion}, found ${currentJob.version}). Please refresh.`,
        );
      }

      // Case 4: Invalid state machine transition
      const allowedTargets = ALLOWED_TRANSITIONS[currentJob.status];
      if (allowedTargets.length === 0) {
        throw new ConflictException(
          `Invalid transition "${currentJob.status}" -> "${targetStatus}". Allowed from "${currentJob.status}": none (terminal state)`,
        );
      }

      throw new ConflictException(
        `Invalid transition "${currentJob.status}" -> "${targetStatus}". Allowed from "${currentJob.status}": ${allowedTargets.join(', ')}`,
      );
    });
  }

  /**
   * Deletes a job and its associated events within a transaction.
   */
  async deleteJob(id: string): Promise<void> {
    this.validateUuid(id);

    await this.transactionRunner.run(async (manager) => {
      const existing = await manager.findOne(Job, { where: { id } });
      if (!existing) {
        throw new NotFoundException(`Job ${id} not found`);
      }

      // Delete associated audit events first
      await manager.delete(JobEvent, { jobId: id });
      await manager.delete(Job, { id });
    });
  }
}
