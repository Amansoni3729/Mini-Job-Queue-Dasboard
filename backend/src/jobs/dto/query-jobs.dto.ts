import { IsOptional, IsEnum } from 'class-validator';
import { JobStatus } from '../job-status.enum';

export class QueryJobsDto {
  @IsOptional()
  @IsEnum(JobStatus, {
    message: 'Invalid status filter. Allowed values: pending, running, completed, failed.',
  })
  status?: JobStatus;
}
