import React from 'react';
import { useJobs } from './useJobs';
import { StatusCountsBar } from './components/StatusCountsBar';
import { JobForm } from './components/JobForm';
import { JobTable } from './components/JobTable';

export const App: React.FC = () => {
  const {
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
  } = useJobs();

  return (
    <div className="app-container">
      {/* 20. HEADER */}
      <header className="app-header">
        <h1 className="header-title">Job queue</h1>
        <button
          type="button"
          className="btn btn-refresh"
          disabled={refreshing || loading}
          onClick={refresh}
          aria-label="Refresh job queue"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <main className="app-main">
        {/* 21. STATUS COUNTS BAR */}
        <StatusCountsBar
          counts={counts}
          activeFilter={filter}
          onFilterChange={changeFilter}
        />

        {/* 22. CREATE JOB FORM */}
        <JobForm onSubmit={createJob} />

        {/* 31. CONFLICT NOTICE (AMBER) */}
        {notice && (
          <div className="banner banner-notice" role="status" aria-live="polite">
            <div className="banner-content">
              <span className="banner-badge">Out of date.</span>
              <p className="banner-message">{notice.message}</p>
            </div>
            <button
              type="button"
              className="btn btn-notice-dismiss"
              onClick={dismissNotice}
              aria-label="Dismiss notice"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 32. API ERROR NOTICE (RED) */}
        {error && (
          <div className="banner banner-error" role="alert" aria-live="assertive">
            <div className="banner-content">
              <span className="banner-badge">API error.</span>
              <p className="banner-message">{error}</p>
            </div>
            <button
              type="button"
              className="btn btn-error-retry"
              onClick={refresh}
              aria-label="Retry loading jobs"
            >
              Try again
            </button>
          </div>
        )}

        {/* 33. INITIAL LOADING STATE & JOB TABLE */}
        {loading && jobs.length === 0 ? (
          <div className="initial-loading-state" role="status">
            <p>Loading jobs…</p>
          </div>
        ) : (
          <section className="job-table-section" aria-label="Jobs Table">
            <JobTable
              jobs={jobs}
              busyIds={busyIds}
              activeFilter={filter}
              onStatusChange={changeStatus}
              onDelete={deleteJob}
            />
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
