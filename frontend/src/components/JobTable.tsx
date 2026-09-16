import React, { useState } from 'react';
import { Job, JobStatus, FilterStatus, JobEvent } from '../types';
import { api } from '../api/client';

interface JobTableProps {
  jobs: Job[];
  busyIds: Set<string>;
  activeFilter: FilterStatus;
  onStatusChange: (id: string, targetStatus: JobStatus, expectedVersion: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return dateStr;
  }
}

export const JobTable: React.FC<JobTableProps> = ({
  jobs,
  busyIds,
  activeFilter,
  onStatusChange,
  onDelete,
}) => {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [eventsMap, setEventsMap] = useState<Record<string, JobEvent[]>>({});
  const [loadingEvents, setLoadingEvents] = useState<string | null>(null);

  const toggleAuditTrail = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }

    setExpandedJobId(jobId);
    if (!eventsMap[jobId]) {
      setLoadingEvents(jobId);
      try {
        const events = await api.getJobEvents(jobId);
        setEventsMap((prev) => ({ ...prev, [jobId]: events }));
      } catch {
        // Handled silently
      } finally {
        setLoadingEvents(null);
      }
    }
  };

  if (jobs.length === 0) {
    let emptyMessage = 'No jobs yet. Add one above.';
    if (activeFilter !== 'all') {
      emptyMessage = `No ${activeFilter} jobs.`;
    }

    return (
      <div className="empty-state" role="status">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-responsive-container">
      <table className="jobs-table" aria-label="Jobs List">
        <thead>
          <tr>
            <th scope="col" className="th-job">Job</th>
            <th scope="col" className="th-type">Type</th>
            <th scope="col" className="th-status">Status</th>
            <th scope="col" className="th-created">Created</th>
            <th scope="col" className="th-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const isBusy = busyIds.has(job.id);
            const isExpanded = expandedJobId === job.id;
            const jobEvents = eventsMap[job.id] || [];

            return (
              <React.Fragment key={job.id}>
                <tr className={`job-row ${isBusy ? 'is-busy' : ''}`}>
                  <td className="td-job" data-label="Job">
                    <div className="job-title-container">
                      <span className="job-title">{job.title}</span>
                      <button
                        type="button"
                        className="btn-history-toggle"
                        onClick={() => toggleAuditTrail(job.id)}
                        aria-expanded={isExpanded}
                        aria-label={`View audit trail for ${job.title}`}
                      >
                        {isExpanded ? 'Hide history' : 'Audit history'}
                      </button>
                    </div>
                  </td>

                  <td className="td-type" data-label="Type">
                    <span className="job-type-pill">{job.type}</span>
                  </td>

                  <td className="td-status" data-label="Status">
                    <span className={`status-badge status-badge-${job.status}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {job.status}
                    </span>
                  </td>

                  <td className="td-created" data-label="Created">
                    <time dateTime={job.createdAt} title={job.createdAt}>
                      {formatDate(job.createdAt)}
                    </time>
                  </td>

                  <td className="td-actions" data-label="Actions">
                    <div className="action-buttons">
                      {job.status === 'pending' && (
                        <button
                          type="button"
                          className="btn btn-action btn-start"
                          disabled={isBusy}
                          onClick={() => onStatusChange(job.id, 'running', job.version)}
                        >
                          Start
                        </button>
                      )}

                      {job.status === 'running' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-action btn-complete"
                            disabled={isBusy}
                            onClick={() => onStatusChange(job.id, 'completed', job.version)}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            className="btn btn-action btn-fail"
                            disabled={isBusy}
                            onClick={() => onStatusChange(job.id, 'failed', job.version)}
                          >
                            Mark failed
                          </button>
                        </>
                      )}

                      {(job.status === 'completed' || job.status === 'failed') && (
                        <span className="final-state-label">final state</span>
                      )}

                      <button
                        type="button"
                        className="btn btn-action btn-delete"
                        disabled={isBusy}
                        onClick={() => onDelete(job.id)}
                        aria-label={`Delete ${job.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr className="audit-trail-row">
                    <td colSpan={5} className="audit-trail-cell">
                      <div className="audit-trail-content" role="region" aria-label="Audit history">
                        <div className="audit-trail-header">
                          <h4>Audit Trail (Job ID: <code>{job.id}</code>, Version: {job.version})</h4>
                        </div>
                        {loadingEvents === job.id ? (
                          <p className="audit-loading">Loading events…</p>
                        ) : jobEvents.length === 0 ? (
                          <p className="audit-empty">No events recorded.</p>
                        ) : (
                          <ul className="audit-timeline">
                            {jobEvents.map((evt) => (
                              <li key={evt.id} className="audit-timeline-item">
                                <span className="audit-timeline-badge">
                                  {evt.fromStatus ? (
                                    <>
                                      <span className={`status-text-${evt.fromStatus}`}>{evt.fromStatus}</span>
                                      {' → '}
                                      <span className={`status-text-${evt.toStatus}`}>{evt.toStatus}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="status-text-initial">created</span>
                                      {' → '}
                                      <span className={`status-text-${evt.toStatus}`}>{evt.toStatus}</span>
                                    </>
                                  )}
                                </span>
                                <time className="audit-timeline-time" dateTime={evt.createdAt}>
                                  {formatDate(evt.createdAt)}
                                </time>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
