# Sprint 50 — Summary & Remaining Follow-Ups

**Date**: March 30, 2026
**Scope**: 50 merged tasks covering SQL-first aggregation, thin DTO strategy, tenant-aware caching, performance observability, and bug fixes.
**TypeScript Status**: `npm run check` passes with zero errors.

---

## Table of Contents

1. [TypeScript Stabilization Status](#1-typescript-stabilization-status)
2. [Typecheck CI/CD Policy](#2-typecheck-cicd-policy)
3. [Compiler Target / Runtime Compatibility](#3-compiler-target--runtime-compatibility)
4. [Tenant Integration Secret Handling](#4-tenant-integration-secret-handling)
5. [SQL-First Aggregation Strategy](#5-sql-first-aggregation-strategy)
6. [Staging Performance Profiling](#6-staging-performance-profiling)
7. [My Time Stats Aggregation](#7-my-time-stats-aggregation)
8. [Paginated Time Entries Contract](#8-paginated-time-entries-contract)
9. [Time Entry List DTO vs Detail DTO](#9-time-entry-list-dto-vs-detail-dto)
10. [My Time Targeted Cache Invalidation](#10-my-time-targeted-cache-invalidation)
11. [Lightweight Picker Endpoint Guidance](#11-lightweight-picker-endpoint-guidance)
12. [Shared My Time Cascade Hook Pattern](#12-shared-my-time-cascade-hook-pattern)
13. [Cross-Domain List DTO vs Detail DTO Strategy](#13-cross-domain-list-dto-vs-detail-dto-strategy)
14. [Tenant-Aware Query Key Strategy](#14-tenant-aware-query-key-strategy)
15. [Domain Cache Profile Guidance](#15-domain-cache-profile-guidance)
16. [Scheduler / Worker Separation Plan](#16-scheduler--worker-separation-plan)
17. [Endpoint Performance Visibility / Budgets](#17-endpoint-performance-visibility--budgets)
18. [Sprint Summary + Remaining Follow-Ups](#18-sprint-summary--remaining-follow-ups)

---

## 1. TypeScript Stabilization Status

### Purpose
Track the health of the TypeScript type system across the full-stack codebase (client + server + shared).

### Before vs After
- **Before**: Multiple TS errors accumulated across sprint work — `IStorage` interface missing paginated time entry methods, `projects.router.ts` had `SelectedFields` type incompatibility.
- **After**: Zero TS errors. `npm run check` (which runs `tsc --noEmit`) passes cleanly.

### Technical Notes
- **Fixed**: `server/storage.ts` — Added three missing paginated methods to both the `IStorage` interface and `DatabaseStorage` class: `getTimeEntriesByWorkspaceFlatPaginated`, `getTimeEntriesByUserFlatPaginated`, `getTimeEntriesByTenantFlatPaginated`.
- **Fixed**: `server/http/domains/projects.router.ts` — Resolved `SelectedFields` type incompatibility by refactoring the conditional select into separate typed query branches (picker, minimal, full) — each branch constructs its own `db.select({...}).from(projects)` call so Drizzle infers valid field types without casts.
- **Added**: `lt` and `count` imports to `server/storage.ts` for cursor-based pagination support.

### API / DTO / Query Key Impact
- No API contract changes. The paginated storage methods implement the existing endpoint contract defined in `server/http/domains/time/entries.routes.ts`.
- Query keys unchanged: `queryKeys.timeEntries.paginated` and `queryKeys.timeEntries.list`.

### Frontend Guidance
- No frontend changes required. The paginated methods are consumed by existing route handlers transparently.

### Backward Compatibility
- Fully backward compatible. Non-paginated endpoints continue to work unchanged.

### Constraints / Tradeoffs
- None. This was a pure type-correctness fix.

### Follow-Up
- None required. TypeScript check is green.

---

## 2. Typecheck CI/CD Policy

### Purpose
Ensure `npm run check` (TypeScript compilation) is enforced as a CI gate.

### Before vs After
- **Before**: No formal CI pipeline enforcing typecheck; errors could accumulate across sprints.
- **After**: `package.json` script `"check": "tsc"` exists. Railway deploy smoke check (`server/scripts/deploy-smoke.cjs`) validates build artifacts and environment but does not run typecheck at deploy time (typecheck is a build-time concern).

### Technical Notes
- `tsconfig.json` uses `"noEmit": true` — the `check` script validates types without producing output.
- Build step (`npm run build`) compiles via Vite + esbuild, which does NOT enforce TS types. Typecheck must be run separately.

### API / DTO / Query Key Impact
- No impact. This is a build-tooling concern only.

### Frontend Guidance
- Always run `npm run check` before merging. The Railway deploy flow is: `npm run build` → `deploy-smoke.cjs` → `npm run start`. Typecheck is not part of deploy and must be enforced earlier.

### Backward Compatibility
- No compatibility concerns.

### Constraints / Tradeoffs
- Typecheck is not enforced at deploy time — only at development/CI time.

### Follow-Up
- Add `npm run check` as a pre-build step or CI gate when a formal CI system is configured.

---

## 3. Compiler Target / Runtime Compatibility

### Purpose
Document the TypeScript compilation target and its alignment with the deployment runtime.

### Before vs After
- **Before**: Target was not explicitly documented.
- **After**: `tsconfig.json` confirms `"target": "ES2022"`.

### Technical Notes
- **Target**: `ES2022` — enables native `Array.at()`, `Object.hasOwn()`, `Error.cause`, top-level `await`, and class fields.
- **Module**: `ESNext` with `"moduleResolution": "bundler"`.
- **Runtime**: Node.js 18+ required (enforced by `deploy-smoke.cjs` which checks `process.version`).
- **Lib**: `["esnext", "dom", "dom.iterable"]` — includes DOM types for shared code used by both client and server.

### API / DTO / Query Key Impact
- No impact. Compilation target affects emitted JS features, not API shapes.

### Frontend Guidance
- The Vite build targets modern browsers. No polyfills needed for ES2022 features.

### Backward Compatibility
- ES2022 is fully supported by Node.js 18+ and all modern browsers targeted by the Vite build.

### Constraints / Tradeoffs
- Node.js 16 or earlier is not supported due to ES2022 target.

### Follow-Up
- None. Configuration is stable.

---

## 4. Tenant Integration Secret Handling

### Purpose
Document how tenant integration secrets (API keys, tokens) are encrypted, stored, and decrypted.

### Before vs After
- **Before**: Decryption logic was scattered; risk of multiple implementations.
- **After**: Single decryption path via `TenantIntegrationService.getDecryptedSecrets()` in `server/services/tenantIntegrations.ts`.

### Technical Notes
- **Encryption**: `encryptValue()` / `decryptValue()` from `server/lib/encryption.ts` using AES-256-GCM.
- **Storage**: Secrets stored in `tenant_integrations.config_encrypted` column as an encrypted JSON blob.
- **Access**: `getDecryptedSecrets<T>(tenantId, provider)` returns typed secret config or `null`.
- **Internal method**: `_decryptSecretConfig()` is the private implementation called by public methods.
- **Callers**: `testIntegration()`, `testMailgun()`, `sendEmail()`, and OpenAI integration test all use `getDecryptedSecrets()`.

### API / DTO / Query Key Impact
- No public API changes. Secrets are never exposed in API responses — only `secretConfigured: boolean` flag is returned.

### Frontend Guidance
- No frontend access to secrets. Integration status is displayed via the `secretConfigured` boolean from the integration list endpoint.

### Backward Compatibility
- No changes to the encryption format or API surface.

### Constraints / Tradeoffs
- Encryption key must be available in the environment. Key rotation requires re-encrypting all stored secrets.

### Follow-Up
- Proposed task #54 exists for any remaining consolidation cleanup of secret handling patterns.

---

## 5. SQL-First Aggregation Strategy

### Purpose
Replace N+1 JavaScript-side aggregation with single SQL queries using `GROUP BY`, `COUNT`, `SUM`, and `CASE WHEN`.

### Before vs After
- **Before**: Client list, project dashboard analytics, and client summary computed aggregates in JS by loading full entity arrays.
- **After**: 
  - **Clients**: `/api/v1/clients/hierarchy/list` returns `ClientListItem` with SQL-aggregated `contactCount`, `projectCount`, `openTasksCount`, `totalHoursWorked`, `lastActivityAt`.
  - **Projects Dashboard**: `/api/v1/projects/analytics/summary` returns SQL-aggregated project analytics.
  - **Client Summary**: `/api/v1/clients/stages/summary` returns `{stage, clientCount, projectCount}[]` via SQL `GROUP BY`.

### Technical Notes
- Time tracking aggregation uses SQL `SUM` with `CASE WHEN` for billable/unbillable breakdowns (see `TimeTrackingRepository.getAggregatedPeriodTotals()`).
- See `docs/performance/sql-first-aggregation.md` for detailed pattern guidance.

### API / DTO / Query Key Impact
- New endpoints: `/api/v1/clients/hierarchy/list`, `/api/v1/clients/stages/summary`, `/api/v1/projects/analytics/summary`.
- New DTOs: `ClientListItem` (shared/schema.ts).
- Query keys: `queryKeys.clients.hierarchy`, `queryKeys.clients.stagesSummary`, `queryKeys.projects.analyticsSummary`.

### Frontend Guidance
- Use `queryKeys.clients.hierarchy` for the client list page instead of `queryKeys.clients.all`.
- Use `queryKeys.clients.stagesSummary` for the pipeline/stage summary widget.

### Backward Compatibility
- Old endpoints remain available. New SQL-first endpoints are used by updated frontend components. No breaking changes.

### Constraints / Tradeoffs
- SQL aggregation queries may be slower on very large datasets without proper indexes. Indexes on `tenant_id`, `workspace_id`, `client_id`, `project_id` exist.

### Follow-Up
- **Workload reports** (#55): SQL-first workload analytics — deferred to proposed tasks.
- **My Time stats** (#56): SQL-first My Time statistics — deferred to proposed tasks.

---

## 6. Staging Performance Profiling

### Purpose
Enable runtime performance measurement in staging/development environments.

### Before vs After
- **Before**: No structured performance telemetry.
- **After**: Multi-layer observability stack:
  - `perfTelemetry.ts` — request-level slow request detection (gated by `PERF_TELEMETRY=1`)
  - `queryTelemetry.ts` — SQL query-level slow query detection (gated by `PERF_TELEMETRY=1`)
  - `perfLogger.ts` — sampled request logging with hot-path awareness
  - `requestLogger.ts` — comprehensive request logging with budget checking
  - `payloadGuard.ts` — response payload size monitoring (gated by `ENABLE_PAYLOAD_GUARDS`)
  - `perfBudgets.ts` — P95 latency and payload budgets per endpoint
  - `dbTimer.ts` — per-request DB query count and duration tracking
  - `client/src/lib/perf.ts` — client-side navigation and chunk load timing

### Technical Notes
- All telemetry is **warning-only** — never blocks or fails requests.
- `PERF_TELEMETRY=1` enables server-side request/query telemetry.
- `VITE_PERF_TELEMETRY=1` enables client-side perf beacon to `/api/v1/system/perf`.
- Hot paths (notifications, heartbeat, flags) are sampled at 1% in production.

### API / DTO / Query Key Impact
- Client-side perf beacon posts to `POST /api/v1/system/perf` (best-effort, no guaranteed persistence).

### Frontend Guidance
- Use `usePerfTiming(viewName)` hook in page components to track navigation timing.
- Use `trackChunkLoad(viewName, importFn)` wrapper for lazy-loaded routes.

### Backward Compatibility
- All telemetry is additive and opt-in. No existing behavior changed.

### Constraints / Tradeoffs
- Telemetry adds minor overhead per request. Hot-path sampling mitigates this in production.
- Client-side perf data is best-effort — no guaranteed delivery or persistence.

### Follow-Up
- Enhanced endpoint-level visibility (#57/#68) — dashboards, percentile tracking, and alerting.

---

## 7. My Time Stats Aggregation

### Purpose
Document the current state of My Time statistics aggregation and planned improvements.

### Before vs After
- **Before**: Stats computed in JavaScript by loading all time entries and reducing.
- **After**: SQL-first aggregation via `getAggregatedPeriodTotals()` and `getDailyBreakdown()`.

### Technical Notes
- **Endpoint**: `GET /api/time-entries/my/stats` (registered in `queryKeys.timeEntries.myStats`).
- **Aggregation**: `TimeTrackingRepository.getAggregatedPeriodTotals()` uses SQL `SUM` with `CASE WHEN` for period-based totals (today, this week, this month, all time).
- **Scope breakdown**: Billable vs unbillable split computed in SQL using `scope = 'out_of_scope'` check.
- **Daily breakdown**: `getDailyBreakdown()` uses SQL `GROUP BY to_char(start_time, 'YYYY-MM-DD')`.

### API / DTO / Query Key Impact
- Endpoint: `GET /api/time-entries/my/stats`.
- Query key: `queryKeys.timeEntries.myStats` → `["/api/time-entries/my/stats"]`.
- Response includes `PeriodTotals` (`total`, `billable`, `unbillable`) per period.

### Frontend Guidance
- Use `queryKeys.timeEntries.myStats` with `tenantKey()` wrapping for cache invalidation.
- Stats are invalidated alongside time entry mutations via `invalidateTimeEntries({ includeStats: true })`.

### Backward Compatibility
- Response shape unchanged from previous sprint. Internal implementation moved to SQL.

### Constraints / Tradeoffs
- Stats are computed on every request (no server-side caching). Frontend caching via `staleTime` provides the primary optimization.

### Follow-Up
- My Time stats refinement (#56) — additional stat types and period comparisons.

---

## 8. Paginated Time Entries Contract

### Purpose
Document the cursor-based pagination contract for time entry endpoints.

### Before vs After
- **Before**: All time entries returned in a single unbounded response.
- **After**: Optional cursor-based pagination available. Frontend uses paginated mode for "all" and "month" date filters.

### Technical Notes
- **Pagination is implemented** in the storage layer (`DatabaseStorage`) with stable composite cursors.
- **Endpoints**: `GET /api/time-entries` and `GET /api/time-entries/my` support optional pagination via `?limit=N&cursor=CURSOR_STRING`.
- **Response shape** (when paginated):
  ```json
  {
    "items": [...TimeEntryListItem],
    "hasMore": boolean,
    "nextCursor": "ISO-8601_TIMESTAMP|ENTRY_ID" | null,
    "totalCount": number
  }
  ```
- **Cursor format**: Composite `startTime|id` cursor for stable pagination — prevents skipped/duplicated entries when multiple entries share the same timestamp. Ordering is `(startTime DESC, id DESC)`.
- **Backward compatibility**: Plain ISO-8601 timestamps (without `|id`) are also accepted as cursors.
- **Limit**: Clamped to `[1, 50]`.
- **Without pagination**: Returns flat array of all matching entries (legacy behavior preserved).

### API / DTO / Query Key Impact
- Endpoints: `GET /api/time-entries?limit=N&cursor=CURSOR`, `GET /api/time-entries/my?limit=N&cursor=CURSOR`.
- DTO: `TimeEntryListItem` for paginated items.
- Query keys: `queryKeys.timeEntries.paginated` → `["/api/time-entries", "paginated"]`.
- `timeEntryQueryKeyForFilter()` selects the appropriate key based on date filter.

### Frontend Guidance
- Use `useInfiniteQuery` with `queryKeys.timeEntries.paginated` for paginated views.
- Use `timeEntryQueryKeyForFilter(dateFilter)` to determine the correct query key.
- Optimistic updates use `optimisticInsertTimeEntry()` / `optimisticRemoveTimeEntry()` which handle both paginated and flat caches.

### Backward Compatibility
- Fully backward compatible. Without `?limit` parameter, endpoints return full array as before.

### Constraints / Tradeoffs
- `totalCount` requires a separate count query, adding one extra DB round-trip per paginated request.
- Cursor-based pagination does not support random page access (offset-based) — only forward iteration.

### Follow-Up
- Full pagination migration (#60) — make pagination the default for all date filters.

---

## 9. Time Entry List DTO vs Detail DTO

### Purpose
Document the dual DTO strategy for time entries — lightweight list items vs full enriched entries.

### Before vs After
- **Before**: All time entry endpoints returned the full `TimeEntryWithRelations` with nested objects.
- **After**: List endpoints return `TimeEntryListItem` (flat names); detail endpoints return `TimeEntryWithRelations` (nested objects).

### Technical Notes
- **List DTO** (`TimeEntryListItem`): Flat DTO with denormalized name fields (`userName`, `clientName`, `projectName`, `taskTitle`). Used for list views.
- **Detail DTO** (`TimeEntryWithRelations`): Full entity with nested relation objects (`user?: User`, `client?: Client`, `project?: Project`, `task?: Task`). Used for detail views and editing.
- **List path**: `getTimeEntriesByWorkspaceFlat()` / `getTimeEntriesByTenantFlat()` → `fetchAndFlattenEntries()` (fetches only `id`+`name` from related tables).
- **Detail path**: `getTimeEntriesByWorkspace()` / `getTimeEntriesByTenant()` → `batchEnrichEntries()` (fetches full related entities).

### API / DTO / Query Key Impact
- Selection: Frontend uses `?fields=list` query parameter to request flat DTO.
- Query key: `queryKeys.timeEntries.list` → `["/api/time-entries", { fields: "list" }]`.
- DTO types defined in `shared/schema.ts`: `TimeEntryListItem`, `TimeEntryWithRelations`.

### Frontend Guidance
- Use `queryKeys.timeEntries.list` for table/list views.
- Use `queryKeys.timeEntries.all` (without `fields=list`) only when you need full nested relation objects.

### Backward Compatibility
- Without `?fields=list`, endpoints return the original `TimeEntryWithRelations` format.

### Constraints / Tradeoffs
- List DTO requires separate lookup queries for names (batched, not N+1). Payload is ~60-70% smaller.

### Follow-Up
- Lean list DTO refinement (#61) — further reduce list DTO payload.

---

## 10. My Time Targeted Cache Invalidation

### Purpose
Document how time entry cache invalidation works with tenant-scoped query keys.

### Before vs After
- **Before**: Simple `invalidateQueries` on the entire time entries key — over-invalidated all caches on any change.
- **After**: Targeted invalidation by date filter, task ID, and stats; optimistic updates for responsive UI.

### Technical Notes
- **Invalidation helpers** in `client/src/lib/queryKeys.ts`:
  - `invalidateTimeEntries()` — invalidates time entry list/paginated queries and optionally stats and task-scoped entries.
  - `invalidateTimeEntryCaches()` — broader invalidation including timer queries.
- **Optimistic updates**: `optimisticInsertTimeEntry()`, `optimisticUpdateTimeEntry()`, `optimisticRemoveTimeEntry()` provide instant UI feedback.
- **Broad insert**: `optimisticInsertTimeEntryBroad()` inserts into all matching date filter caches.
- **Rollback**: `rollbackTimeEntryCache()` restores previous data on mutation failure.
- **Cross-tab sync**: `broadcastTimeEntryChanged()` uses BroadcastChannel + localStorage for cross-tab invalidation.

### API / DTO / Query Key Impact
- Query keys affected: `queryKeys.timeEntries.all`, `queryKeys.timeEntries.list`, `queryKeys.timeEntries.paginated`, `queryKeys.timeEntries.myStats`, `queryKeys.timeEntries.byTask(taskId)`.
- All invalidation calls wrap keys with `tenantKey()`.

### Frontend Guidance
- Use `invalidateTimeEntries({ dateFilter, includeStats: true, taskId })` for targeted invalidation after mutations.
- Use `invalidateTimeEntryCaches({ taskId, includeTimer: true })` for broader invalidation (e.g., timer stop).
- Always call `broadcastTimeEntryChanged()` after mutations for cross-tab consistency.

### Backward Compatibility
- Broader invalidation still works. `invalidateTimeEntryCaches()` invalidates all time entry keys.

### Constraints / Tradeoffs
- Optimistic updates assume mutation will succeed. Rollback logic handles failures but may cause brief UI flicker.
- Cross-tab sync via BroadcastChannel is best-effort (not supported in all browsers).

### Follow-Up
- Targeted invalidation refinement (#59) — more granular cache invalidation patterns.

---

## 11. Lightweight Picker Endpoint Guidance

### Purpose
Document the pattern for lightweight "picker" endpoints that return minimal data for dropdowns/selects.

### Before vs After
- **Before**: Dropdowns/selects fetched the full entity list (all fields, nested objects).
- **After**: Picker queries select only the fields needed for display (id, name, status).

### Technical Notes
- **Projects picker**: `queryKeys.projects.picker` → `["/api/projects", { fields: "picker" }]` returns `{ id, name, clientId, status }` only.
- **Clients minimal**: `queryKeys.clients.minimal` → `["/api/clients", { fields: "minimal" }]` returns `{ id, companyName, displayName, status, parentClientId }`.
- **Pattern**: Backend checks `req.query.fields` and selects only necessary columns from DB using `db.select({ id, name, ... }).from(table)`.

### API / DTO / Query Key Impact
- Endpoints: `GET /api/projects?fields=picker`, `GET /api/clients?fields=minimal`.
- Query keys: `queryKeys.projects.picker`, `queryKeys.clients.minimal`.
- Response is 80-90% smaller than full entity responses.

### Frontend Guidance
- Use picker query keys for dropdown/select/autocomplete components.
- Use full entity query keys only for detail views, editing, or when you need all fields.

### Backward Compatibility
- Without `?fields=` parameter, endpoints return the full entity as before.

### Constraints / Tradeoffs
- Each new picker field set requires a backend code path. No generic field selection mechanism exists.

### Follow-Up
- Picker endpoint formalization (#62) — standardize picker pattern across all domains.

---

## 12. Shared My Time Cascade Hook Pattern

### Purpose
Document cascade mutation patterns where a time entry change triggers related cache updates.

### Before vs After
- **Before**: Each mutation handler independently decided which caches to invalidate, leading to inconsistency.
- **After**: Centralized cascade logic in `invalidateTimeEntries()` and `invalidateTimeEntryCaches()` in `queryKeys.ts`.

### Technical Notes
- When a time entry is created/updated/deleted:
  1. Time entry list caches are invalidated (by date filter)
  2. My Time stats cache is invalidated
  3. Task-specific time entry cache is invalidated (if `taskId` provided)
  4. Timer cache is optionally invalidated
  5. Cross-tab broadcast sent
- This logic is centralized in `invalidateTimeEntries()` and `invalidateTimeEntryCaches()` in `queryKeys.ts`.

### API / DTO / Query Key Impact
- Cascade touches: `queryKeys.timeEntries.*`, `queryKeys.timer.current`, `queryKeys.tasks.timeEntries(taskId)`.

### Frontend Guidance
- Call `invalidateTimeEntries()` or `invalidateTimeEntryCaches()` in mutation `onSuccess` callbacks.
- Do not manually invalidate individual time entry query keys — use the centralized helpers.

### Backward Compatibility
- No breaking changes. The centralized helpers replace scattered inline invalidation.

### Constraints / Tradeoffs
- Cascade invalidation is eager — it invalidates even if the mutation didn't affect the specific cache. This is safe but may cause unnecessary refetches.

### Follow-Up
- Cascade hook extraction (#63) — extract into a reusable `useTimeEntryCascade()` hook.

---

## 13. Cross-Domain List DTO vs Detail DTO Strategy

### Purpose
Document the broader DTO strategy applied across all domains — thin list DTOs for collections, full DTOs for detail views.

### Before vs After
- **Before**: All endpoints returned full entity objects with nested relations for both list and detail views.
- **After**: List endpoints return thin DTOs with denormalized display fields; detail endpoints return full objects.

### Technical Notes

| Domain | List DTO | Detail DTO | Status |
|--------|----------|------------|--------|
| Clients | `ClientListItem` (SQL-aggregated counts) | `ClientWithContacts` (full with contacts, addresses) | Active |
| Tasks | `TaskListItem` (denormalized names) | Full `Task` with relations | Active |
| Projects | Picker: `{id, name, clientId, status}` | Full `Project` | Active |
| Time Entries | `TimeEntryListItem` (flat names) | `TimeEntryWithRelations` (nested objects) | Active |

- List DTOs are designed for table/list rendering — they include display names but not nested objects.
- Detail DTOs include full relational data for editing, detail sheets, and forms.
- The `?fields=list` or `?fields=minimal` or `?fields=picker` query parameter selects the DTO tier.

### API / DTO / Query Key Impact
- DTOs defined in `shared/schema.ts`: `ClientListItem`, `TaskListItem`, `TimeEntryListItem`.
- Query keys follow convention: `queryKeys.{domain}.all` for full, `queryKeys.{domain}.minimal`/`.picker`/`.list` for thin.

### Frontend Guidance
- Use list/minimal/picker query keys for list views and tables.
- Use detail query keys (e.g., `queryKeys.clients.detail(id)`) only when showing full entity details.

### Backward Compatibility
- All endpoints support the original full response when `?fields` is omitted.

### Constraints / Tradeoffs
- Two DTO tiers per domain increases the number of types to maintain but significantly reduces payload sizes.

### Follow-Up
- Cross-domain DTO standardization (#66) — formalize naming conventions and consistent field selection patterns.

---

## 14. Tenant-Aware Query Key Strategy

### Purpose
Document how frontend query keys are scoped to the active tenant to prevent cross-tenant cache pollution.

### Before vs After
- **Before**: Query keys were flat strings like `["/api/clients"]` — switching tenants could serve stale cached data from the previous tenant.
- **After**: `tenantKey()` wrapper prepends `["tenant", tenantId, ...]` to all tenant-scoped query keys.

### Technical Notes
- **`tenantKey()`** in `client/src/lib/queryClient.ts`:
  - If `_effectiveTenantId` is set, prefixes key with `["tenant", tenantId]`
  - Super-scoped keys (`/api/v1/super/...`) are never prefixed
  - If no tenant ID (pre-login), returns key unchanged
- **`clearTenantScopedCaches()`**: Removes all `["tenant", ...]` prefixed queries AND fallback un-prefixed `/api` queries (for migration safety).
- **`clearSuperScopedCaches()`**: Removes super-scoped queries when entering tenant mode.
- **`buildUrlFromQueryKey()`**: Strips the `["tenant", tenantId]` prefix before constructing the fetch URL.
- **`setEffectiveTenantId()`**: Called by `useAppMode()` whenever the effective tenant changes.

### API / DTO / Query Key Impact
- All tenant-scoped query keys should use `tenantKey()` wrapper.
- Super-admin keys (starting with `/api/v1/super/`) are excluded from tenant scoping.
- `buildUrlFromQueryKey()` strips the tenant prefix when constructing fetch URLs, so API endpoints are unaware of the key structure.

### Frontend Guidance
- Always wrap query keys with `tenantKey()` when used in `invalidateQueries()`:
  ```typescript
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.all) });
  ```
- The `TenantContextGate` component validates tenant context is loaded before rendering tenant routes.
- Call `clearTenantScopedCaches()` when switching tenants.

### Backward Compatibility
- Un-migrated query keys (without `tenantKey()`) are still cleaned up by the fallback predicate in `clearTenantScopedCaches()`.

### Constraints / Tradeoffs
- Requires all invalidation calls to use `tenantKey()` — missing the wrapper can leave stale data.
- Fallback cleanup removes ALL `/api` queries on context switch, which is aggressive but safe during migration.

### Follow-Up
- Complete migration of all invalidation calls to use `tenantKey()` so the fallback can be removed.

---

## 15. Domain Cache Profile Guidance

### Purpose
Document the stale time and cache configuration profiles used across different data domains.

### Before vs After
- **Before**: All queries used default cache settings with no domain-specific tuning.
- **After**: `STALE_TIMES` profiles provide domain-appropriate cache durations.

### Technical Notes
`STALE_TIMES` in `client/src/lib/queryClient.ts`:

| Profile | Duration | Use Case |
|---------|----------|----------|
| `realtime` | 10s | Active timer, presence |
| `fast` | 30s | Tenant context, notifications |
| `standard` | 60s | Most data lists (default) |
| `reports` | 120s | Analytics, reports |
| `slow` | 5 min | Feature flags, static config |
| `static` | Infinity | Never refetch automatically |

- Default `staleTime` is 60s (standard) set on the `QueryClient`.
- Default `gcTime` is 5 minutes (garbage collection of inactive queries).
- Retry: 2 retries max, exponential backoff (1s, 2s), no retry on 401/403/404.
- `refetchOnWindowFocus` is disabled globally.

### API / DTO / Query Key Impact
- No API impact. Cache profiles are a frontend-only concern applied per `useQuery` call.

### Frontend Guidance
- Use `realtime` for data that changes frequently and must be near-live (timers, presence).
- Use `reports` for expensive aggregation queries that are acceptable slightly stale.
- Use `static` for data that never changes within a session (feature flags after initial load).
- Set `staleTime` in individual `useQuery` options: `staleTime: STALE_TIMES.fast`.

### Backward Compatibility
- No breaking changes. Default staleTime (60s) matches previous behavior.

### Constraints / Tradeoffs
- Higher staleTime reduces network requests but increases data staleness. Balance per domain.

### Follow-Up
- Monitor real-world staleness issues and adjust profiles as needed.

---

## 16. Scheduler / Worker Separation Plan

### Purpose
Document the current in-process job queue and scheduler architecture, and the plan for future extraction.

### Before vs After
- **Before**: No formal documentation of the job architecture.
- **After**: `docs/architecture/jobs.md` documents the full system including enqueueing, polling, handler registry, status tracking, and cleanup.

### Technical Notes
- **Job Queue**: DB-backed (`background_jobs` table), polled every 3s by an in-process worker (`server/jobs/queue.ts`).
- **Schedulers**: Started via `server/workers/schedulerBootstrap.ts` in `setImmediate()` after server listen.
- **Registration**: `registerAllHandlers()` registers job type handlers; `startJobQueue()` starts the polling loop.
- **Architecture doc**: `docs/architecture/jobs.md` provides full documentation of the job system.

### API / DTO / Query Key Impact
- Job status endpoint: `GET /api/v1/jobs/:id` for polling job progress.
- No query key impact — job polling is not cached via React Query.

### Frontend Guidance
- Use the job status polling pattern documented in `docs/architecture/jobs.md` for long-running operations.

### Backward Compatibility
- No changes to the job queue API or behavior.

### Constraints / Tradeoffs
- Current in-process approach means scheduler failures can impact the web server process.
- Job queue uses PostgreSQL polling, which adds baseline DB load.

### Follow-Up
- Scheduler extraction (#67) — extract schedulers into a separate worker process for horizontal scaling and isolation.

---

## 17. Endpoint Performance Visibility / Budgets

### Purpose
Document the performance budget system that warns when API endpoints exceed latency or payload thresholds.

### Before vs After
- **Before**: No visibility into whether endpoints met performance targets.
- **After**: Every API request is checked against defined budgets; violations are logged for review.

### Technical Notes
- **Budget definitions**: `server/observability/perfBudgets.ts` defines P95 latency, max payload bytes, and max DB query counts per endpoint.
- **Budget enforcement**: `server/middleware/requestLogger.ts` checks each request against its budget and logs `[perf:budget]` warnings on violation.
- **Tracked endpoints** (sample budgets):
  - `/api/tasks/my`: 800ms P95, 500KB payload, 12 queries
  - `/api/clients`: 700ms P95, 300KB payload, 6 queries
  - `/api/time-entries`: 800ms P95, 500KB payload, 10 queries
  - `/api/v1/reports/*`: 1500-2000ms P95, 500KB-1MB payload, 12-15 queries
- **Multiplier**: `PERF_BUDGET_MULTIPLIER` env var scales all thresholds (e.g., `2` doubles them for slow CI).
- **Matching**: `getBudgetForRoute()` matches exact paths first, then longest-prefix, with Express `:param` support.
- **Endpoint metrics**: `recordEndpointMetrics()` tracks per-endpoint rolling metrics via `endpointLatencyTracker`.

### API / DTO / Query Key Impact
- No API changes. Budgets are a server-side observability concern. No client-visible headers or response changes.

### Frontend Guidance
- No frontend changes needed. Budget violations appear in server logs only.

### Backward Compatibility
- All budgets are warning-only — no requests are blocked or throttled.

### Constraints / Tradeoffs
- Budget thresholds are static and may need tuning as data volumes grow.
- Budget checking adds minimal per-request overhead (object lookup + comparison).

### Follow-Up
- Enhanced endpoint-level visibility (#57/#68) — dashboards, percentile tracking, and alerting.

---

## 18. Sprint Summary + Remaining Follow-Ups

### What Was Completed (Sprint 50)

#### TypeScript & CI
- Zero TS errors — `npm run check` passes clean
- `tsconfig.json` target `ES2022`, `strict: true`
- Deploy smoke check validates Node.js version, env vars, and build artifacts

#### SQL-First Aggregation
- Client hierarchy list with SQL-aggregated counts
- Client stage summary via SQL GROUP BY
- Projects analytics summary
- Time entry period totals and daily breakdown via SQL SUM/CASE

#### Thin DTO Strategy
- `ClientListItem` for client list views
- `TaskListItem` for task list views (via batch hydration)
- `TimeEntryListItem` for flat time entry lists
- Projects picker DTO (`{id, name, clientId, status}`)

#### Tenant-Aware Caching
- `tenantKey()` scoping for all tenant query keys
- `clearTenantScopedCaches()` on context switch with fallback cleanup
- `TenantContextGate` validates tenant context before rendering
- `useAppMode()` manages super/tenant mode transitions

#### Performance Observability
- `perfTelemetry` + `queryTelemetry` middleware (PERF_TELEMETRY gated)
- `payloadGuard` middleware (ENABLE_PAYLOAD_GUARDS gated)
- `perfBudgets` with per-endpoint P95/payload/query budgets
- `requestLogger` with budget violation checking
- `perfLogger` with sampled request timing and hot-path awareness
- `dbTimer` for per-request DB metrics
- Client-side `perf.ts` with navigation timing and chunk load tracking

#### Secret Handling
- Single `getDecryptedSecrets()` implementation in `TenantIntegrationService`

#### Job Architecture
- `docs/architecture/jobs.md` documents the DB-backed job queue
- Schedulers bootstrap via `setImmediate()` after server listen

### Deferred to Proposed Tasks (#54–#69)

| # | Task | Status |
|---|------|--------|
| #54 | Secret handling consolidation | Proposed |
| #55 | Workload reports SQL-first | Proposed |
| #56 | My Time stats refinement | Proposed |
| #57 | Enhanced endpoint visibility | Proposed |
| #59 | Targeted cache invalidation | Proposed |
| #60 | Full pagination migration | Proposed |
| #61 | Lean list DTO refinement | Proposed |
| #62 | Picker endpoint formalization | Proposed |
| #63 | Cascade hook extraction | Proposed |
| #66 | Cross-domain DTO standardization | Proposed |
| #67 | Scheduler extraction | Proposed |
| #68 | Performance dashboards | Proposed |

### Remaining Hotspots
- Job queue polling adds baseline DB load — consider extraction (#67) for high-scale.
- Client-side perf telemetry beacon (`/api/v1/system/perf`) is best-effort — no server-side persistence yet.

### Files Changed in This Sprint Validation
- `server/storage.ts` — Added 3 paginated time entry methods to IStorage interface and DatabaseStorage class with stable composite cursor; added `lt` and `count` imports.
- `server/http/domains/projects.router.ts` — Refactored conditional select into typed query branches (no `as any`).
- `docs/sprint-50-summary.md` — This comprehensive sprint documentation (all 18 required topics).
