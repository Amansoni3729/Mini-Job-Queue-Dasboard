import {
  JobStatus,
  ALLOWED_TRANSITIONS,
  isValidTransition,
  getAllowedSourceStatuses,
} from '../src/jobs/job-status.enum';

describe('Job State Machine Specification', () => {
  describe('Allowed transitions', () => {
    it('allows pending -> running', () => {
      expect(isValidTransition(JobStatus.PENDING, JobStatus.RUNNING)).toBe(true);
    });

    it('allows running -> completed', () => {
      expect(isValidTransition(JobStatus.RUNNING, JobStatus.COMPLETED)).toBe(true);
    });

    it('allows running -> failed', () => {
      expect(isValidTransition(JobStatus.RUNNING, JobStatus.FAILED)).toBe(true);
    });
  });

  describe('Forbidden transitions', () => {
    it('forbids pending -> completed and pending -> failed', () => {
      expect(isValidTransition(JobStatus.PENDING, JobStatus.COMPLETED)).toBe(false);
      expect(isValidTransition(JobStatus.PENDING, JobStatus.FAILED)).toBe(false);
    });

    it('forbids running -> pending', () => {
      expect(isValidTransition(JobStatus.RUNNING, JobStatus.PENDING)).toBe(false);
    });

    it('enforces completed as terminal state (no transitions allowed)', () => {
      expect(ALLOWED_TRANSITIONS[JobStatus.COMPLETED]).toHaveLength(0);
      expect(isValidTransition(JobStatus.COMPLETED, JobStatus.PENDING)).toBe(false);
      expect(isValidTransition(JobStatus.COMPLETED, JobStatus.RUNNING)).toBe(false);
      expect(isValidTransition(JobStatus.COMPLETED, JobStatus.FAILED)).toBe(false);
    });

    it('enforces failed as terminal state (no transitions allowed)', () => {
      expect(ALLOWED_TRANSITIONS[JobStatus.FAILED]).toHaveLength(0);
      expect(isValidTransition(JobStatus.FAILED, JobStatus.PENDING)).toBe(false);
      expect(isValidTransition(JobStatus.FAILED, JobStatus.RUNNING)).toBe(false);
      expect(isValidTransition(JobStatus.FAILED, JobStatus.COMPLETED)).toBe(false);
    });
  });

  describe('getAllowedSourceStatuses', () => {
    it('returns [pending] for running target', () => {
      expect(getAllowedSourceStatuses(JobStatus.RUNNING)).toEqual([JobStatus.PENDING]);
    });

    it('returns [running] for completed target', () => {
      expect(getAllowedSourceStatuses(JobStatus.COMPLETED)).toEqual([JobStatus.RUNNING]);
    });

    it('returns [running] for failed target', () => {
      expect(getAllowedSourceStatuses(JobStatus.FAILED)).toEqual([JobStatus.RUNNING]);
    });

    it('returns empty array for pending target (jobs cannot be transitioned into pending)', () => {
      expect(getAllowedSourceStatuses(JobStatus.PENDING)).toEqual([]);
    });
  });
});
