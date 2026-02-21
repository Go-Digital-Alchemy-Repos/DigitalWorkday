# Database Index Sprint

**Applied:** 2026-02-19  
**Migration:** `migrations/0027_needy_sway.sql`

---

## Summary

Added 7 non-destructive btree indexes to the three highest-traffic tables (`tasks`, `task_assignees`, `projects`) to improve list/report responsiveness under load. All indexes use `CREATE INDEX IF NOT EXISTS` for idempotent re-runs.

---

## New Indexes

### tasks

| Index | Columns | Rationale | Impacted Endpoints |
|---|---|---|---|
| `tasks_project_id_idx` | `(project_id)` | Standalone FK index for batch task fetches by project. The existing composite `tasks_project_section_order` starts with `project_id` but also includes `section_id, order_index`, making it suboptimal for simple "all tasks for project" scans. | `GET /api/v1/projects?includeCounts=true`, `GET /api/v1/projects/analytics/summary`, `GET /api/v1/projects/forecast/summary`, `getOpenTaskCountsByProjectIds()`, `getTasksByProjectIds()` |
| `tasks_project_status_idx` | `(project_id, status)` | Composite for filtered batch task queries (e.g., count open tasks per project). Covers the common `WHERE project_id IN (...) AND status != 'done'` pattern. | `getOpenTaskCountsByProjectIds()`, board views with status filtering |
| `tasks_status_priority_idx` | `(status, priority)` | Board views commonly filter/sort by status and priority simultaneously. Covers `WHERE status = ? ORDER BY priority` patterns. | Board view rendering, My Tasks priority grouping |

### task_assignees

| Index | Columns | Rationale | Impacted Endpoints |
|---|---|---|---|
| `task_assignees_task_id_idx` | `(task_id)` | Standalone FK index for "find all assignees for a task" lookups. The existing `task_assignees_unique` on `(task_id, user_id)` covers uniqueness but a dedicated single-column index is more efficient for range scans fetching all assignees. | Task detail drawer, batch assignee resolution, workload reports |

### projects

| Index | Columns | Rationale | Impacted Endpoints |
|---|---|---|---|
| `projects_workspace_id_idx` | `(workspace_id)` | FK index for workspace-scoped project listings. Previously missing — queries filtering by workspace had to seq-scan or rely on the composite `projects_tenant_client_idx`. | `GET /api/v1/projects` (workspace filter), project dashboard |
| `projects_tenant_workspace_idx` | `(tenant_id, workspace_id)` | Composite for the common pattern of listing projects within a tenant's workspace. Covers `WHERE tenant_id = ? AND workspace_id = ?`. | `GET /api/v1/projects` (tenant+workspace filter), forecast calculations |
| `projects_status_idx` | `(status)` | Standalone status filter index. Already existed in the database but was missing from `shared/schema.ts`; now synced. | `GET /api/v1/projects` (status filter), project dashboard |

---

## Pre-Existing Indexes (Already Covered)

The following indexes from `docs/PERFORMANCE_NOTES.md` were already present before this sprint:

| Recommended Index | Existing Coverage |
|---|---|
| `tasks(tenant_id)` | `tasks_tenant_idx` |
| `tasks(tenant_id, project_id)` | `tasks_tenant_project_idx` |
| `tasks(tenant_id, status)` | `tasks_tenant_status_idx` |
| `tasks(due_date)` | `tasks_due_date` |
| `tasks(tenant_id, due_date)` | `tasks_tenant_due_date_idx` |
| `projects(tenant_id)` | `projects_tenant_idx` |
| `projects(tenant_id, status)` | `projects_tenant_status_idx` |
| `users(tenant_id)` | `users_tenant_idx` |
| `time_entries(tenant_id)` | `time_entries_tenant_idx` |
| `time_entries(project_id)` | `time_entries_project_idx` |
| `time_entries(tenant_id, user_id, start_time)` | `time_entries_tenant_user_start_idx` |
| `time_entries(tenant_id, project_id, start_time)` | `time_entries_tenant_project_start_idx` |
| `tenant_settings(tenant_id)` | `tenant_settings_tenant_idx` |
| `task_assignees(task_id, user_id)` | `task_assignees_unique` (unique index) |

---

## Phase 2 — Priority Upgrade (2026-02-21)

**Migration:** `migrations/0040_chubby_wolf_cub.sql`

### time_entries

| Index | Columns | Rationale | Impacted Endpoints |
|---|---|---|---|
| `time_entries_tenant_created_at_idx` | `(tenant_id, created_at)` | Composite for tenant-scoped queries ordering by `created_at DESC`. Covers recent time entry listings, audit views, and report date-range queries filtering by tenant. | `GET /api/v1/time-entries`, time entry reports, CSV exports |

---

## CONCURRENTLY Note

Drizzle-kit's migration runner does not support `CREATE INDEX CONCURRENTLY` because it wraps statements in a transaction (and `CONCURRENTLY` cannot run inside a transaction). For production deployments with large tables under heavy load, consider running the `CREATE INDEX CONCURRENTLY` variants manually outside of Drizzle migrations to avoid table-level locks.

---

## Verification

Run the read-only verification script:

```bash
npx tsx scripts/verify-indexes.ts
```

This prints all indexes for the key tables (`tasks`, `task_assignees`, `projects`, `time_entries`, `comments`) and flags any recommended indexes that may be missing.
