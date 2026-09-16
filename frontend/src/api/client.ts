import {
  Job,
  JobCounts,
  JobEvent,
  CreateJobPayload,
  UpdateJobStatusPayload,
  FilterStatus,
  ApiErrorResponse,
} from '../types';

export class ApiError extends Error {
  readonly status: number;
  readonly isConflict: boolean;
  readonly data?: ApiErrorResponse;

  constructor(message: string, status: number, data?: ApiErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isConflict = status === 409;
    this.data = data;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    throw new ApiError(
      'Unable to connect to the server. Please check your network connection.',
      0,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    if (data && typeof data.message === 'string') {
      errorMessage = data.message;
    } else if (data && typeof data.error === 'string') {
      errorMessage = data.error;
    }

    throw new ApiError(errorMessage, response.status, data);
  }

  return data as T;
}

export const api = {
  getJobs: (statusFilter?: FilterStatus): Promise<Job[]> => {
    const query =
      statusFilter && statusFilter !== 'all'
        ? `?status=${encodeURIComponent(statusFilter)}`
        : '';
    return request<Job[]>(`/jobs${query}`);
  },

  getJobCounts: (): Promise<JobCounts> => {
    return request<JobCounts>('/jobs/stats/counts');
  },

  getJobById: (id: string): Promise<Job> => {
    return request<Job>(`/jobs/${encodeURIComponent(id)}`);
  },

  getJobEvents: (id: string): Promise<JobEvent[]> => {
    return request<JobEvent[]>(`/jobs/${encodeURIComponent(id)}/events`);
  },

  createJob: (payload: CreateJobPayload): Promise<Job> => {
    return request<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateJobStatus: (id: string, payload: UpdateJobStatusPayload): Promise<Job> => {
    return request<Job>(`/jobs/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteJob: (id: string): Promise<void> => {
    return request<void>(`/jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
