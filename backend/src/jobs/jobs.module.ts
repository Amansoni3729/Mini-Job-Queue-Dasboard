import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './job.entity';
import { JobEvent } from './job-event.entity';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { TransactionRunner } from '../common/transaction.runner';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobEvent])],
  controllers: [JobsController],
  providers: [JobsService, TransactionRunner],
  exports: [JobsService],
})
export class JobsModule {}
