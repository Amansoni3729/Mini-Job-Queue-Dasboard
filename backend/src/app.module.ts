import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Job } from './jobs/job.entity';
import { JobEvent } from './jobs/job-event.entity';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        if (databaseUrl && databaseUrl.trim().length > 0) {
          return {
            type: 'postgres',
            url: databaseUrl.trim(),
            entities: [Job, JobEvent],
            synchronize: true,
            ssl:
              process.env.NODE_ENV === 'production'
                ? { rejectUnauthorized: false }
                : false,
          };
        }

        return {
          type: 'sqlite',
          database: 'jobs.sqlite',
          entities: [Job, JobEvent],
          synchronize: true,
        };
      },
    }),
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
