# SQL-First Aggregation Strategy

Guidelines and audit results for migrating N+1 aggregation endpoints to single-query SQL patterns.

> Cross-reference: [`PERFORMANCE_NOTES.md`](./PERFORMANCE_NOTES.md) for batch storage methods and index recommendations. [`sprint-optimization-guide.md`](./sprint-optimization-guide.md) for the full sprint performance guide.

---

## Strategy

### Pattern to Follow

When an endpoint needs to aggregate data across multiple entities (e.g., count tasks per user, sum hours per project), use a single SQL query with `GROUP BY`, `COUNT`, `CASE WHEN`, and `FILTER` clauses instead of fetching entities in a loop and reducing in JavaScript.

**Before (N+1 anti-pattern):**
```typescript
const users = await storage.getUsersByTenant(tenantId);
const results = await Promise.all(
  users.map(async (user) => {
    const tasks = await storage.getTasksByUser(user.id); // 1 query per user
    return {
      userId: user.id,
      openTasks: tasks.filter(t => t.status !== "done").length,
      overdueTasks: tasks.filter(t => t.dueDate < today).length,
    };
  })
);
```

**After (SQL-first):**
```typescript
const rows = await dbRows(sql`
  SELECT
    u.id AS user_id,
    COUNT(DISTINCT CASE WHEN t.status != 'done' THEN t.id END)::int AS open_tasks,
    COUNT(DISTINCT CASE
      WHEN t.status != 'done' AND t.due_date < CURRENT_DATE THEN t.id
    END)::int AS overdue_tasks
  FROM users u
  LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
  LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
  WHERE u.tenant_id = ${tenantId}
  GROUP BY u.id
`);
```

### When to Use SQL-First

- The endpoint returns aggregate counts, sums, or rates (not full entity records)
- The aggregation loops over a parent entity and queries children per-parent
- The result set is a flat list of aggregated rows, not deeply nested relation trees

### When JS Aggregation Is Appropriate

- Business-logic scoring models (health index, performance tiers) that use complex normalization functions
- Small fixed-size datasets where the overhead is negligible
- Cases where the aggregation requires in-memory state machines or multi-pass algorithms

---

## Audit Results

### Already SQL-First (No Changes Needed)

| Surface | File | Notes |
|---------|------|-------|
| Time Reports v2 | `server/http/domains/reports-v2-time.router.ts` | All 4 endpoints use raw SQL with GROUP BY |
| Workload Reports v2 | `server/http/domains/reports-v2-workload.router.ts` | team, user detail, capacity, risk — all SQL-first |
| Client Health Index | `server/reports/health/calculateClientHealth.ts` | Single SQL query with complex CASE WHEN; JS scoring is appropriate |
| Employee Performance Index | `server/reports/performance/calculateEmployeePerformance.ts` | Single SQL query; JS scoring model is appropriate |
| Forecasting (Capacity Overload) | `server/reports/forecasting/snapshotService.ts` | Multiple SQL queries with GROUP BY; JS prediction logic is appropriate |
| Forecasting (Deadline Risk) | `server/reports/forecasting/snapshotService.ts` | SQL aggregation + JS risk scoring |
| Forecasting (Client Risk Trend) | `server/reports/forecasting/snapshotService.ts` | SQL aggregation + JS trend computation |
| PM Portfolio Aggregator | `server/reports/pmPortfolioAggregator.ts` | 5 parallel SQL queries with GROUP BY; JS assembly is appropriate |
| Project Analytics Summary | `server/http/domains/projects.router.ts` | Uses `getTasksByProjectIds()` batch fetch |

### Migrated in This Sprint

| Surface | File | Before | After |
|---------|------|--------|-------|
| `/workload/tasks-by-employee` | `workload-reports.router.ts` | N+1: fetch all users, then `getTasksByUser()` per user, filter/count in JS | Single SQL: `JOIN users → task_assignees → tasks`, `COUNT CASE WHEN` for all metrics, `GROUP BY user` |
| `/workload/summary` | `workload-reports.router.ts` | Loop over projects, `getTasksByProject()` per project, count in JS | 2 parallel queries: task aggregation with `COUNT CASE WHEN`, entity counts via subselects |
| `/workload/by-status` | `workload-reports.router.ts` | Loop over projects, `getTasksByProject()` per project, accumulate status counts in JS | Single SQL: `GROUP BY status` on tasks joined to projects |
| `/workload/by-priority` | `workload-reports.router.ts` | Loop over projects, `getTasksByProject()` per project, filter done + accumulate priority counts in JS | Single SQL: `GROUP BY priority` on open tasks joined to projects |
| `/workload/unassigned` | `workload-reports.router.ts` | Nested project/task loop, check assignees array per task | Single SQL: `NOT EXISTS (SELECT 1 FROM task_assignees)` + batch relation hydration (7 parallel queries) |
| `/workload/employee/:userId/tasks` | `workload-reports.router.ts` | `getTasksByUser()` + filter in JS + `getProject()` per task for project name | Single SQL for tasks + batch relation hydration (assignees, watchers, tags, subtasks, childTasks, sections, projects via 7 parallel queries) |

### Migration Candidates (Future)

| Surface | File | Pattern | Priority |
|---------|------|---------|----------|
| Activity timeline | `server/storage.ts` | Per-entity activity log fetches | Low |
| Comments/attachments batch | `server/storage.ts` | Per-task relation fetches in drawers | Low |

---

## Implementation Notes

### Helper Functions

All SQL-first report routers use the same `dbRows<T>()` and `firstRow<T>()` helpers for consistent result handling across Drizzle's different return shapes:

```typescript
async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}
```

### Tenant Scoping

All SQL queries must include tenant scoping on every joined table:
```sql
LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
```

### Date Comparisons

Use `::date` casts for date-only comparisons to avoid timezone issues:
```sql
t.due_date::date < CURRENT_DATE  -- overdue
t.due_date::date = CURRENT_DATE  -- due today
```

### Workspace vs Tenant Scoping

The original workload endpoints had branching logic using `getCurrentWorkspaceId()` (which was hard-coded to return `"demo-workspace-id"`) to call `getProjectsByWorkspace()` or `getProjectsByTenant()`. The migrated SQL queries scope exclusively by `tenant_id`, which is the correct and consistent behavior since workspace scoping was never truly functional. This is an intentional simplification, not a regression.

### API Contract

All migrations maintain zero API contract changes:
- Response shapes remain identical
- Query parameters unchanged
- Auth (admin-only) and tenant scoping behavior preserved
- Workspace scoping simplified to tenant-level (see note above)
