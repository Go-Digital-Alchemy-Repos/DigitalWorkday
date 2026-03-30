# Architectural Guardrails

**Created**: March 28, 2026
**Purpose**: Rules that prevent reintroduction of performance regressions. All new feature work must comply with these guardrails.

---

## Rule 1: List Pages Must Not Load Full Relational Datasets

**Requirement**: Any page that renders a list, table, or grid of entities must use a thin DTO — not the full entity with all nested relations.

**Why**: Loading `ClientWithContacts[]` (with contacts, projects, notes) for a 200-row client list transfers megabytes of unused data and creates hundreds of unnecessary DB joins.

**How to comply**:
- Define a `*ListItem` type with only the columns the list renders.
- Replace nested arrays with pre-aggregated counts (`contactCount` instead of `contacts[]`).
- Load the full entity only when the user clicks into a detail view or drawer.

**Current examples**:
| Page | Thin DTO | Full DTO (deferred) |
|------|----------|-------------------|
| Clients | `ClientListItem` via `/api/v1/clients/hierarchy/list` | `ClientWithContacts` via `/api/clients/:id` |
| Projects | `ProjectWithCounts` via `/api/projects?fields=minimal` | `ProjectWithRelations` via `/api/projects/:id` |
| My Tasks | `TaskListItem` via `/api/tasks/my?view=list` | `TaskWithRelations` via `/api/tasks/:id` |
| Project Tasks | `TaskListItem` via `/api/projects/:id/tasks?fields=list` (batched hydrator) | `TaskWithRelations[]` via `/api/projects/:id/tasks` (default) |
| Time Entries | `TimeEntryListItem` via `/api/time-entries?fields=list` | Full `TimeEntry` with nested objects via `/api/time-entries` (no `fields` param) |

**See also**: [Thin vs Full Payload Strategy](./thin-vs-full-payload-strategy.md)

---

## Rule 2: Filtering and Pagination Must Be Server-Driven Where Supported

**Requirement**: When a list endpoint supports query parameters for filtering, sorting, or pagination, the frontend must use them instead of fetching all records and filtering client-side.

**Why**: Client-side filtering requires fetching the entire dataset, which degrades as the dataset grows. Server-side filtering uses SQL indexes and returns only the matching subset.

**How to comply**:
- Pass filter values as query parameters: `?status=active&clientId=abc&search=keyword`.
- Include filter parameters in the React Query key so each combination is cached independently.
- Reset pagination offset to 0 when filters change.

**Current server-driven filtering**:
| Page | Filters | Implementation |
|------|---------|---------------|
| Projects dashboard | status, clientId, teamId, search | SQL `WHERE` clauses via Drizzle ORM |
| My Tasks | status, priority, dueBucket, search, includeCompleted | SQL conditions in `taskListHydrator` |

**Acceptable client-side filtering**:
| Page | Filters | Justification |
|------|---------|---------------|
| Clients | stage, industry, tags, search | Hierarchy list is already thin; typical client counts are manageable (<500). Server-side migration is a future optimization. |

---

## Rule 3: Heavy Relations Must Be Lazy-Loaded

**Requirement**: Relations that include arrays of nested objects (contacts, subtasks, comments, attachments, project members) must not be fetched until the user explicitly requests them.

**Why**: Eagerly loading relation trees for list items wastes bandwidth and increases query complexity. Most list items are never opened.

**How to comply**:
- Use `useQuery` with `enabled: isOpen && !!entityId` to defer fetching.
- Show skeleton/loading states while the deferred query runs.
- Display immediately available data from the list cache (e.g., `companyName`, `stage`) while the full detail loads.

**Pattern**:
```typescript
const { data: fullClient, isLoading } = useQuery({
  queryKey: queryKeys.clients.detail(clientId),
  enabled: sheetOpen && !!clientId, // only fires when sheet is open
});
```

---

## Rule 4: Aggregations Should Be SQL-First

**Requirement**: Dashboard stats, summary counts, pipeline distributions, and other aggregate values must be computed via SQL (`COUNT`, `SUM`, `GROUP BY`) — not by fetching raw records and aggregating in JavaScript.

**Why**: SQL aggregation happens at the database level with index support, returns a tiny payload, and scales regardless of dataset size. JavaScript aggregation requires transferring and processing the entire dataset.

**How to comply**:
- Create dedicated aggregate endpoints (e.g., `/api/v1/clients/stages/summary`).
- Use `GROUP BY` with `COUNT(DISTINCT ...)` for category distributions.
- Use `Promise.all` for parallel aggregate queries when multiple counts are needed.

**Current SQL-first aggregations**:
| Aggregate | Endpoint | SQL Pattern |
|-----------|----------|-------------|
| Client stage counts | `/api/v1/clients/stages/summary` | `GROUP BY clients.stage` with `COUNT(DISTINCT)` |
| Client summary | `/api/v1/clients/summary` | Aggregate with 60s TTL cache |
| Project analytics | `/api/v1/projects/analytics/summary` | `getProjectAnalyticsSummary()` batch SQL |
| Task list summary | `/api/tasks/my?view=list` (response `.summary`) | Server-computed counts by status/due bucket |
| Open task counts | `/api/projects?includeCounts=true` | `getOpenTaskCountsByProjectIds()` with `GROUP BY` |

**Acceptable client-side fallbacks**:
- `computeDashboardStats` in My Tasks exists as a fallback when `serverSummary` is unavailable. This is acceptable for graceful degradation but the server summary should be the primary source.

---

## Rule 5: Caching Rules and When to Apply TTL vs Real-Time

**Requirement**: Apply server-side TTL caching to expensive, read-heavy endpoints that tolerate short staleness windows. Use real-time (no cache) for data that must reflect mutations instantly.

### When to Cache (TTL)
- Aggregate/summary endpoints that involve multiple JOINs or GROUP BY queries
- List endpoints with hierarchy computations
- Data that changes infrequently relative to read frequency
- Typical TTL: 60 seconds for dashboards, up to 120 seconds for reports

### When NOT to Cache
- Detail views loaded on explicit user interaction (already deferred, no caching benefit)
- Mutation responses (POST/PATCH/DELETE should return fresh data)
- Real-time collaboration data (chat messages, active timers)
- Endpoints where the user expects instant feedback after their own action

### Current Caching Decisions
| Endpoint | Cached? | TTL | Reason |
|----------|---------|-----|--------|
| `/api/v1/clients/hierarchy/list` | Yes | 60s | Expensive hierarchy computation; list views tolerate 60s staleness |
| `/api/v1/clients/summary` | Yes | 60s | Aggregate computation; dashboard context |
| `/api/v1/clients/stages/summary` | No | — | Lightweight SQL GROUP BY; real-time accuracy preferred for pipeline bar |
| `/api/projects?fields=minimal` | No | — | Already thin; fast enough without caching |
| `/api/tasks/my?view=list` | No | — | Must reflect task mutations immediately |

**See also**: [Caching Strategy](./caching-strategy.md)

---

## Rule 6: Query Keys Must Be Centralized

**Requirement**: All React Query keys must be defined in `client/src/lib/queryKeys.ts`. No hardcoded string arrays in page components.

**Why**: Centralized keys make it possible to audit which endpoints are active, find duplicate fetches, trace cache invalidation chains, and ensure thin/full payloads have distinct cache entries.

**How to comply**:
- Add new keys to the appropriate namespace in `queryKeys.ts`.
- Use the `invalidateTaskCaches()` helper for task mutations instead of scattering individual `invalidateQueries` calls.
- Include filter parameters as part of the query key (e.g., `[...queryKeys.projects.all, queryParams]`) so each filter combination is cached independently.

---

## Rule 7: No N+1 Query Patterns

**Requirement**: Backend endpoints must not execute one query per item in a list. Use batch queries with `IN (...)` clauses or `JOIN` operations.

**Why**: N+1 patterns degrade linearly with dataset size. A 100-project dashboard generating 100 individual task count queries is 100x slower than one `GROUP BY` query.

**How to comply**:
- Use `getOpenTaskCountsByProjectIds(ids)` instead of looping `getOpenTaskCount(id)`.
- Use `getTasksByProjectIds(ids)` for batch task fetches.
- Use `Promise.all` with batched queries, not sequential loops.
- Enable `QUERY_DEBUG=true` during development to monitor query counts per endpoint.

---

## Verification Checklist for New Features

Before merging a feature that adds a new list page, dashboard, or data-heavy view:

- [ ] List view uses a thin DTO (no nested relation arrays)
- [ ] Detail/drawer data is lazy-loaded with `enabled` guard
- [ ] Aggregate stats use SQL-first computation
- [ ] Filtering uses server-side query params where the endpoint supports them
- [ ] Query key is registered in `queryKeys.ts`
- [ ] No N+1 query patterns in the backend handler
- [ ] `QUERY_DEBUG=true` shows acceptable query count for the endpoint
- [ ] Loading/skeleton states shown while deferred data loads
- [ ] Cache invalidation covers the new query key in relevant mutation handlers
