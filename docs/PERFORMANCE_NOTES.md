# Performance Optimization Notes

This document tracks N+1 query optimizations and recommended database indexes for the MyWorkDay application.

## N+1 Query Optimizations — Phase 1 (Completed)

### Overview
Four critical endpoints have been optimized to reduce query count from O(N+1) to O(1) or O(2-4) fixed queries:

| Endpoint | Before | After | Method |
|----------|--------|-------|--------|
| `GET /api/v1/super/tenants-detail` | 2N+1 queries | 3 queries | `getTenantsWithDetails()` with batch fetches |
| `GET /api/v1/projects?includeCounts=true` | N+1 queries | 2 queries | `getOpenTaskCountsByProjectIds()` with GROUP BY |
| `GET /api/v1/projects/analytics/summary` | N+1 queries | 3 queries | `getTasksByProjectIds()` batch fetch |
| `GET /api/v1/projects/forecast/summary` | N+1 queries | 3-4 queries | `getTasksByProjectIds()` + parallel time entries |

### New Storage Methods (Phase 1)

Located in `server/storage.ts`:

```typescript
getOpenTaskCountsByProjectIds(projectIds: string[]): Promise<Map<string, number>>
getTasksByProjectIds(projectIds: string[]): Promise<Map<string, LightweightTask[]>>
getTenantsWithDetails(): Promise<TenantWithDetails[]>
```

## N+1 Query Optimizations — Phase 2 (Completed)

### Overview
Three additional domains have been optimized to eliminate per-row lookups:

| Endpoint / Method | Before | After | Method |
|---|---|---|---|
| `getTimeEntriesByWorkspace()` | 4N+1 queries (user/client/project/task per row) | 5 queries (1 fetch + 4 parallel batch) | `batchEnrichEntries()` with `inArray` + `Promise.all` |
| `getTimeEntriesByTenant()` | 4N+1 queries | 5 queries | Same `batchEnrichEntries()` |
| `getCommentsByTask()` | N+1 queries (user per row) | 2 queries | `batchEnrichCommentsWithUsers()` with `inArray` |
| `getCommentsBySubtask()` | N+1 queries | 2 queries | Same batch method |
| `getTaskAttachmentsByTask()` | N+1 queries (user per row) | 2 queries | Batch `inArray` on uploader IDs |

### Affected Endpoints
- `GET /api/v1/time-entries` — time entry list
- `GET /api/v1/time-entries/my` — personal time entries
- `GET /api/v1/time-entries/my/stats` — personal stats
- `GET /api/v1/time-entries/report/summary` — report aggregation
- `GET /api/v1/time-entries/export/csv` — CSV export
- `GET /api/v1/tasks/:taskId/comments` — task comments
- `GET /api/v1/subtasks/:subtaskId/comments` — subtask comments
- `GET /api/v1/projects/:projectId/tasks/:taskId/attachments` — task attachments

### Implementation Details

**Time Entries** (`server/storage/timeTracking.repo.ts`):
- Extracted `batchEnrichEntries()` helper that collects unique user/client/project/task IDs from all entries, fetches them in 4 parallel `inArray` queries, then maps results back.
- Both `getTimeEntriesByWorkspace` and `getTimeEntriesByTenant` use the same helper.
- Active timer lookups (single-row) left unchanged since they're not N+1.

**Comments** (`server/storage.ts`):
- Added `batchEnrichCommentsWithUsers()` private method that collects unique `userId` values from all comments, fetches via single `inArray` query, maps back.
- Used by both `getCommentsByTask` and `getCommentsBySubtask`.

**Attachments** (`server/storage.ts`):
- `getTaskAttachmentsByTask` now collects unique `uploadedByUserId` values, fetches all uploaders in one `inArray` query, maps back.

### Already-Optimized (No Changes Needed)
- `getProjectActivity()` — already uses batch user fetch with `inArray` pattern
- `enrichCommentsWithAttachments()` — already batches attachment lookups via `getTaskAttachmentsByIds`
- `getActivityLogByEntity()` — returns raw data, no enrichment

### Query Debug Utility

Enable query count tracking and endpoint timing in development with either:

```bash
QUERY_DEBUG=true npm run dev
# or
API_PERF_LOG=1 npm run dev
```

Usage in code:
```typescript
import { createQueryTracker, perfLog } from './lib/queryDebug';

const tracker = createQueryTracker("endpoint-name");
tracker.track("fetch-projects");
tracker.track("fetch-tasks");
tracker.log(); // Outputs: [API_PERF] endpoint-name: 2 queries in Xms

perfLog("GET /time-entries", `${count} entries in ${elapsed}ms (batched)`);
```

## Database Indexes — IMPLEMENTED

All recommended indexes have been implemented. See `docs/performance/db-indexes.md` for full details, rationale, and affected endpoints.

**Migration:** `migrations/0027_needy_sway.sql` (applied 2026-02-19)

### New Indexes Added (Sprint)

| Index | Table | Columns |
|---|---|---|
| `tasks_project_id_idx` | tasks | `(project_id)` |
| `tasks_project_status_idx` | tasks | `(project_id, status)` |
| `tasks_status_priority_idx` | tasks | `(status, priority)` |
| `task_assignees_task_id_idx` | task_assignees | `(task_id)` |
| `projects_workspace_id_idx` | projects | `(workspace_id)` |
| `projects_tenant_workspace_idx` | projects | `(tenant_id, workspace_id)` |
| `projects_status_idx` | projects | `(status)` — synced to schema (already in DB) |

### Pre-Existing Indexes (Were Already Present)

All tenant-scoping, FK, and time-range indexes listed in the original Priority 1-3 recommendations were already present in the database and schema. See `docs/performance/db-indexes.md` § "Pre-Existing Indexes" for the full cross-reference.

### Verification

```bash
npx tsx scripts/verify-indexes.ts
```

## API Contract Guarantee

All optimizations maintain **zero API contract changes**:
- Response shapes remain identical
- Query parameters unchanged
- Tenancy scoping behavior preserved
- No new pagination requirements introduced

## Testing

Run existing smoke tests to verify no regressions:
```bash
npm test -- --grep "smoke|tenancy|workload"
```

## Future Optimization Candidates

1. **User lookups**: Frequently accessed across many domains, could use in-memory caching layer (TTL-based)
2. **Task drawer**: Multiple sequential queries for task + subtasks + assignees + comments + attachments could be parallelized at the route level
3. **Chat messages**: Message list enrichment could benefit from similar batch patterns if message volumes grow
