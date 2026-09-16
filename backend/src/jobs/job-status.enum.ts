export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * State machine transition definitions.
 * Defines the allowed target statuses reachable from any given current status.
 */
export const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.PENDING]: [JobStatus.RUNNING],
  [JobStatus.RUNNING]: [JobStatus.COMPLETED, JobStatus.FAILED],
  [JobStatus.COMPLETED]: [], // terminal
  [JobStatus.FAILED]: [],    // terminal
};

/**
 * Validates whether a state transition from `from` to `to` is permitted by the state machine.
 */
export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Returns list of source statuses from which the given `target` status can be reached.
 * Used for SQL atomic conditional UPDATE: `WHERE status IN (:...allowedFrom)`
 */
export function getAllowedSourceStatuses(target: JobStatus): JobStatus[] {
  const sources: JobStatus[] = [];
  for (const [source, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
    if (targets.includes(target)) {
      sources.push(source as JobStatus);
    }
  }
  return sources;
}
