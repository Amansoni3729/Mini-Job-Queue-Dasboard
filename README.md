# Mini Job Queue Dashboard

A production-quality full-stack **Job Queue Dashboard** engineered with a strict state machine, database-level atomic concurrency protection, optimistic locking, an append-only audit trail, and responsive UI.

---

## 1. Tech Stack

- **Frontend**: React 18, TypeScript, Vite, React DOM, Native Fetch API, Custom Hooks (`useJobs`), Plain CSS.
- **Backend**: NestJS, TypeORM, TypeScript, Express, `class-validator`, `class-transformer`.
- **Database**:
  - **Local Development**: SQLite (zero-setup via `sqlite3`).
  - **Production**: PostgreSQL (`pg` driver, configured via `DATABASE_URL`).
- **Deployment**: Render blueprint (`render.yaml`) for backend + PostgreSQL, Vercel configuration (`vercel.json`) for frontend.

---

## 2. Project Architecture

```text
job-queue-dashboard/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── JobTable.tsx           # Responsive table & mobile stacked card layout with actions & audit history
│   │   │   ├── JobForm.tsx            # Form to enqueue jobs with client validation
│   │   │   └── StatusCountsBar.tsx    # 5-button filter bar with live DB counts
│   │   ├── api/
│   │   │   └── client.ts              # Native fetch wrapper with ApiError & 409 conflict detection
│   │   ├── App.tsx                    # Header, filter bar, form, notices, and job table
│   │   ├── main.tsx                   # React root entry
│   │   ├── styles.css                 # Clean internal ops aesthetic, mobile responsive (<=720px)
│   │   ├── types.ts                   # Domain and API TypeScript types
│   │   ├── useJobs.ts                 # Custom hook with 5s polling, stale response protection, busyIds
│   │   └── vite-env.d.ts              # Vite environment typings
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vercel.json
│   └── .env.example
│
├── backend/
│   ├── src/
│   │   ├── jobs/
│   │   │   ├── dto/
│   │   │   │   ├── create-job.dto.ts        # class-validator DTO for title and type
│   │   │   │   ├── query-jobs.dto.ts        # Filter query parameter validation
│   │   │   │   └── update-job-status.dto.ts # Status and expectedVersion DTO
│   │   │   ├── job.entity.ts                # TypeORM Job entity with UUID, VersionColumn, indexes
│   │   │   ├── job-event.entity.ts          # Audit entity (jobId, fromStatus, toStatus, createdAt)
│   │   │   ├── job-status.enum.ts           # Status enum and state machine transition rules
│   │   │   ├── jobs.controller.ts           # REST API endpoints
│   │   │   ├── jobs.service.ts              # Business logic, atomic UPDATE, diagnosis, transactions
│   │   │   └── jobs.module.ts
│   │   ├── common/
│   │   │   ├── transaction.runner.ts        # SQLite serialization queue vs Postgres concurrency
│   │   │   ├── health.controller.ts         # GET /health
│   │   │   └── all-exceptions.filter.ts     # Global unified JSON error handler
│   │   ├── app.module.ts                    # Dynamic database configuration
│   │   └── main.ts                          # CORS, ValidationPipe, Filter bootstrap
│   ├── test/
│   │   ├── state-machine.spec.ts            # Unit tests for state machine transitions
│   │   └── concurrency.e2e-spec.ts          # E2E integration tests (atomic race condition testing)
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── .env.example
│
├── render.yaml                              # Render deployment blueprint
└── README.md
```

---

## 3. Local Setup Instructions

### Prerequisites
- Node.js 18+ (Tested on Node.js 20 & 24)
- npm 9+

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev
```

Backend will start on: **`http://localhost:3000`**
SQLite database (`jobs.sqlite`) will automatically be created in `backend/`.

Run tests:
```bash
npm test          # Unit tests (state machine transition matrix)
npm run test:e2e  # Integration tests (10 concurrent PATCH requests race condition)
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend will start on: **`http://localhost:5173`**

---

## 4. State Machine Specification

The job lifecycle strictly enforces the following state transitions:

```text
    pending
       |
       v
    running
      / \
     v   v
completed failed
```

### Transition Rules

| Source Status | Target Status | Allowed? | Rationale |
|---|---|---|---|
| `pending` | `running` | **Allowed** | Worker picks up and begins processing the job. |
| `running` | `completed` | **Allowed** | Worker finishes processing successfully. |
| `running` | `failed` | **Allowed** | Worker encounters an unrecoverable failure. |
| `pending` | `completed` | **Forbidden** | Job cannot skip processing state. |
| `pending` | `failed` | **Forbidden** | Job cannot fail without running first. |
| `running` | `pending` | **Forbidden** | Running jobs cannot be reverted to pending. |
| `completed`| *any* | **Forbidden** | Terminal state. Once complete, job is immutable. |
| `failed` | *any* | **Forbidden** | Terminal state. Failed jobs cannot transition further. |

A new job **always** starts as `pending` with `version: 1`.

---

## 5. Concurrency Correctness & Optimistic Locking

### Why `Read -> Check -> Write` is Unsafe

A naive implementation typically looks like:

```typescript
// UNSAFE ANTI-PATTERN:
const job = await repository.findOne({ where: { id } });
if (job.status !== 'pending') {
  throw new ConflictException(...);
}
await repository.update(id, { status: 'running' });
```

When two concurrent requests $R_1$ and $R_2$ arrive at the same time:
1. $R_1$ reads status `pending`.
2. $R_2$ reads status `pending` before $R_1$ writes.
3. Both pass the `if (job.status !== 'pending')` check.
4. Both write status `running`.
5. Two workers process the same job, corrupting audit trails and duplicating external work.

### The Solution: Atomic Conditional SQL `UPDATE`

This project delegates transition enforcement entirely to the **database layer** inside a single atomic SQL statement using TypeORM's `QueryBuilder`:

```sql
UPDATE jobs
SET
    status = :targetStatus,
    version = version + 1
WHERE
    id = :id
    AND status IN (:...allowedSourceStatuses)
    AND version = :expectedVersion;
```

Because relational databases execute row updates with row-level locks:
- **`affected === 1`**: The request won the race. The state was valid, and the row was updated atomically. The audit event is inserted in the same transaction.
- **`affected === 0`**: The request lost the race, or the state transition was invalid, or the `expectedVersion` was stale.

### Failure Diagnosis

When `affected === 0`, the service re-reads the row to return a precise, informative HTTP 409 Conflict:

1. **Job not found**: Returns `404 Not Found`.
2. **Target status already set**: Returns `409 Conflict` (*"Job is already 'running'. Someone else probably updated it first."*).
3. **Stale version**: Returns `409 Conflict` (*"Job was modified by someone else (expected version 1, found 2). Please refresh."*).
4. **Invalid transition**: Returns `409 Conflict` (*"Invalid transition 'completed' -> 'running'. Allowed from 'completed': none (terminal state)"*).

### SQLite Driver Workaround (`TransactionRunner`)

SQLite is a single-connection file database. When multiple concurrent transactions execute simultaneously against SQLite, SQLite throws `SQLITE_BUSY: database is locked`.

To solve this driver-level quirk without compromising the database concurrency model:
- When using SQLite: `TransactionRunner` queues transaction execution through an in-memory promise queue.
- When using PostgreSQL: `TransactionRunner` executes transactions completely concurrently.
- **Note**: The actual concurrency correctness mechanism remains the conditional `UPDATE WHERE ...`, not the in-memory queue.

---

## 6. Audit Trail (`job_events`)

Every job has an append-only audit trail recorded in the `job_events` table:

```text
id        (UUID, primary key)
jobId     (UUID, indexed)
fromStatus (varchar, nullable)
toStatus   (varchar)
createdAt (timestamp)
```

- When a job is created: `fromStatus = null`, `toStatus = pending`.
- When a job transitions: `fromStatus = pending`, `toStatus = running`.
- When a job completes: `fromStatus = running`, `toStatus = completed`.

### Transactional Guarantee

The audit event is inserted **inside the same database transaction** as the atomic conditional `UPDATE`. If either operation fails, the entire transaction rolls back. The audit log is guaranteed never to disagree with the actual job status.

---

## 7. REST API Documentation

### Standard Error Response

All non-2xx responses adhere to a unified JSON format:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Invalid transition \"completed\" -> \"running\". Allowed from \"completed\": none (terminal state)",
  "path": "/jobs/b8a2e5d9-4b6e-4171-a477-d0774643fba8/status",
  "timestamp": "2026-09-17T01:30:00.000Z"
}
```

---

### `POST /jobs`
Creates a pending job.

**Request:**
```http
POST /jobs
Content-Type: application/json

{
  "title": "Send weekly newsletter",
  "type": "email"
}
```

**Response (201 Created):**
```json
{
  "id": "c1f3d8a5-1234-4567-89ab-cdef01234567",
  "title": "Send weekly newsletter",
  "type": "email",
  "status": "pending",
  "version": 1,
  "createdAt": "2026-09-17T01:00:00.000Z",
  "updatedAt": "2026-09-17T01:00:00.000Z"
}
```

---

### `GET /jobs`
Lists all jobs ordered by `createdAt DESC`.

**Query Parameters:**
- `status` (optional): `pending`, `running`, `completed`, `failed`. Invalid values return 400.

**Request:**
```http
GET /jobs?status=running
```

**Response (200 OK):**
```json
[
  {
    "id": "c1f3d8a5-1234-4567-89ab-cdef01234567",
    "title": "Send weekly newsletter",
    "type": "email",
    "status": "running",
    "version": 2,
    "createdAt": "2026-09-17T01:00:00.000Z",
    "updatedAt": "2026-09-17T01:02:00.000Z"
  }
]
```

---

### `GET /jobs/stats/counts`
Returns live counts for all 4 statuses calculated directly in the database.

**Response (200 OK):**
```json
{
  "pending": 5,
  "running": 2,
  "completed": 10,
  "failed": 1
}
```

---

### `GET /jobs/:id`
Retrieves a single job by UUID.

**Response (200 OK):**
```json
{
  "id": "c1f3d8a5-1234-4567-89ab-cdef01234567",
  "title": "Send weekly newsletter",
  "type": "email",
  "status": "pending",
  "version": 1,
  "createdAt": "2026-09-17T01:00:00.000Z",
  "updatedAt": "2026-09-17T01:00:00.000Z"
}
```

---

### `GET /jobs/:id/events`
Returns the append-only audit trail ordered by `createdAt ASC`.

**Response (200 OK):**
```json
[
  {
    "id": "e001...",
    "jobId": "c1f3d8a5-1234-4567-89ab-cdef01234567",
    "fromStatus": null,
    "toStatus": "pending",
    "createdAt": "2026-09-17T01:00:00.000Z"
  },
  {
    "id": "e002...",
    "jobId": "c1f3d8a5-1234-4567-89ab-cdef01234567",
    "fromStatus": "pending",
    "toStatus": "running",
    "createdAt": "2026-09-17T01:02:00.000Z"
  }
]
```

---

### `PATCH /jobs/:id/status`
Updates job status using atomic conditional UPDATE with optimistic locking.

**Request:**
```http
PATCH /jobs/c1f3d8a5-1234-4567-89ab-cdef01234567/status
Content-Type: application/json

{
  "status": "running",
  "expectedVersion": 1
}
```

**Response (200 OK):**
```json
{
  "id": "c1f3d8a5-1234-4567-89ab-cdef01234567",
  "title": "Send weekly newsletter",
  "type": "email",
  "status": "running",
  "version": 2,
  "createdAt": "2026-09-17T01:00:00.000Z",
  "updatedAt": "2026-09-17T01:02:00.000Z"
}
```

---

### `DELETE /jobs/:id`
Deletes job and cascades audit events.

**Response:** `204 No Content`

---

### `GET /health`
Liveness check.

**Response (200 OK):**
```json
{
  "status": "ok",
  "uptime": 124.52
}
```

---

## 8. Frontend Engineering Highlights

- **Custom `useJobs` Hook**: Manages `jobs`, `counts`, `loading`, `error`, `notice`, `busyIds`, `filter`. Components remain purely presentational.
- **Stale Response Protection**: Uses a request sequence counter with `useRef`. If a user quickly switches from "Pending" to "Running", older responses never overwrite the latest view.
- **5-Second Quiet Polling**: Updates data quietly in the background without flickering spinners or interrupting user interaction.
- **Per-Row Loading State**: Only the mutating row has reduced opacity and disabled buttons. The rest of the dashboard remains fully interactive.
- **Conflict UX**: A 409 Conflict is treated as a normal stale-data state, displaying a calm amber notice with the server's explanation and quietly refreshing the dataset.
- **Responsive Layout**: Transforms from a 5-column table into clean stacked cards on viewports `<= 720px`. Status filters collapse from 5 columns into 2 columns.
- **Accessible**: Semantic HTML (`<main>`, `<section>`, `<table>`, `<button>`), visible `:focus-visible` keyboard focus indicators, `aria-pressed`, `role="alert"`, and `role="status"`.

---

## 9. Architectural Trade-offs

1. **5-Second Polling vs. WebSockets**:
   For an internal operations dashboard of this scale, HTTP polling avoids WebSocket connection management, reconnection logic, heartbeat ping/pongs, and sticky-session load-balancer complexity.
2. **React State + Custom Hook vs. Redux / Zustand**:
   The domain revolves around one primary aggregate resource (`Job`). A focused custom hook with `useRef` stale-response protection provides zero bundle overhead and clear data ownership.
3. **SQLite Locally vs. PostgreSQL in Production**:
   SQLite enables instant local development without Docker or local database services. TypeORM abstractly maps the same entities and queries to PostgreSQL when deployed on Render.
4. **No Authentication**:
   Authentication is omitted intentionally to keep focus entirely on the core engineering challenge: state machine integrity and atomic concurrency correctness.
