export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type FilterStatus = 'all' | JobStatus;

export interface Job {
  id: string;
  title: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface JobEvent {
  id: string;
  jobId: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  createdAt: string;
}

export interface JobCounts {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

export interface CreateJobPayload {
  title: string;
  type: string;
  status?: JobStatus;
}

export interface UpdateJobStatusPayload {
  status: JobStatus;
  expectedVersion?: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
}
