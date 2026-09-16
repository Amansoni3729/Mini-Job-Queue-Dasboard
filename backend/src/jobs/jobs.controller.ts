import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { QueryJobsDto } from './dto/query-jobs.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * POST /jobs
   * Creates a new pending job.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createJob(@Body() dto: CreateJobDto) {
    return this.jobsService.createJob(dto);
  }

  /**
   * GET /jobs
   * Retrieves all jobs, ordered by newest first, with optional status filter.
   */
  @Get()
  async getJobs(@Query() query: QueryJobsDto) {
    return this.jobsService.getJobs(query);
  }

  /**
   * GET /jobs/stats/counts
   * Returns live counts for all 4 statuses directly calculated in database.
   * Defined before /:id route so 'stats' is not treated as a UUID.
   */
  @Get('stats/counts')
  async getCounts() {
    return this.jobsService.getCounts();
  }

  /**
   * GET /jobs/:id
   * Retrieves a single job by UUID.
   */
  @Get(':id')
  async getJobById(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }

  /**
   * GET /jobs/:id/events
   * Retrieves the audit event trail for a job, ordered by createdAt ASC.
   */
  @Get(':id/events')
  async getJobEvents(@Param('id') id: string) {
    return this.jobsService.getJobEvents(id);
  }

  /**
   * PATCH /jobs/:id/status
   * Transitions job status using atomic conditional UPDATE with optimistic locking.
   */
  @Patch(':id/status')
  async updateJobStatus(
    @Param('id') id: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    return this.jobsService.updateJobStatus(id, dto);
  }

  /**
   * DELETE /jobs/:id
   * Deletes a job and its associated audit events.
   * Returns 204 No Content.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteJob(@Param('id') id: string) {
    await this.jobsService.deleteJob(id);
  }
}
