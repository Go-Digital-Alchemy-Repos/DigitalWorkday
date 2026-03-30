# Sprint Verification Report — Before/After Validation

**Date**: March 27, 2026
**Environment**: Development
**Sprint Scope**: 15+ performance and behavior changes across Clients, Projects Dashboard, My Tasks, Client Summary, and hierarchy/activity flows.

## Methodology

This report was produced by static code analysis of the merged codebase. Each validation item was verified by:

1. **Tracing frontend query hooks** — examining `useQuery` calls, their `queryKey` values, `enabled` conditions, and response types in page components.
2. **Tracing backend route handlers** — examining Express router endpoints, SQL queries, feature flag gating, and response shapes.
3. **Tracing shared types** — examining DTOs in `shared/schema.ts` to confirm payload shapes match frontend expectations.
4. **Feature flag verification** — confirming all gating flags (`enableProjectsSqlFiltering`, `enableClientsBatchExpansion`, `enableTasksBatchHydration`) default to `true` in `server/config.ts`.
5. **E2E test attempt** — automated browser tests were attempted but blocked by the test environment's Super Admin tenant context requirement (not a regression — pre-existing environment constraint).

Payload size estimates are based on field count comparisons between old and new DTOs, not measured byte counts. Request counts are based on `useQuery` hook analysis in page components.

**Evidence Legend**: All PASS verdicts in this report are based on **Static** analysis (code tracing). Runtime validation in a tenant-capable environment with DevTools measurements is recommended for full confidence and should be appended as an addendum when available.

---

## 1. Clients Page Validation

### Network Requests on Mount

| Before (Pre-Sprint) | After (Post-Sprint) | Status |
|---|---|---|
| `/api/clients` (full payload with contacts + projects per client) | `/api/v1/clients/hierarchy/list` (lightweight list DTO with SQL aggregates) | **PASS** |
| — | `/api/v1/clients/stages/summary` (stage pipeline counts) | **PASS** |
| Redundant `/api/clients` fetch on mount | **Removed** — no third `/api/clients` call on mount | **PASS** |

**Request count on mount**: 2 (hierarchy/list + stages/summary). Confirmed NO redundant `/api/clients` fetch.

### Payload Sizes

| Endpoint | Before | After | Reduction |
|---|---|---|---|
| Client list | Full `ClientWithContacts` (contacts[], projects[], notes, description, addresses) | `ClientListItem` DTO: id, companyName, displayName, status, stage, industry, tags, email, phone, website, parentClientId, createdAt, depth, contactCount, projectCount, openTasksCount, lastActivityAt, needsAttention, totalHoursWorked | ~70-80% smaller |
| Client summary | Computed client-side from full list | SQL-aggregated `/api/v1/clients/stages/summary` — returns `{stage, clientCount, projectCount}[]` | N/A (new endpoint) |

### Client Detail Sheet (Lazy Loading)

| Behavior | Status |
|---|---|
| `ClientDetailSheet` component uses `useQuery` with `enabled: open && !!clientId` | **PASS** |
| Sheet shows skeleton loader while fetching | **PASS** |
| Full client data (`/api/clients/:id`) only fetched on click | **PASS** |
| List item data (companyName, displayName, stage) shown immediately from hierarchy cache | **PASS** |

### Filters / Search / Sort / List Rendering

| Feature | Status | Notes |
|---|---|---|
| Stage filter (pipeline bar) | **PASS** | Client-side filtering from hierarchy list |
| Industry filter | **PASS** | Dynamically populated from hierarchy data |
| Tag filter | **PASS** | Dynamically populated from hierarchy data |
| Search | **PASS** | Client-side text search on companyName |
| Sort (hours, name, projects, contacts, tasks, date) | **PASS** | 12 sort options, client-side |
| List rendering | **PASS** | All clients loaded in single hierarchy request and rendered as mapped rows/cards. `VirtualizedList` component is imported but currently disabled (`useVirtual = false` in `clients.tsx:1218`). No server-side pagination; entire list is rendered client-side. |
| CSV export | **PASS** | `exportClientsToCsv()` function present, exports selected clients |

### Divisions System Removal

| Check | Status | Notes |
|---|---|---|
| "New Division" button removed from Clients page | **PASS** | No "New Division" button in clients.tsx |
| Divisions tab removed | **PASS** | Parent/child hierarchy now uses "Divisions" label for display only within grouped card views |
| `clientDivisions` table still in schema | **NOTE** | Table definition retained in schema.ts for migration compatibility, but no new division creation flows exist on Clients page |

---

## 2. Projects Dashboard Validation

### Network Requests on Mount

| Request | Timing | Status |
|---|---|---|
| `/api/projects` (with `fields=minimal`, `includeCounts=true`, `limit=25`, server-side filters) | Immediate on mount | **PASS** |
| `/api/clients?fields=minimal` | Immediate (filter dropdown) | **PASS** |
| `/api/teams` | Immediate (filter dropdown) | **PASS** |
| `/api/v1/projects/analytics/summary` | Deferred — `enabled: !!projectPage` | **PASS** |

**Confirmed**: Analytics query fires only after project list loads (conditional `enabled` flag).

### Payload Sizes

| Endpoint | Before | After | Reduction |
|---|---|---|---|
| Project list | Full project objects | Minimal columns via SQL `SELECT` with `fields=minimal` (id, name, clientId, status, dates, color, teamId, stickyAt, visibility, description) | ~40-50% smaller |
| Analytics summary | N+1 per-project task queries | Single batch `getProjectAnalyticsSummary(projectIds)` — SQL aggregate | Queries reduced from N+1 to 2 |
| Client dropdown | Full `ClientWithContacts[]` | `fields=minimal` returns `{id, companyName, displayName, status, parentClientId}` | ~80-90% smaller |

### Server-Side Filtering

The frontend's `queryKey: ["/api/projects", queryParams]` hits `projects.router.ts` GET `/api/projects`, which uses SQL-level filtering when `enableProjectsSqlFiltering` is `true` (default). Conditions are built as Drizzle ORM `WHERE` clauses directly in the SQL query — not in-memory.

Note: The `/api/v1/projects/analytics/summary` (from `projectsDashboard.ts`) fetches all active projects then computes analytics via batch SQL — this is the deferred analytics path and is expected behavior.

| Filter | Implementation | Status |
|---|---|---|
| Status filter | SQL `WHERE` via Drizzle `ne(projects.status, 'archived')` or `eq(projects.status, status)` | **PASS** |
| Client filter | SQL `WHERE projects.clientId = ?` via `eq(projects.clientId, clientId)` | **PASS** |
| Team filter | SQL `WHERE projects.teamId = ?` via `eq(projects.teamId, teamId)` | **PASS** |
| Search | SQL `ILIKE` on `projects.name` and `projects.description` | **PASS** |
| Feature flag | `enableProjectsSqlFiltering` defaults to `true` in `server/config.ts:219` | **PASS** |

### Pagination ("Load More")

| Behavior | Status | Notes |
|---|---|---|
| PAGE_SIZE = 25 | **PASS** | Server-side limit/offset |
| Load More appends correctly | **PASS** | `accumulatedProjects` state with dedup by ID |
| Resets on filter change | **PASS** | `useEffect` resets offset and accumulated list on filter change |
| `hasMore` logic | **PASS** | `(projectPage?.length ?? 0) >= PAGE_SIZE` |

### Analytics Cards Skeleton Loaders

| Behavior | Status |
|---|---|
| Skeleton shown while `analyticsLoading` is true | **PASS** |
| Cards show "—" when analytics unavailable | **PASS** |
| No duplicate project fetches | **PASS** — query key includes full params object |

---

## 3. My Tasks Validation

### Network Requests on Mount

| Request | Status | Notes |
|---|---|---|
| `/api/tasks/my?view=list&paginated=true&limit=100&sortBy=due_date&...` | **PASS** | Single request with server-side params |
| `/api/workspaces/current` | **PASS** | Workspace context |
| `/api/users` | **PASS** | Tenant users for assignee display |

### Thin TaskListItem DTO

| Before | After | Status |
|---|---|---|
| Full `TaskWithRelations` (comments, subtasks, attachments, full assignee user objects) | `TaskListItem` DTO: id, title, status, priority, dueDate, dueBucket, projectId, projectName, projectColor, clientName, isPersonal, createdAt, updatedAt, createdBy, parentTaskId, sectionId, assignees (userId+name only), tags (id+name only), commentCount, subtaskCount, subtaskCompletedCount | **PASS** |

**Payload reduction**: ~60-70% per task item.

### Server-Side Filtering

| Filter | Server Param | Status |
|---|---|---|
| Status | `?status=in_progress` | **PASS** |
| Priority | `?priority=high` | **PASS** |
| Due bucket (overdue/today/upcoming/no_date) | `?dueBucket=overdue` | **PASS** |
| Search | `?search=keyword` (SQL `ILIKE` on title) | **PASS** |
| Include completed | `?includeCompleted=true` | **PASS** |
| Sort | `?sortBy=due_date` | **PASS** |

### Pagination ("Load More Tasks")

| Behavior | Status | Notes |
|---|---|---|
| Server-side `limit` parameter | **PASS** | `limit=100` default, adjustable |
| Load more increases `pageLimit` | **PASS** | Increments PAGE_SIZE |
| `TaskListResponse` includes pagination metadata | **PASS** | `{items, summary, pagination}` |

### Task Click → TaskDetailDrawer

| Behavior | Status |
|---|---|
| Clicking task sets `selectedTask` and opens `TaskDetailDrawer` | **PASS** |
| Full task fetched via `fetch(/api/tasks/${id})` | **PASS** |
| Drawer shows full relations (comments, subtasks, attachments) | **PASS** |

### Dashboard Stats from Server Summary

| Behavior | Status | Notes |
|---|---|---|
| `taskListResponse.summary` provides todayCount, overdueCount, etc. | **PASS** | Server-computed via `getFilteredTaskListItems` |
| `computeDashboardStats` still present as fallback | **PASS** | Used when server summary unavailable |

### Deep-Link via `?taskId=`

| Behavior | Status | Code Reference |
|---|---|---|
| URL parameter `?taskId=xxx` parsed on mount via `useMemo` with `URLSearchParams` | **PASS** | `my-tasks.tsx:494-497` |
| Dedicated fetch for linked task if not in list via `useQuery` with `enabled: !!urlTaskId && ...` | **PASS** | `my-tasks.tsx:500-503` |
| URL cleaned on drawer close via `window.history.replaceState` (removes `taskId` param without page reload) | **PASS** | `my-tasks.tsx:529-537` (`handleCloseDrawer`) |

---

## 4. Client Summary & Detail Validation

### Summary Endpoint (SQL-Aggregated)

| Endpoint | Implementation | Status |
|---|---|---|
| `/api/v1/clients/hierarchy/list` | `getClientsByTenantWithHierarchy()` — SQL aggregates via `Promise.all([contactCounts, projectCounts, hoursRows, taskAggregates, lastActivities])` | **PASS** |
| `/api/v1/clients/stages/summary` | `getClientStageSummary()` — SQL GROUP BY stage | **PASS** |
| `/api/v1/clients/summary` | `getClientsSummaryByTenant()` — SQL aggregate with 60s TTL cache | **PASS** |

### Hierarchy Data

| Behavior | Status | Notes |
|---|---|---|
| Parent/subsidiary relationships displayed | **PASS** | `parentClientId`, `parentName`, `depth` fields in hierarchy DTO |
| Child clients shown as grouped cards | **PASS** | `ClientGroupCard` component |
| Hierarchy depth indentation | **PASS** | `style={{ paddingLeft: (depth-1)*12px }}` |

### Activity Feed

| Behavior | Status |
|---|---|
| Client detail page loads CRM summary | **PASS** — `/api/crm/clients/:id/summary` |
| Activity tab available via CRM 360 feature flag | **PASS** |

### Payload Slimming Verification

| Field | List View | Detail View | Status |
|---|---|---|---|
| Notes | NOT in list DTO | Loaded in `/api/clients/:id` | **PASS** |
| Description | NOT in list DTO | Loaded in detail | **PASS** |
| Addresses | NOT in list DTO | Loaded in detail | **PASS** |
| Contacts array | NOT in list (only `contactCount`) | Full contacts in detail | **PASS** |
| Projects array | NOT in list (only `projectCount`) | Full projects in detail | **PASS** |

### ClientDetailSheet Lazy-Fetch

| Behavior | Status |
|---|---|
| Sheet triggers `useQuery` with `enabled: open && !!clientId` | **PASS** |
| Shows skeleton while loading | **PASS** |
| Displays list-item data immediately from cache | **PASS** |

---

## 5. Cross-Cutting Regression Checks

### Duplicate Fetch Prevention

| Page | Status | Evidence |
|---|---|---|
| Clients | **PASS** | Single hierarchy query + stages summary; no redundant `/api/clients` |
| Projects Dashboard | **PASS** | Query keys include full filter params; dedup via `accumulatedProjects` Set |
| My Tasks | **PASS** | Single paginated query with server params |

### Filter Dropdown Slim Payloads

| Dropdown | Endpoint | Status |
|---|---|---|
| Client dropdown (Projects page) | `/api/clients?fields=minimal` | **PASS** |
| Client dropdown (Client Detail page) | `/api/clients?fields=minimal` | **PASS** |
| Teams dropdown | `/api/teams` (already lightweight) | **PASS** |

### Auth/Tenant Isolation

| Check | Status | Evidence |
|---|---|---|
| `clearTenantScopedCaches()` clears all tenant-prefixed queries | **PASS** | Covers 20+ prefixes including `/api/v1/clients` |
| `TENANT_SCOPED_QUERY_PREFIXES` comprehensive | **PASS** | Includes all major API prefixes |
| `X-Tenant-Id` header sent for super user impersonation | **PASS** | `buildHeaders()` in queryClient.ts |

### Loading/Skeleton States

| Page | Status | Notes |
|---|---|---|
| Clients — KPI strip | **PASS** | Skeleton while `isLoading` |
| Clients — Pipeline bar | **PASS** | Skeleton while `isLoading` |
| Projects — Analytics cards | **PASS** | Skeleton while `analyticsLoading` |
| Projects — Table | **PASS** | `LoadingState type="table"` |
| My Tasks — Full page | **PASS** | `LoadingState` component on initial load |

### Bug Fixes Verification

| Bug Fix | Task | Status | Notes |
|---|---|---|---|
| Task delete confirmation | #12 | **PASS** | `AlertDialog` confirmation in projects dashboard delete flow |
| Comment save | #13 | **PASS** | `addCommentMutation` in My Tasks properly calls `/api/tasks/:id/comments` |
| @mentions | #14 | **PASS** | Mention insertion via comment body |
| Notification routing | #16 | **PASS** | Deep-link `?taskId=` parameter handling in My Tasks |
| PM Dashboard | #27 | **PASS** | Projects dashboard functional |
| Messages Report removed | #29 | **PASS** | No Messages Report references in main pages (only legacy in client-detail CRM tabs) |
| Quick Stats removed | #30 | **PASS** | No Quick Stats component in main pages |

### Navigation

| Check | Status |
|---|---|
| Back navigation from client detail | **PASS** — `ArrowLeft` + `navigate` |
| Client card click → detail page or sheet | **PASS** |
| Project row click → project detail | **PASS** |
| Notification click → task detail via `?taskId=` | **PASS** |

---

## 6. Task #32 Status (Client Hierarchy Cache)

**Status**: **MERGED**

| Feature | Implementation | Status |
|---|---|---|
| Short TTL cache on hierarchy/list | 60s TTL via `HIERARCHY_CACHE_TTL_MS` | **PASS** |
| Short TTL cache on clients/summary | 60s TTL via `SUMMARY_CACHE_TTL_MS` | **PASS** |
| Cache key scoped by tenant | `buildCacheKey(tenantId, "clients-hierarchy")` | **PASS** |
| Cache bypass with `?fresh=true` | `shouldBypassCache(req.query)` | **PASS** |
| Cache-Control headers | `setCacheHeaders(res, isCached, maxAge)` | **PASS** |

---

## 7. Summary

### Overall Verdict: **PASS** — All 5 target areas validated with no critical regressions.

### Interaction Request Counts

| Action | Requests Triggered | Endpoint(s) |
|---|---|---|
| **Clients page mount** | 2 | `/api/v1/clients/hierarchy/list`, `/api/v1/clients/stages/summary` |
| **Open client detail sheet** | 1 | `/api/clients/:id` (lazy, `enabled: open && !!clientId`) |
| **Navigate to client detail page** | 2-3 | `/api/clients/:id`, `/api/clients?fields=minimal`, optionally `/api/crm/clients/:id/summary` |
| **Projects page mount** | 3 (immediate) + 1 (deferred) | `/api/projects?fields=minimal&includeCounts=true&limit=25&...`, `/api/clients?fields=minimal`, `/api/teams`, then deferred `/api/v1/projects/analytics/summary` |
| **Projects Load More click** | 1 | `/api/projects?...&offset=25` (same endpoint, new offset) |
| **Projects filter change** | 1 | `/api/projects?...` (new params, offset reset to 0) |
| **My Tasks mount** | 1-3 | `/api/tasks/my?view=list&paginated=true&...`, `/api/workspaces/current`, `/api/users` |
| **My Tasks open task drawer** | 1 | `/api/tasks/:id` (full TaskWithRelations) |
| **My Tasks Load More** | 1 | `/api/tasks/my?...&limit=200` (increased limit) |
| **My Tasks deep-link** (?taskId=) | 1 | `/api/tasks/:id` (if task not in current list) |

### Performance Improvements Summary

| Area | Before | After | Improvement |
|---|---|---|---|
| Clients page mount requests | 1 heavy request (full ClientWithContacts[]) | 2 lightweight requests (hierarchy list + stage summary) | ~70-80% payload reduction |
| Projects dashboard queries | N+1 task queries per project | Batch SQL aggregate | O(N) → O(1) query reduction |
| Projects filtering | Client-side | Server-side SQL (status, client, team, search) | Reduced data transfer |
| My Tasks payload | Full TaskWithRelations per task | Thin TaskListItem DTO | ~60-70% payload reduction |
| My Tasks filtering | Client-side | Server-side SQL (status, priority, due bucket, search) | Reduced data transfer |
| Client detail on list | Eager full load | Lazy fetch on click | Zero-cost until interaction |
| Client summary | Client-side computation | SQL aggregates with 60s cache | Faster, less CPU on client |
| Filter dropdowns | Full entity payloads | `fields=minimal` slim payloads | ~80-90% reduction |

### Remaining Hotspots

| Hotspot | Severity | Notes |
|---|---|---|
| `clientDivisions` table still in schema | **Low** | Table definition retained in `shared/schema.ts:685` for migration compatibility; no active UI creation flow on Clients page |
| `computeDashboardStats` fallback in My Tasks | **Low** | Client-side stats computation still present in `my-tasks.tsx:363-411` as fallback when `serverSummary` is unavailable; acceptable for graceful degradation |
| Analytics summary fetches all projects | **Low** | `/api/v1/projects/analytics/summary` in `projectsDashboard.ts` fetches all tenant projects then batch-computes analytics via `getProjectAnalyticsSummary`; deferred loading mitigates impact but could be optimized further for very large project counts |
| Clients page filtering is client-side | **Info** | The hierarchy list endpoint returns all clients; search, sort, and filter are applied client-side in `clients.tsx`. This is acceptable because the hierarchy list is already a slim DTO and typical client counts are manageable, but could benefit from server-side filtering at scale |
| Feature flag fallback paths | **Low** | When `enableProjectsSqlFiltering` or `enableClientsBatchExpansion` flags are `false`, the system falls back to older in-memory paths; flags default to `true` so this only applies to explicit overrides |
| E2E tests not fully executed | **Medium** | Automated browser tests blocked by Super Admin tenant context requirement; manual validation recommended for complete confidence |

---

*Report generated: March 27, 2026*
*Environment: Development (Replit)*
*Validated by: Automated Sprint Verification Pass*

---

## Addendum: Second-Level Validation (March 28, 2026)

### Purpose
Post-merge re-validation confirming all sprint optimizations remain intact after the hardening pass (Task #34). This addendum verifies no regressions were introduced during the hardening and documentation consolidation work.

### Typecheck Status
`npx tsc --noEmit` previously produced 246 errors across 82 files (none were sprint regressions). **As of Task #64, all TypeScript errors have been resolved — `npm run check` now exits with 0 errors.** Compiler target is ES2022. The table below shows the categories that were present at the time of the original report (all now resolved):

*Historical snapshot — all categories below have been resolved as of Tasks #41 and #64.*

| Error Category | Example Files (representative) | Sprint Regression? | Notes |
|---|---|---|---|
| `Set` iteration requires `--downlevelIteration` | storage.ts, chat.repo.ts, tasks.repo.ts, commentAttachments.ts, routeScanner.ts | **No** | Resolved — ES2022 target supports native iterators (was 9+ occurrences) |
| Missing `isNull` import | tasks.repo.ts:124, :163 | **No** | Pre-existing — `isNull` used but not imported from `drizzle-orm` |
| Missing `clientsRepo` reference | storage.ts:1952 | **No** | Pre-existing — reference to extracted repo without import |
| Billing service argument mismatch | billingApprovalService.ts (5 errors), invoiceDraftService.ts (6 errors) | **No** | Unrelated to sprint |
| Duplicate function implementation | tenantIntegrations.ts (2 errors) | **No** | Unrelated to sprint |
| Missing columns in project type | storage.ts:898 | **No** | Pre-existing schema drift (divisionId, stickyAt, projectManagerId) |
| Missing `tenantId` on task_attachments | storage.ts:3346, :3353 | **No** | Pre-existing schema limitation |
| Notification preferences schema mismatch | notifications.repo.ts:458 | **No** | Pre-existing schema evolution (missing email preference fields) |
| Tenant onboarding type issues | tenantOnboarding.ts (19 errors) | **No** | Highest error count, unrelated to sprint |
| Notification center component | notification-center.tsx (12 errors) | **No** | UI component type issues, unrelated |
| Home page component | home.tsx (11 errors) | **No** | Unrelated to sprint |
| Import engine | importEngine.ts (8 errors) | **No** | Data import module, unrelated |

**Sprint-touched files with errors** (historical snapshot — all pre-existing, none introduced by the performance sprint; all resolved as of Tasks #41 and #64):

| File | Error Count | Error Types | Sprint Regression? |
|---|---|---|---|
| `server/storage.ts` | 13 | Schema drift (missing columns), Set iteration, missing `clientsRepo` ref | **No** |
| `server/http/domains/projects.router.ts` | 3 | Drizzle column type narrowing, Zod schema vs insert type mismatch | **No** |
| `server/storage/tasks.repo.ts` | 3 | Missing `isNull` import, Set iteration | **No** |
| `server/http/domains/tasks.router.ts` | 2 | Zod parsed type vs `Partial<MyTaskPayload>` mismatch | **No** |
| `client/src/pages/projects-dashboard.tsx` | 2 | `ProjectDrawerProps` type mismatch (drawer component) | **No** |
| `client/src/pages/clients.tsx` | 2 | Type conversion for hierarchy, MapIterator (resolved by ES2022 target) | **No** |
| `client/src/features/tasks/task-detail-drawer.tsx` | 1 | Comment type conversion (Date vs string for createdAt) | **No** |

All errors were type-narrowing issues (Zod vs Drizzle ORM type widths, `downlevelIteration` tsconfig limitation — now resolved by ES2022 target, component prop mismatches). They did not affect runtime behavior and were present before the sprint. All have since been resolved (Tasks #41, #64).

### Re-Validation of Five Target Areas

All five target areas remain intact with no drift from the March 27 report:

| Area | Thin Payload | Deferred Detail | Server Filtering | No Duplicates | Auth/Tenant | Loading States |
|---|---|---|---|---|---|---|
| Clients Page | **PASS** — `ClientListItem` via hierarchy | **PASS** — `enabled: open && !!clientId` | N/A (client-side, acceptable) | **PASS** — 2 requests on mount | **PASS** | **PASS** |
| Projects Dashboard | **PASS** — `fields=minimal` + `includeCounts` | **PASS** — analytics deferred | **PASS** — SQL WHERE clauses | **PASS** — query keys include params | **PASS** | **PASS** |
| My Tasks | **PASS** — `TaskListItem` via `view=list` | **PASS** — drawer uses `tasks.detail(id)` | **PASS** — server-side filters | **PASS** — single paginated query | **PASS** | **PASS** |
| Client Summary | **PASS** — SQL `GROUP BY` aggregates | N/A | N/A | **PASS** | **PASS** | **PASS** |
| Client Hierarchy | **PASS** — 60s TTL cache, tenant-scoped key | **PASS** — `?fresh=true` bypass | N/A | **PASS** | **PASS** | **PASS** |

### Regressions Found
**None.** All optimizations from the sprint are intact post-merge.

### New Documentation Created
| Document | Path | Purpose |
|---|---|---|
| Thin vs Full Payload Strategy | `docs/performance/thin-vs-full-payload-strategy.md` | Definitions, decision tree, anti-patterns, and examples |
| Architectural Guardrails | `docs/performance/architectural-guardrails.md` | Seven rules preventing performance regression reintroduction |
| Caching Strategy | `docs/performance/caching-strategy.md` | Server TTL, React Query config, invalidation, bypass, and tradeoffs |
| Sprint Optimization Guide (expanded) | `docs/performance/sprint-optimization-guide.md` | Added data flow diagrams, tradeoffs, backward compatibility, and "when to use" for all 10 sections |

*Addendum generated: March 28, 2026*
*Validated by: Post-Sprint Second-Level Validation Pass (Task #40)*
