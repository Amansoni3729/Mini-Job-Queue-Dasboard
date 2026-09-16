import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JobStatus } from '../job-status.enum';

export class UpdateJobStatusDto {
  @IsEnum(JobStatus, {
    message: 'Invalid status. Allowed values: pending, running, completed, failed.',
  })
  status: JobStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'expectedVersion must be an integer.' })
  @Min(1, { message: 'expectedVersion must be at least 1.' })
  expectedVersion?: number;
}
