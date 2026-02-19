# Background Job Queue

## Overview

MyWorkDay uses a lightweight, DB-backed background job queue for long-running operations. Jobs are persisted in the `background_jobs` PostgreSQL table and executed in-process by a polling worker. This avoids the operational overhead of external queue systems (Redis, RabbitMQ) while providing reliable execution, progress tracking, and status polling.

## Architecture

```
Client  ──POST /api/v1/jobs──▶  Route Handler
                                    │
                                    ▼
                             enqueueJob()
                                    │
                              ┌─────▼──────┐
                              │ background  │
                              │   _jobs     │  (PostgreSQL)
                              │   table     │
                              └─────┬──────┘
                                    │ poll every 3s
                              ┌─────▼──────┐
                              │ Job Worker  │  (in-process)
                              │  (queue.ts) │
                              └─────┬──────┘
                                    │
                              ┌─────▼──────┐
                              │  Handler    │  (handlers.ts)
                              │  Registry   │
                              └────────────┘
```

## Job Types

| Type | Concurrency | Description |
|------|-------------|-------------|
| `asana_import` | 1 | Import projects from Asana workspace |
| `csv_import` | 1 | CSV file import (clients, tasks, etc.) |
| `bulk_tasks_import` | 2 | Bulk task creation from structured data |
| `ai_generation` | 3 | AI-powered task breakdown, project plans, descriptions |

## Database Schema

Table: `background_jobs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar (UUID) | Primary key |
| `tenant_id` | varchar | Tenant scope (FK → tenants) |
| `created_by_user_id` | varchar | User who created the job (FK → users) |
| `type` | text | Job type (see table above) |
| `status` | text | pending / running / completed / failed / cancelled |
| `payload` | jsonb | Job-specific input data |
| `result` | jsonb | Job output (set on completion) |
| `error` | text | Error message (set on failure) |
| `progress` | jsonb | `{ current, total, phase }` for tracking |
| `attempts` | integer | Number of execution attempts |
| `max_attempts` | integer | Maximum retry count |
| `locked_at` | timestamp | When worker claimed the job |
| `started_at` | timestamp | When execution began |
| `completed_at` | timestamp | When job finished (success or failure) |
| `created_at` | timestamp | Row creation time |
| `updated_at` | timestamp | Last modification time |

Indexes: `tenant_id`, `status`, `(type, status)`, `created_at`

## API Endpoints

All endpoints require authentication and tenant context.

### List Jobs
```
GET /api/v1/jobs?type=asana_import&status=pending,running&limit=20
```

### Get Job Status
```
GET /api/v1/jobs/:jobId
```

Response:
```json
{
  "id": "uuid",
  "type": "asana_import",
  "status": "running",
  "progress": { "current": 3, "total": 10, "phase": "Importing project 3/10..." },
  "result": null,
  "error": null,
  "createdAt": "2026-01-15T10:00:00Z",
  "startedAt": "2026-01-15T10:00:01Z"
}
```

### Cancel Job
```
POST /api/v1/jobs/:jobId/cancel
```
Only cancels jobs in `pending` status.

### Queue Stats (Super Admin only)
```
GET /api/v1/jobs-queue/stats
```

## Usage

### Enqueuing a Job

```typescript
import { enqueueJob } from "../jobs";

const jobId = await enqueueJob({
  tenantId: user.tenantId,
  userId: user.id,
  type: "bulk_tasks_import",
  payload: { projectId, rows, options },
});

res.json({ jobId, status: "pending" });
```

### Writing a Handler

```typescript
import { registerHandler, type JobContext } from "./queue";

async function myHandler(ctx: JobContext): Promise<void> {
  await ctx.updateProgress({ current: 0, total: 100, phase: "Starting..." });

  for (let i = 0; i < 100; i++) {
    if (await ctx.isCancelled()) return;
    // ... do work ...
    await ctx.updateProgress({ current: i + 1, total: 100, phase: "Processing..." });
  }

  await ctx.setResult({ processed: 100 });
}

registerHandler("my_job_type", myHandler, 2); // concurrency = 2
```

## Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | `backgroundJobs` table definition, status/type enums |
| `server/jobs/queue.ts` | Core queue: enqueue, claim, execute, poll, start/stop |
| `server/jobs/handlers.ts` | Job handler implementations + registration |
| `server/jobs/jobs.router.ts` | REST API for job status polling |
| `server/jobs/index.ts` | Public exports |

## Design Decisions

1. **DB-backed over in-memory**: Jobs survive server restarts. The `background_jobs` table serves as both queue and audit log.

2. **In-process execution**: No separate worker process needed. The polling loop runs inside the Express server process via `setInterval`.

3. **Per-type concurrency limits**: Prevents resource exhaustion. Asana imports (API-heavy) limited to 1; AI calls (stateless) allow 3 concurrent.

4. **Stale lock recovery**: Jobs locked for >30 minutes are automatically reclaimed, handling cases where the server crashes mid-execution.

5. **Graceful shutdown**: The job queue is stopped before HTTP server close, allowing in-flight jobs to complete or be reclaimed on next startup.

## Lifecycle

```
PENDING ──claim──▶ RUNNING ──success──▶ COMPLETED
                      │
                      ├──failure──▶ FAILED (or back to PENDING if retries remain)
                      │
                      └──cancel───▶ CANCELLED

PENDING ──cancel──▶ CANCELLED
```
