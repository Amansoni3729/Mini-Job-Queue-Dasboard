import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  Equals,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { JobStatus } from '../job-status.enum';

export class CreateJobDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(3, { message: 'Title must be at least 3 characters.' })
  @MaxLength(120, { message: 'Title must not exceed 120 characters.' })
  title: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Type must be at least 2 characters.' })
  @MaxLength(60, { message: 'Type must not exceed 60 characters.' })
  @Matches(/^[a-zA-Z0-9-_ ]+$/, {
    message: 'Type may only contain letters, numbers, spaces, hyphens, and underscores.',
  })
  type: string;

  @IsOptional()
  @Equals(JobStatus.PENDING, {
    message: 'Initial status may only be "pending".',
  })
  status?: JobStatus;
}
