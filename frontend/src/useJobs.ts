import { useState, useEffect, useRef, useCallback } from 'react';
import { Job, JobCounts, FilterStatus, JobStatus, CreateJobPayload } from './types';
import { api, ApiError } from './api/client';

export interface Notice {
  title: string;
  message: string;
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<JobCounts>({
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  });
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Stale response protection
  const requestIdRef = useRef<number>(0);
  const activeFilterRef = useRef<FilterStatus>(filter);
  activeFilterRef.current = filter;

  const markBusy = (id: string) => {
    setBusyIds((prev) => new Set(prev).add(id));
  };

  const unmarkBusy = (id: string) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  /**
   * Fetches jobs and counts with stale-response protection.
   * If isSilent is true, does not toggle full-page loading.
   */
  const fetchData = useCallback(
    async (isSilent = false, targetFilter?: FilterStatus) => {
      const currentFilter = targetFilter !== undefined ? targetFilter : activeFilterRef.current;
      const currentRequestId = ++requestIdRef.current;

      if (!isSilent) {
        setRefreshing(true);
      }

      try {
        const [fetchedJobs, fetchedCounts] = await Promise.all([
          api.getJobs(currentFilter),
          api.getJobCounts(),
        ]);

        // Stale response check: discard if another request was initiated later
        if (currentRequestId === requestIdRef.current) {
          setJobs(fetchedJobs);
          setCounts(fetchedCounts);
          setError(null);
        }
      } catch (err: any) {
        if (currentRequestId === requestIdRef.current) {
          if (!isSilent) {
            setError(err.message || 'Failed to fetch jobs.');
          }
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  // Initial load and filter change trigger
  useEffect(() => {
    fetchData(jobs.length > 0, filter);
  }, [filter, fetchData]);

  // 5-second polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true, activeFilterRef.current);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const refresh = useCallback(async () => {
    await fetchData(false, activeFilterRef.current);
  }, [fetchData]);

  const changeFilter = useCallback(
    (newFilter: FilterStatus) => {
      if (newFilter !== filter) {
        setFilter(newFilter);
      }
    },
    [filter],
  );

  const createJob = useCallback(
    async (payload: CreateJobPayload) => {
      setError(null);
      try {
        await api.createJob(payload);
        await fetchData(true, activeFilterRef.current);
      } catch (err: any) {
        setError(err.message || 'Failed to create job.');
        throw err;
      }
    },
    [fetchData],
  );

  const changeStatus = useCallback(
    async (id: string, targetStatus: JobStatus, expectedVersion?: number) => {
      markBusy(id);
      setError(null);
      try {
        await api.updateJobStatus(id, {
          status: targetStatus,
          expectedVersion,
        });
        await fetchData(true, activeFilterRef.current);
      } catch (err: any) {
        if (err instanceof ApiError && err.isConflict) {
          // Normal optimistic concurrency conflict -> show amber notice & refresh
          setNotice({
            title: 'Out of date.',
            message: err.message,
          });
          await fetchData(true, activeFilterRef.current);
        } else {
          // Actual server error
          setError(err.message || 'Failed to update job status.');
        }
      } finally {
        unmarkBusy(id);
      }
    },
    [fetchData],
  );

  const deleteJob = useCallback(
    async (id: string) => {
      markBusy(id);
      setError(null);
      try {
        await api.deleteJob(id);
        await fetchData(true, activeFilterRef.current);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 404) {
          // Job already gone
          setNotice({
            title: 'Out of date.',
            message: 'Job was already deleted.',
          });
          await fetchData(true, activeFilterRef.current);
        } else {
          setError(err.message || 'Failed to delete job.');
        }
      } finally {
        unmarkBusy(id);
      }
    },
    [fetchData],
  );

  return {
    jobs,
    counts,
    filter,
    loading,
    refreshing,
    error,
    notice,
    busyIds,
    changeFilter,
    dismissNotice,
    refresh,
    createJob,
    changeStatus,
    deleteJob,
  };
}
