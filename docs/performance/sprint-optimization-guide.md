# Sprint Performance Optimization Guide

Comprehensive guide covering all performance optimizations implemented or planned during the sprint hardening cycle. Each section covers rationale, approach, key files, and acceptance criteria.

> Cross-reference: For N+1 query fixes, batch storage methods, and index recommendations see [`PERFORMANCE_NOTES.md`](./PERFORMANCE_NOTES.md).

---

## Table of Contents

1. [Clients Initial-Load Slimming](#1-clients-initial-load-slimming)
2. [Thin vs Full Client Loading](#2-thin-vs-full-client-loading)
3. [Projects Request-Driven Filtering & Pagination](#3-projects-request-driven-filtering--pagination)
4. [Conditional Projects Route Strategy](#4-conditional-projects-route-strategy)
5. [Deferred Analytics Loading](#5-deferred-analytics-loading)
6. [Thin vs Full My Tasks Loading](#6-thin-vs-full-my-tasks-loading)
7. [Server-Side Task Filtering & Pagination](#7-server-side-task-filtering--pagination)
8. [Client Summary SQL-First Aggregation](#8-client-summary-sql-first-aggregation)
9. [Hierarchy & Activity Caching](#9-hierarchy--activity-caching)
10. [Observability & Perf Logging](#10-observability--perf-logging)

---

## 1. Clients Initial-Load Slimming

### Problem
The clients list page fetched full `Client` records (30+ columns per row) for every client in the tenant, including nested contacts, billing fields, and address data that the list view never renders.

### Approach
- Introduced `GET /api/v1/clients/hierarchy/list` which returns `ClientListItem` — a server-computed projection with only the columns the list UI needs plus pre-aggregated counts (`contactCount`, `projectCount`, `openTasksCount`, `totalHoursWorked`).
- The endpoint includes `depth`, `parentName`, and `needsAttention` flags so the frontend doesn't need to compute hierarchy relationships.
- Old `GET /api/clients` is still available for detail views and drawers.

### Key Files
- `shared/schema.ts` — `ClientListItem` type definition
- `server/features/clients/router.ts` — hierarchy list route
- `client/src/pages/clients.tsx` — uses `queryKeys.clients.hierarchy`

### Cache Key
```ts
queryKeys.clients.hierarchy  // ["/api/v1/clients/hierarchy/list"]
```

### Acceptance
- List page loads only slim `ClientListItem[]`
- Full `ClientWithContacts` is loaded only when a client detail or drawer opens

### Data Flow
```
Request: GET /api/v1/clients/hierarchy/list
  → Router: server/features/clients/router.ts
    → Cache check: buildCacheKey(tenantId, "clients-hierarchy")
      → HIT: Return cached data with X-Report-Cache: HIT
      → MISS: storage.getClientsByTenantWithHierarchy(tenantId)
        → DB: SELECT clients WHERE tenantId = ?
        → DB: SELECT SUM(durationSeconds) FROM time_entries GROUP BY clientId (parallel)
        → DB: SELECT COUNT(*) FROM contacts GROUP BY clientId (parallel)
        → DB: SELECT COUNT(*) FROM projects GROUP BY clientId (parallel)
        → DB: Task aggregates (open tasks, last activity) (parallel)
        → Assembly: Recursive addWithChildren() builds flat hierarchy with depth/parentName
        → setCache(key, data, 60_000)
  → Response: ClientListItem[] with X-Report-Cache: MISS
```

### Tradeoffs & Constraints
- **Client-side filtering**: The hierarchy endpoint returns all clients; search, sort, stage filter, and industry filter are applied client-side. This is acceptable because the payload is already slim (~20 fields per client) and typical tenant sizes are <500 clients. At scale (1000+ clients), server-side filtering should be added.
- **No active cache invalidation**: The 60s TTL means newly created clients may not appear in the list for up to 60 seconds. Use `?fresh=true` for immediate consistency.
- **Five parallel aggregate queries**: The hierarchy computation issues five parallel SQL queries (contacts, projects, hours, tasks, activities). This is faster than N+1 but adds up under high concurrency. The 60s cache mitigates this.

### Backward Compatibility
- `GET /api/clients` still returns the full `Client[]` or `ClientWithContacts[]` and is used by detail views, drawers, and forms. No existing consumers were removed.

### When to Use This Pattern
Use initial-load slimming when a list page renders a table or grid of entities with aggregate badges (counts, totals) but never needs the full relation tree on initial load. The key indicator is: "Does the list show counts like '5 contacts' but never the actual contact names?"

---

## 2. Thin vs Full Client Loading

### Problem
Multiple views fetched the same "all clients" payload but needed different field sets. The project drawer needed only `{ id, companyName, displayName, status }` for a dropdown, while client-detail needed full `ClientWithContacts`.

### Approach
- Added `?fields=minimal` query parameter to `GET /api/clients` which returns only the id/name/status fields.
- `queryKeys.clients.minimal` maps to `["/api/clients", { fields: "minimal" }]` so the minimal and full payloads are cached separately.
- `queryKeys.clients.detail(id)` maps to `["/api/clients", id]` for the full record.
- `queryKeys.clients.all` maps to `["/api/clients"]` for the full list (used in drawers requiring full Client shape).

### Key Types
| Query Key | Returns | Used By |
|-----------|---------|---------|
| `clients.minimal` | `{ id, companyName, displayName, status }[]` | project settings, projects dashboard dropdowns |
| `clients.hierarchy` | `ClientListItem[]` | clients list page |
| `clients.detail(id)` | `ClientWithContacts` | client detail page, optimistic updates |
| `clients.all` | `Client[]` | drawers, forms needing full field access |

### Acceptance
- Dropdown/select components use `clients.minimal`
- List page uses `clients.hierarchy`
- Detail/drawer uses `clients.detail(id)` or `clients.all`

### Data Flow
```
Request: GET /api/clients?fields=minimal
  → Router: server/routes/clients.router.ts (legacy/main clients router)
    → Check query.fields === "minimal"
      → YES: SELECT id, companyName, displayName, status, parentClientId FROM clients WHERE tenantId = ?
      → NO: SELECT * FROM clients WHERE tenantId = ? (full payload)
  → Response: MinimalClient[] or Client[]

Request: GET /api/clients/:id
  → storage.getClientWithContacts(id)
    → DB: SELECT * FROM clients WHERE id = ?
    → DB: SELECT * FROM client_contacts WHERE clientId = ?
  → Response: ClientWithContacts
```

### Tradeoffs & Constraints
- **Multiple cache keys**: The same `/api/clients` endpoint can return different shapes depending on `?fields=minimal`. Each shape needs its own React Query key to prevent cache corruption.
- **No partial field selection**: The `?fields=minimal` approach is binary — either full or minimal. There's no arbitrary field selection. This keeps the implementation simple but means adding a new "medium" payload requires a new code path.

### Backward Compatibility
- The `?fields=minimal` parameter is additive. Existing consumers that don't pass it get the same full payload as before.

### When to Use This Pattern
Use query-parameter-based field selection when the same endpoint serves multiple consumers that need different field sets. This avoids creating separate endpoints while maintaining cache separation via distinct query keys.

---

## 3. Projects Request-Driven Filtering & Pagination

### Problem
The projects dashboard loaded all projects up front and filtered/sorted client-side, which degraded as the project count grew.

### Approach
- `GET /api/projects` accepts query params: `status`, `clientId`, `teamId`, `search`, `sortBy`, `sortDir`, `limit`, `offset`.
- The frontend builds `queryParams` reactively from filter state, so every filter change triggers a server-side query with the correct subset.
- Progressive "load more" pagination accumulates results (`accumulatedProjects` state) and checks `hasMore` via `projectPage.length >= PAGE_SIZE`.

### Key Files
- `client/src/pages/projects-dashboard.tsx` — filter state, `queryParams` memo, load-more handler
- Query key: `["/api/projects", queryParams]` — params object is part of the key so filters bust cache correctly

### Acceptance
- Changing any filter issues a new server request (not client-side post-filter)
- "Load More" fetches the next page without re-fetching previous results
- Resetting filters calls `resetPagination()` which clears `accumulatedProjects`

### Data Flow
```
Frontend: projects-dashboard.tsx
  → Filter state changes → useMemo builds queryParams
  → useQuery({ queryKey: [...queryKeys.projects.all, queryParams] })
    → GET /api/projects?fields=minimal&includeCounts=true&limit=25&offset=0&status=active&...
      → Router: projects.router.ts
        → Check config.features.enableProjectsSqlFiltering
          → TRUE: Build Drizzle WHERE clauses (status, clientId, teamId, ILIKE search)
          → FALSE: Fetch all, filter in memory (legacy fallback)
        → DB: SELECT projects ... WHERE conditions ... ORDER BY ... LIMIT 25 OFFSET 0
        → If includeCounts: inline grouped query → SELECT project_id, COUNT(*) ... GROUP BY project_id → attach as taskCounts { total, completed }
      → Response: ProjectWithCounts[] (max 25 items)
  → Frontend: accumulatedProjects.push(newPage); check hasMore = page.length >= 25
```

### Tradeoffs & Constraints
- **Accumulated state**: The frontend accumulates pages in `accumulatedProjects` state. On filter change, this state is reset and offset goes to 0. This means filter changes always cause a full refetch of page 1.
- **No cursor-based pagination**: Uses offset/limit which can have consistency issues if records are inserted between pages. Acceptable for the current scale.
- **Feature flag fallback**: When `enableProjectsSqlFiltering` is `false`, the system falls back to in-memory filtering. This flag defaults to `true` and should stay that way in production.

### Backward Compatibility
- The query parameter additions (`status`, `clientId`, `teamId`, `search`, `sortBy`, `sortDir`, `limit`, `offset`) are all optional. Existing consumers that don't pass them get unfiltered results (same behavior as before).

### When to Use This Pattern
Use server-driven filtering when the dataset can grow unboundedly and the UI provides filter/sort/search controls. The key indicator is: "Could this list grow to thousands of items?"

---

## 4. Conditional Projects Route Strategy

### Problem
The original `/api/projects` route returned the same payload regardless of context. The dashboard needs counts and minimal fields; the project detail needs full nested relations.

### Approach
- `GET /api/projects` with `?fields=minimal&includeCounts=true` returns projects with attached `taskCounts` (`{ total, completed }`).
- `GET /api/v1/projects` returns the v1 project list with additional enrichments.
- `GET /api/projects/:id` returns the full `ProjectWithRelations` including sections, members, team, and client.

### Key Mappings
| Scenario | Endpoint | Query Key |
|----------|----------|-----------|
| Dashboard list | `GET /api/projects?fields=minimal&includeCounts=true` | `["/api/projects", queryParams]` |
| V1 list | `GET /api/v1/projects` | `queryKeys.projects.v1` |
| Detail view | `GET /api/projects/:id` | `queryKeys.projects.detail(id)` |
| Sections | `GET /api/projects/:id/sections` | `queryKeys.projects.sections(id)` |
| Analytics summary | `GET /api/v1/projects/analytics/summary` | `queryKeys.projects.analyticsSummary` |

### Acceptance
- Dashboard list queries never load sections or members data
- Detail view hydrates full relations only when a project is opened

### Data Flow
```
Dashboard list: GET /api/projects?fields=minimal&includeCounts=true&limit=25
  → SQL: SELECT id, name, clientId, status, ... FROM projects WHERE ... LIMIT 25
  → SQL: SELECT project_id, COUNT(*) as total, COUNT(CASE WHEN status = 'done' ...) as completed FROM tasks WHERE project_id IN (...) GROUP BY project_id
  → Response: projects[] with taskCounts { total, completed } attached per project

Detail view: GET /api/projects/:id
  → SQL: SELECT * FROM projects WHERE id = ?
  → SQL: SELECT * FROM sections WHERE projectId = ?
  → SQL: SELECT * FROM project_members JOIN users ...
  → SQL: SELECT * FROM clients WHERE id = ?
  → SQL: SELECT * FROM teams WHERE id = ?
  → Response: ProjectWithRelations (full nested object)
```

### Tradeoffs & Constraints
- **Two endpoints, same table**: The dashboard and detail views hit different code paths for the same `projects` table. This is intentional — keeping them separate avoids accidentally loading heavy relations on the list view.
- **`includeCounts` adds a second query**: When `includeCounts=true`, the route issues an additional `GROUP BY` query for open task counts. This is a fixed O(1) query regardless of project count (not O(N)).

### Backward Compatibility
- `GET /api/projects` without any query parameters returns the same response as before the sprint. The `fields`, `includeCounts`, and filter parameters are all additive.

### When to Use This Pattern
Use conditional route strategies when the same entity needs materially different response shapes in different contexts (list vs detail). The alternative — two completely separate endpoints — is also acceptable but creates more API surface area.

---

## 5. Deferred Analytics Loading

### Problem
The projects dashboard and home page loaded analytics data eagerly alongside the project list, competing for resources on initial paint.

### Approach
- Analytics queries (`queryKeys.projects.analyticsSummary`) use `enabled: !!projectPage` or `enabled: !!user && isAdmin` to defer loading until the primary data is available.
- `staleTime: 30000` (30 seconds) prevents refetching on fast navigation.
- Analytics summary is computed server-side in `getProjectAnalyticsSummary()` using batch queries (see PERFORMANCE_NOTES.md).

### Key Files
- `client/src/pages/projects-dashboard.tsx` — `analytics` query with `enabled: !!projectPage`
- `client/src/pages/home.tsx` — analytics query with role gating
- `server/http/domains/projects.router.ts` — analytics summary endpoint

### Acceptance
- Analytics cards show a skeleton/loading state while the primary list renders immediately
- No analytics fetch fires for non-admin users on the home page
- Analytics data is not refetched within 30 seconds of the last successful fetch

### Data Flow
```
Frontend: projects-dashboard.tsx
  → useQuery({ queryKey: queryKeys.projects.analyticsSummary, enabled: !!projectPage, staleTime: 30000 })
    → Waits until projectPage is loaded (enabled guard)
    → GET /api/v1/projects/analytics/summary
      → Router: projectsDashboard.ts
        → DB: SELECT * FROM projects WHERE tenantId = ? AND status != 'archived'
        → getProjectAnalyticsSummary(projectIds)
          → DB: Batch task queries (open, completed, overdue, due today counts) via GROUP BY
        → Assembly: { totals: {...}, perProject: [...] }
      → Response: ProjectAnalyticsSummary
  → Frontend: Show skeleton cards → replace with real data when loaded
```

### Tradeoffs & Constraints
- **All-projects fetch for analytics**: The analytics endpoint fetches all active projects for the tenant, then batch-computes analytics. For tenants with 1000+ projects, this could become slow. The `staleTime: 30000` mitigates by preventing refetches within 30 seconds.
- **Deferred but not lazy**: Unlike client detail (which requires a click), analytics loads automatically once the project list is ready. This is a compromise — fully lazy would require the user to click an "analytics" tab, but the dashboard design shows analytics prominently.

### Backward Compatibility
- Analytics was previously computed eagerly. The deferred approach produces identical data; only the timing changed.

### When to Use This Pattern
Use deferred loading when secondary data depends on primary data being available (needs project IDs) or when it's expensive enough to justify not competing with the initial paint. The key indicator is: "Would loading this data simultaneously with the list slow down the perceived load time?"

---

## 6. Thin vs Full My Tasks Loading

### Problem
The My Tasks page fetched `TaskWithRelations[]` (full task records with subtasks, assignees, tags, attachments) for every task, even though the list only renders a subset of fields.

### Approach
- Introduced `GET /api/tasks/my` which returns `TaskListResponse` containing `TaskListItem[]` — a slim projection with pre-aggregated counts.
- `TaskListItem` includes `subtaskCount`, `completedSubtaskCount`, `commentCount`, `assigneeCount`, `childTaskCount`, plus flattened `assignees` and `tags` arrays.
- `createdAt` and `updatedAt` are included on `TaskListItem` for dashboard stats computation (no `as any` casts needed).
- Full `TaskWithRelations` is loaded only when a task detail drawer opens, via `queryKeys.tasks.detail(id)`.

### Key Types
```ts
type MyTaskItem = TaskListItem;  // not TaskListItem | TaskWithRelations
```

| Query Key | Returns | Used By |
|-----------|---------|---------|
| `tasks.my` | `TaskListResponse` (`items: TaskListItem[]`) | My Tasks list |
| `tasks.detail(id)` | `TaskWithRelations` | Task detail drawer |
| `tasks.subtasks(id)` | `Subtask[]` | Subtask list (lightweight checklist items) |
| `tasks.childTasks(id)` | `TaskWithRelations[]` | Child task list (full task records) |

### Canonical Distinction: `subtasks` vs `childTasks`
- **`subtasks`**: Simple checklist items under a task. Endpoint: `/api/tasks/:id/subtasks`. Uses `queryKeys.tasks.subtasks(id)`.
- **`childTasks`**: Full task records with a parent-child relationship. Endpoint: `/api/tasks/:id/childtasks`. Uses `queryKeys.tasks.childTasks(id)`.

### Acceptance
- My Tasks list view never loads `TaskWithRelations`
- Dashboard stats use `TaskListItem` fields directly (no `as any` casts)
- Opening a task drawer fetches the full detail only once

### Data Flow
```
Request: GET /api/tasks/my?view=list&paginated=true&limit=100&sortBy=due_date
  → Router: tasks.router.ts
    → Check view === "list"
      → YES: taskListHydrator.getFilteredTaskListItems(userId, tenantId, filters)
        → Phase 1 (Identity): getUserTaskIds(userId) → task IDs from task_assignees + personal tasks
        → Phase 2 (Filter): Build SQL WHERE conditions from filters (status, priority, dueBucket, search)
        → Phase 3 (Privacy): If enablePrivateTasks, filter by accessible private IDs
        → Phase 4 (Summary): computeSummaryFromIds() → overdue/today/upcoming counts (parallel)
        → Phase 5 (Fetch): SELECT tasks WHERE id IN (paginatedIds) LIMIT maxFetch
        → Phase 6 (Hydrate): Promise.all([
            projectRows (name, clientName),
            assigneeRows (userId, name),
            tagRows (id, name),
            commentCounts (GROUP BY taskId),
            childTaskCounts (GROUP BY parentTaskId),
            subtaskCounts (GROUP BY taskId)
          ])
        → Phase 7 (Map): Assemble TaskListItem[] from task + hydration data
      → Response: TaskListResponse { items, summary, pagination }
```

### Tradeoffs & Constraints
- **Seven-phase hydration**: The list hydrator is more complex than a simple SELECT but avoids N+1 patterns. Each phase is a fixed number of queries regardless of task count.
- **Max fetch limit**: `maxFetch: 2000` prevents unbounded result sets. Users with 2000+ tasks will need to use filters to narrow down.
- **`dueBucket` computed server-side**: The `dueBucket` field (overdue/today/upcoming/no_date) is computed by the server based on `dueDate` and the current date, avoiding client-side date parsing inconsistencies.

### Backward Compatibility
- `GET /api/tasks/my` without `view=list` falls back to the batch hydrator or legacy `getTasksByUser`, returning `TaskWithRelations[]`. The `view=list` parameter is opt-in.

### When to Use This Pattern
Use thin list DTOs with server-side hydration when the list has many columns that reference related entities (project name, assignee name, tag name) but the full relation trees (all comments, all subtasks) are never needed on the list.

---

## 7. Server-Side Task Filtering & Pagination

### Problem
Task filtering and sorting happened client-side, requiring the full dataset in memory.

### Approach
- `GET /api/tasks/my` accepts `TaskListFilters` query params: `status`, `priority`, `dueBucket`, `search`, `includeCompleted`, `sortBy`, `sortDir`, `limit`, `cursor`.
- The response includes `TaskListSummary` (counts by status, by due bucket, completion rate) and `pagination` metadata (`offset`, `limit`, `hasMore`, `totalFiltered`).
- Query key includes the filter params object: `["/api/tasks/my", serverQueryParams]` so each filter combination is cached independently.

### Key Types
```ts
type TaskListFilters = {
  status?: string;
  priority?: string;
  dueBucket?: "overdue" | "today" | "this_week" | "upcoming" | "no_date";
  search?: string;
  includeCompleted?: boolean;
  sortBy?: "due_date" | "updated" | "priority" | "title";
  sortDir?: "asc" | "desc";
  limit?: number;
  cursor?: number;
};

type TaskListResponse = {
  items: TaskListItem[];
  summary: TaskListSummary;
  pagination: { offset: number; limit: number; hasMore: boolean; totalFiltered: number };
};
```

### Acceptance
- Filter changes trigger server requests, not client-side array filtering
- Summary counts are computed server-side and reflect the full dataset (not just the current page)
- Pagination cursor advances without re-fetching previous results

### Data Flow
```
Frontend: my-tasks.tsx
  → Filter state → useMemo builds serverQueryParams
  → useQuery({ queryKey: [...queryKeys.tasks.my, serverQueryParams] })
    → GET /api/tasks/my?view=list&paginated=true&status=in_progress&priority=high&limit=100
      → taskListHydrator applies SQL WHERE conditions:
        → status=in_progress → eq(tasks.status, 'in_progress')
        → priority=high → eq(tasks.priority, 'high')
        → search=keyword → ilike(tasks.title, '%keyword%')
        → dueBucket=overdue → lt(tasks.dueDate, now()) AND neq(tasks.status, 'done')
      → Summary computed across ALL matching tasks (not just current page)
      → Items limited to first `limit` matching tasks
  → Response: { items: TaskListItem[], summary: TaskListSummary, pagination: {...} }
```

### Tradeoffs & Constraints
- **Summary covers full dataset**: The `summary` in `TaskListResponse` counts overdue/today/upcoming across all matching tasks, not just the current page. This means the summary query touches all matching rows even when pagination limits the item count.
- **No cursor-based pagination**: Uses offset/limit similar to projects. The `pagination.hasMore` flag indicates whether more results exist.
- **`includeCompleted` is opt-in**: By default, completed tasks are excluded to reduce payload size. The user explicitly toggles "Show Completed" to include them.

### Backward Compatibility
- Filter query parameters are all optional. Without them, the endpoint returns all user tasks (same as before).

### When to Use This Pattern
Use server-side filtering when the UI provides multiple filter controls and the dataset can grow large. Combine with server-computed summaries so dashboard stats remain accurate regardless of pagination.

---

## 8. Client Summary SQL-First Aggregation

### Problem
Client list summary stats (total, active, prospect counts, needs-attention flags) were computed client-side from the full dataset on every render.

### Approach
- `GET /api/v1/clients/stages/summary` returns pre-computed counts per stage, computed via a single SQL `GROUP BY` query.
- The clients page also computes a local `ClientSummary` from the hierarchy data as a fallback/enrichment (e.g., `newThisMonth`).
- Cached under `queryKeys.clients.stagesSummary`.

### Key Files
- `server/features/clients/router.ts` — stages summary endpoint
- `client/src/pages/clients.tsx` — uses both `stagesSummary` and local `summary` memo

### Acceptance
- Stage pipeline counts render from the server-computed summary, not from iterating the full client list
- Local `ClientSummary` is a supplementary computation (e.g., `newThisMonth` which needs Date math)

### Data Flow
```
Request: GET /api/v1/clients/stages/summary
  → Router: server/features/clients/router.ts
    → storage.getClientStageSummary(tenantId)
      → DB: SELECT clients.stage, COUNT(DISTINCT clients.id) as clientCount,
              COUNT(DISTINCT projects.id) as projectCount
              FROM clients LEFT JOIN projects ON projects.clientId = clients.id
              WHERE clients.tenantId = ?
              GROUP BY clients.stage
  → Response: [{ stage: "active_maintenance", clientCount: 12, projectCount: 8 }, ...]
```

### Tradeoffs & Constraints
- **Not cached**: Unlike the hierarchy list, the stages summary endpoint does NOT use TTL caching. This is because it's a lightweight SQL query (single GROUP BY) and the pipeline bar benefits from real-time accuracy.
- **LEFT JOIN with projects**: The join ensures projectCount is accurate even for stages with no projects (returns 0). This is slightly more expensive than counting clients alone but provides the data needed for the pipeline bar tooltips.

### Backward Compatibility
- This endpoint is new. It replaces client-side stage counting that previously iterated over the full client list. No existing consumers were changed.

### When to Use This Pattern
Use SQL-first aggregation when the UI shows summary statistics (counts, totals, distributions) that would otherwise require fetching and iterating over the raw dataset. The key indicator is: "Am I fetching N records just to show a single number?"

---

## 9. Hierarchy & Activity Caching

### Problem
Client hierarchy data and activity timestamps were re-fetched on every page visit, even when the underlying data hadn't changed.

### Approach
- `queryKeys.clients.hierarchy` caches the hierarchy list independently. Invalidated only on create, stage change, or bulk status update.
- `queryKeys.clients.stagesSummary` is invalidated in tandem with hierarchy on mutations that affect stage distribution.
- Client detail uses optimistic updates for common mutations (stage change, field edits) so the UI updates instantly while the server confirms.
- `invalidateTaskCaches()` helper centralizes which caches to bust after task mutations, preventing stale hierarchy counts.

### Invalidation Strategy
| Mutation | Caches Invalidated |
|----------|-------------------|
| Create client | `clients.hierarchy`, `clients.stagesSummary` |
| Update client stage | `clients.detail(id)`, `clients.hierarchy`, `clients.stagesSummary` |
| Bulk status change | `clients.hierarchy`, `clients.stagesSummary` |
| Task create/update | `tasks.my`, `tasks.all`, `projects.sections(pid)`, `projects.tasks(pid)` |

### Key Helper
```ts
import { invalidateTaskCaches } from "@/lib/queryKeys";

invalidateTaskCaches(queryClient, {
  projectId: "...",
  taskId: "...",
  parentTaskId: "...",
});
```

### Acceptance
- Hierarchy list is not refetched on page navigation unless a mutation fired
- Stage summary and hierarchy are always invalidated together on mutations that affect counts
- Optimistic updates make stage changes appear instant with rollback on error

### Data Flow
```
Cache write (on first fetch):
  GET /api/v1/clients/hierarchy/list
    → buildCacheKey(tenantId, "clients-hierarchy") → "tenant-abc:clients-hierarchy:d41d..."
    → getCached(key) → undefined (MISS)
    → Fetch from DB → ClientListItem[]
    → setCache(key, data, 60_000) → stored in memory Map
    → setCacheHeaders(res, false, 60) → Cache-Control: private, max-age=60; X-Report-Cache: MISS

Cache read (within 60s):
  GET /api/v1/clients/hierarchy/list
    → getCached(key) → data (HIT)
    → setCacheHeaders(res, true, 60) → X-Report-Cache: HIT
    → Return cached data (no DB query)

Invalidation (on mutation):
  Frontend: createClientMutation.onSuccess
    → queryClient.invalidateQueries({ queryKey: queryKeys.clients.hierarchy })
    → queryClient.invalidateQueries({ queryKey: queryKeys.clients.stagesSummary })
    → React Query marks these queries as stale → triggers refetch
    → Server: cache may still serve stale data for up to 60s (no active server-side invalidation on CRUD)
```

### Tradeoffs & Constraints
- **No active server-side invalidation on client CRUD**: When a client is created or updated, the React Query cache is invalidated (triggering a refetch), but the server-side 60s TTL cache is NOT explicitly cleared. The refetch may hit the stale server cache. Use `?fresh=true` if this matters.
- **Optimistic updates are client-only**: Stage changes appear instant in the UI via optimistic updates, but the server cache doesn't know about them. If another user views the same list, they see the old data until TTL expires.
- **Cache key doesn't include filters**: Since the hierarchy endpoint doesn't support server-side filtering, there's only one cache entry per tenant. This simplifies invalidation but means any change to the data requires waiting for TTL expiration (or using `?fresh=true`).

### Backward Compatibility
- Caching is transparent to the frontend. The response shape is identical whether served from cache or DB. The `X-Report-Cache` header is the only visible difference.

### When to Use This Pattern
Use TTL caching when an endpoint is read-heavy, expensive to compute, and tolerates short staleness windows. The 60-second TTL works well for dashboard list views where absolute real-time accuracy isn't critical.

---

## 10. Observability & Perf Logging

### Problem
No visibility into query counts, durations, or cache hit rates in development or production.

### Approach
- **Query Debug Utility**: `QUERY_DEBUG=true npm run dev` enables per-endpoint query tracking.
  ```ts
  import { createQueryTracker } from './lib/queryDebug';
  const tracker = createQueryTracker("GET /api/clients");
  tracker.track("hierarchy-query");
  tracker.log(); // [QUERY_DEBUG] GET /api/clients: 1 query in 12ms
  ```
- **React Query DevTools**: Available in development via the floating panel. Shows cache state, stale times, and invalidation events.
- **Centralized Query Keys**: All query keys are defined in `client/src/lib/queryKeys.ts` with JSDoc comments. This makes it straightforward to audit which endpoints are active, find duplicate fetches, and trace cache invalidation chains.
- **Invalidation Audit Path**: The `invalidateTaskCaches` helper consolidates what was previously 3–5 scattered invalidation calls. Any change to the invalidation strategy happens in one place.

### Key Files
- `server/lib/queryDebug.ts` — query tracking utility
- `client/src/lib/queryKeys.ts` — centralized query key definitions and `invalidateTaskCaches` helper
- `docs/performance/telemetry.md` — additional telemetry documentation

### Acceptance
- `QUERY_DEBUG=true` logs query counts and durations for every endpoint hit
- All query keys in sprint-touched files reference `queryKeys.*` (no hardcoded string arrays)
- Cache invalidation logic is auditable from a single file (`queryKeys.ts`)

### Data Flow
```
Server-side (PerfLogger):
  Every request → perfLogger middleware samples at PERF_SAMPLE_RATE (5% prod, 100% dev)
    → If sampled or slow (>300ms): Log structured JSON with tenantHash, method, route, durationMs
    → Stats accumulated in memory → GET /api/v1/system/perf/stats returns counters

Client-side (perf.ts):
  Route navigation → markNavigationStart(view) → performance.mark('mwd:nav:clients:start')
    → Page renders → markNavigationEnd(view) → performance.measure('mwd:nav:clients')
    → Buffer flush (every 5s, max 50 entries) → POST /api/v1/system/perf (sampled at 5%)

Query debug (QUERY_DEBUG=true):
  Endpoint handler → createQueryTracker("GET /api/clients")
    → tracker.track("hierarchy-query") → records timing
    → tracker.log() → console output: "[QUERY_DEBUG] GET /api/clients: 1 query in 12ms"
```

### Tradeoffs & Constraints
- **Sampling reduces volume**: The 5% production sample rate means rare issues may not appear in logs. Increase `PERF_SAMPLE_RATE` temporarily for targeted debugging.
- **Tenant ID hashing**: Logs use SHA-256 hashed tenant IDs (8-char prefix) to prevent PII leakage. This allows correlation within a session but makes it harder to identify specific tenants in logs.
- **No persistent storage**: Perf stats are accumulated in memory and reset on server restart. For persistent monitoring, forward logs to an external service.

### Backward Compatibility
- All telemetry is additive and opt-in. The legacy `PERF_TELEMETRY=1` middleware continues to work alongside the new unified PerfLogger. Both can run simultaneously without conflict.

### When to Use This Pattern
Enable `QUERY_DEBUG=true` during development when adding or modifying database-touching endpoints. Use the perf stats endpoint and `X-Report-Cache` headers to monitor cache effectiveness in production.

---

## Related Documentation

- [Thin vs Full Payload Strategy](./thin-vs-full-payload-strategy.md) — Definitions, decision tree, and anti-patterns
- [Architectural Guardrails](./architectural-guardrails.md) — Rules for preventing performance regressions
- [Caching Strategy](./caching-strategy.md) — Server-side TTL, React Query, and invalidation details
- [PERFORMANCE_NOTES.md](./PERFORMANCE_NOTES.md) — N+1 query fixes, batch methods, index recommendations
- [Database Indexes](./db-indexes.md) — Index strategy and verification
- [Telemetry](./telemetry.md) — Detailed telemetry and slow-query sampling docs
- [List Virtualization](./list-virtualization.md) — Virtualization audit and implementation details
- [Virtualization](./virtualization.md) — Feature flag and shared component docs
