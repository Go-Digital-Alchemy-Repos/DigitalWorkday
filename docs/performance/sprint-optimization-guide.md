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
- `server/http/domains/clients.router.ts` — hierarchy list route
- `client/src/pages/clients.tsx` — uses `queryKeys.clients.hierarchy`

### Cache Key
```ts
queryKeys.clients.hierarchy  // ["/api/v1/clients/hierarchy/list"]
```

### Acceptance
- List page loads only slim `ClientListItem[]`
- Full `ClientWithContacts` is loaded only when a client detail or drawer opens

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

---

## 4. Conditional Projects Route Strategy

### Problem
The original `/api/projects` route returned the same payload regardless of context. The dashboard needs counts and minimal fields; the project detail needs full nested relations.

### Approach
- `GET /api/projects` with `?fields=minimal&includeCounts=true` returns `ProjectWithCounts` (base project + `openTaskCount`).
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

---

## 8. Client Summary SQL-First Aggregation

### Problem
Client list summary stats (total, active, prospect counts, needs-attention flags) were computed client-side from the full dataset on every render.

### Approach
- `GET /api/v1/clients/stages/summary` returns pre-computed counts per stage, computed via a single SQL `GROUP BY` query.
- The clients page also computes a local `ClientSummary` from the hierarchy data as a fallback/enrichment (e.g., `newThisMonth`).
- Cached under `queryKeys.clients.stagesSummary`.

### Key Files
- `server/http/domains/clients.router.ts` — stages summary endpoint
- `client/src/pages/clients.tsx` — uses both `stagesSummary` and local `summary` memo

### Acceptance
- Stage pipeline counts render from the server-computed summary, not from iterating the full client list
- Local `ClientSummary` is a supplementary computation (e.g., `newThisMonth` which needs Date math)

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
