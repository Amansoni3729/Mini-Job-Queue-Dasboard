import React from 'react';
import { JobCounts, FilterStatus } from '../types';

interface StatusCountsBarProps {
  counts: JobCounts;
  activeFilter: FilterStatus;
  onFilterChange: (filter: FilterStatus) => void;
}

export const StatusCountsBar: React.FC<StatusCountsBarProps> = ({
  counts,
  activeFilter,
  onFilterChange,
}) => {
  const totalCount =
    counts.pending + counts.running + counts.completed + counts.failed;

  const filters: Array<{ id: FilterStatus; label: string; count: number }> = [
    { id: 'all', label: 'All jobs', count: totalCount },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'running', label: 'Running', count: counts.running },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'failed', label: 'Failed', count: counts.failed },
  ];

  return (
    <div className="status-counts-bar" role="group" aria-label="Job status filters">
      {filters.map(({ id, label, count }) => {
        const isActive = activeFilter === id;
        return (
          <button
            key={id}
            type="button"
            className={`status-count-button status-count-${id} ${isActive ? 'is-active' : ''}`}
            onClick={() => onFilterChange(id)}
            aria-pressed={isActive}
          >
            <span className="count-number">{count}</span>
            <span className="count-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
