import React, { useState } from 'react';
import { CreateJobPayload } from '../types';

interface JobFormProps {
  onSubmit: (payload: CreateJobPayload) => Promise<void>;
}

const JOB_TYPES = ['email', 'report', 'export', 'cleanup', 'sync'] as const;

export const JobForm: React.FC<JobFormProps> = ({ onSubmit }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('email');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < 3) {
      setValidationError('Title must be at least 3 characters.');
      return;
    }

    setValidationError(null);
    setSubmitting(true);

    try {
      await onSubmit({
        title: trimmedTitle,
        type,
      });
      setTitle('');
    } catch {
      // Error is handled in useJobs and displayed globally
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="job-form-section" aria-labelledby="queue-job-title">
      <h2 id="queue-job-title" className="section-title">
        Queue a job
      </h2>

      <form className="job-form" onSubmit={handleSubmit}>
        <div className="form-fields">
          <div className="form-group form-group-title">
            <label htmlFor="job-title" className="form-label">
              Title:
            </label>
            <input
              id="job-title"
              type="text"
              className={`form-input ${validationError ? 'has-error' : ''}`}
              placeholder="Send weekly digest"
              maxLength={120}
              value={title}
              disabled={submitting}
              onChange={(e) => {
                setTitle(e.target.value);
                if (validationError && e.target.value.trim().length >= 3) {
                  setValidationError(null);
                }
              }}
              required
            />
          </div>

          <div className="form-group form-group-type">
            <label htmlFor="job-type" className="form-label">
              Type:
            </label>
            <div className="select-wrapper">
              <select
                id="job-type"
                className="form-select"
                value={type}
                disabled={submitting}
                onChange={(e) => setType(e.target.value)}
              >
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary btn-add-job"
              disabled={submitting}
            >
              {submitting ? 'Adding…' : 'Add job'}
            </button>
          </div>
        </div>

        {validationError && (
          <div className="form-validation-error" role="alert">
            {validationError}
          </div>
        )}
      </form>
    </section>
  );
};
