# Performance Optimization Notes

This document tracks N+1 query optimizations and recommended database indexes for the MyWorkDay application.

## N+1 Query Optimizations (Completed)

### Overview
Four critical endpoints have been optimized to reduce query count from O(N+1) to O(1) or O(2-4) fixed queries:

| Endpoint | Before | After | Method |
|----------|--------|-------|--------|
| `GET /api/v1/super/tenants-detail` | 2N+1 queries | 3 queries | `getTenantsWithDetails()` with batch fetches |
| `GET /api/v1/projects?includeCounts=true` | N+1 queries | 2 queries | `getOpenTaskCountsByProjectIds()` with GROUP BY |
| `GET /api/v1/projects/analytics/summary` | N+1 queries | 3 queries | `getTasksByProjectIds()` batch fetch |
| `GET /api/v1/projects/forecast/summary` | N+1 queries | 3-4 queries | `getTasksByProjectIds()` + parallel time entries |

### New Storage Methods

Located in `server/storage.ts`:

```typescript
// Batch count open tasks for multiple projects (GROUP BY optimization)
getOpenTaskCountsByProjectIds(projectIds: string[]): Promise<Map<string, number>>

// Batch fetch lightweight tasks for multiple projects (IN query)
getTasksByProjectIds(projectIds: string[]): Promise<Map<string, LightweightTask[]>>

// Fetch all tenants with settings and user counts (3 queries instead of 2N+1)
getTenantsWithDetails(): Promise<TenantWithDetails[]>
```

### Query Debug Utility

Enable query count tracking in development with:

```bash
QUERY_DEBUG=true npm run dev
```

Usage in code:
```typescript
import { createQueryTracker } from './lib/queryDebug';

const tracker = createQueryTracker("endpoint-name");
tracker.track("fetch-projects");
tracker.track("fetch-tasks");
tracker.log(); // Outputs: [QUERY_DEBUG] endpoint-name: 2 queries in Xms
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

1. **Time entries batch fetch**: Similar pattern could be applied to time entry aggregations
2. **Activity logs**: Could benefit from batch fetches in activity timeline
3. **Comments/attachments**: Candidate for batch loading in task drawer
4. **User lookups**: Frequently accessed, could use in-memory caching layer
