import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
const request = (supertest as any).default || supertest;
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { JobStatus } from '../src/jobs/job-status.enum';

describe('Job Concurrency and State Machine (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Scenario 1: Create job starts as pending with version 1 and initial audit event', async () => {
    const res = await request(app.getHttpServer())
      .post('/jobs')
      .send({ title: 'Send welcome email', type: 'email' })
      .expect(201);

    const job = res.body;
    expect(job.id).toBeDefined();
    expect(job.title).toBe('Send welcome email');
    expect(job.type).toBe('email');
    expect(job.status).toBe(JobStatus.PENDING);
    expect(job.version).toBe(1);

    // Verify audit event
    const eventsRes = await request(app.getHttpServer())
      .get(`/jobs/${job.id}/events`)
      .expect(200);

    expect(eventsRes.body).toHaveLength(1);
    expect(eventsRes.body[0].fromStatus).toBeNull();
    expect(eventsRes.body[0].toStatus).toBe(JobStatus.PENDING);
  });

  it('Scenario 2: Rejects forbidden initial status attempt during creation', async () => {
    // Attempt to pass status: 'completed' during creation
    const res = await request(app.getHttpServer())
      .post('/jobs')
      .send({ title: 'Malicious Job', type: 'email', status: 'completed' })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toContain('Initial status may only be "pending"');
  });

  it('Scenario 3: Race Condition - Multiple concurrent requests trying to start the same job', async () => {
    // 1. Create a job in pending status
    const createRes = await request(app.getHttpServer())
      .post('/jobs')
      .send({ title: 'Process monthly payroll', type: 'report' })
      .expect(201);

    const jobId = createRes.body.id;
    const initialVersion = createRes.body.version;

    // 2. Fire 10 concurrent requests trying to transition from pending -> running
    const concurrentRequests = 10;
    const promises = Array.from({ length: concurrentRequests }, () =>
      request(app.getHttpServer())
        .patch(`/jobs/${jobId}/status`)
        .send({ status: JobStatus.RUNNING, expectedVersion: initialVersion }),
    );

    const results = await Promise.all(promises);

    const successfulResponses = results.filter((r) => r.status === 200);
    const conflictResponses = results.filter((r) => r.status === 409);

    // Exactly one request must win
    expect(successfulResponses).toHaveLength(1);
    // All competing requests must receive 409 Conflict
    expect(conflictResponses).toHaveLength(concurrentRequests - 1);

    // Winner updated the version to 2
    expect(successfulResponses[0].body.status).toBe(JobStatus.RUNNING);
    expect(successfulResponses[0].body.version).toBe(2);

    // Verify audit event trail: exactly 2 events (null -> pending, pending -> running)
    const eventsRes = await request(app.getHttpServer())
      .get(`/jobs/${jobId}/events`)
      .expect(200);

    expect(eventsRes.body).toHaveLength(2);
    expect(eventsRes.body[0].toStatus).toBe(JobStatus.PENDING);
    expect(eventsRes.body[1].fromStatus).toBe(JobStatus.PENDING);
    expect(eventsRes.body[1].toStatus).toBe(JobStatus.RUNNING);
  });

  it('Scenario 4: Optimistic locking conflict with stale expectedVersion', async () => {
    // Create a job
    const createRes = await request(app.getHttpServer())
      .post('/jobs')
      .send({ title: 'Export users CSV', type: 'export' })
      .expect(201);

    const jobId = createRes.body.id;

    // Start the job (version increments to 2)
    await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .send({ status: JobStatus.RUNNING, expectedVersion: 1 })
      .expect(200);

    // Stale client sends expectedVersion: 1 to complete the job
    const conflictRes = await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .send({ status: JobStatus.COMPLETED, expectedVersion: 1 })
      .expect(409);

    expect(conflictRes.body.statusCode).toBe(409);
    expect(conflictRes.body.message).toContain('Job was modified by someone else');
  });

  it('Scenario 5: Enforces terminal states (cannot transition completed -> running)', async () => {
    // Create a job
    const createRes = await request(app.getHttpServer())
      .post('/jobs')
      .send({ title: 'Database cleanup task', type: 'cleanup' })
      .expect(201);

    const jobId = createRes.body.id;

    // pending -> running
    const startRes = await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .send({ status: JobStatus.RUNNING, expectedVersion: 1 })
      .expect(200);

    // running -> completed
    await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .send({ status: JobStatus.COMPLETED, expectedVersion: startRes.body.version })
      .expect(200);

    // Attempt completed -> running (Forbidden!)
    const invalidRes = await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .send({ status: JobStatus.RUNNING })
      .expect(409);

    expect(invalidRes.body.statusCode).toBe(409);
    expect(invalidRes.body.message).toContain('terminal state');
  });

  it('Scenario 6: Live counts calculated correctly by database', async () => {
    const countsRes = await request(app.getHttpServer())
      .get('/jobs/stats/counts')
      .expect(200);

    expect(countsRes.body).toHaveProperty(JobStatus.PENDING);
    expect(countsRes.body).toHaveProperty(JobStatus.RUNNING);
    expect(countsRes.body).toHaveProperty(JobStatus.COMPLETED);
    expect(countsRes.body).toHaveProperty(JobStatus.FAILED);
    expect(typeof countsRes.body.pending).toBe('number');
    expect(typeof countsRes.body.running).toBe('number');
    expect(typeof countsRes.body.completed).toBe('number');
    expect(typeof countsRes.body.failed).toBe('number');
  });
});
