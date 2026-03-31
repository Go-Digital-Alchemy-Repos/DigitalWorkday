# Enterprise Stabilization Sprint — Complete Reference

Comprehensive documentation covering all 16 stabilization items across three phases. Each entry includes purpose, before/after behavior, implementation notes, API impacts, frontend guidance, backward compatibility, constraints, and follow-ups.

**Sprint Phases:**
- Phase 1 (Task #71): TypeScript Stabilization & Inline Decrypt Consolidation
- Phase 2 (Task #72): My Time Performance Optimization
- Phase 3 (Task #73): Platform Hardening & Cache Strategy
- Phase 4 (Task #74): Final Validation, Regression Triage & Docs Sync

**Related Docs:**
- `docs/architecture/PLATFORM_STABILIZATION_PHASE1.md` — Phase 1 deep-dive
- `docs/architecture/MY_TIME_PERFORMANCE.md` — Phase 2 deep-dive
- `docs/architecture/PLATFORM_HARDENING.md` — Phase 3 deep-dive

---

## 1. TypeScript Stabilization Status

**Purpose:** Ensure the entire codebase passes TypeScript strict-mode checks with zero errors.

**Before:** Codebase already passed tsc; this phase verified the baseline and fixed regressions introduced by new code (pickers.router.ts nullable tenantId, projects.router.ts budget field mismatch).

**After:** `npx tsc --noEmit` returns 0 errors. All `server/`, `client/src/`, and `shared/` files are covered. Tests (`*.test.ts`) are excluded.

**Implementation:** Fixed `projects.router.ts` referencing non-existent `budget`/`budgetHours` columns (corrected to `budgetMinutes`). Fixed `pickers.router.ts` nullable `tenantId` and `getEffectiveTenantId` return type issues using `sql` template literals and non-null assertions.

**Constraints:** `skipLibCheck: true` avoids false positives from third-party `.d.ts` files. `strict: true` enables all strict checks.

**Follow-ups:** None. Baseline is clean.

---

## 2. Typecheck CI/CD Policy

**Purpose:** Prevent TypeScript regressions from reaching production.

**Before:** No formal enforcement gate beyond manual checks.

**After:** `npm run check` (runs `tsc --noEmit`) is the delivery gate. `npm run build` (Railway deployment) runs `npm run check` as prerequisite. TypeScript errors block deployment.

**Implementation:** `check` script defined in `package.json`. Agent code review validates typecheck passes before approving changes.

**Backward Compatibility:** No behavior changes. Purely additive enforcement.

**Follow-ups:** If GitHub Actions or similar CI is introduced, add `npm run check` as a required status check.

---

## 3. Compiler Target / Runtime Compatibility

**Purpose:** Document and verify the TypeScript compiler target aligns with the deployment runtime.

**Before:** Target was implicit / undocumented.

**After:** Explicit `"target": "ES2022"` in `tsconfig.json`. Matches Node.js 18+ runtime (top-level await, class fields, `at()`, `Object.hasOwn()`, error cause).

**Implementation:** `tsconfig.json` settings: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `lib: ["esnext", "dom", "dom.iterable"]`, `incremental: true`.

**Constraints:** No downlevel iteration issues at ES2022. All modern JS features used are natively supported.

---

## 4. Tenant Integration Secret Handling

**Purpose:** Consolidate scattered inline decrypt patterns into a single canonical service.

**Before:** Three provider resolvers (AI, Storage, QuickBooks) each independently imported `db`, `tenantIntegrations`, `decryptValue`, and `isEncryptionAvailable`, creating parallel decrypt paths with inconsistent error handling.

**After:** All three resolvers use `TenantIntegrationService` methods:
- AI: `getIntegrationDetailedSecrets<OpenAISecretConfig>(tenantId, "openai")`
- Storage: `getIntegrationDetailedSecrets<S3SecretConfig>(tenantId, "r2")`
- QuickBooks: `getIntegrationDetailedSecrets<QuickBooksSecretConfig>(tenantId, "quickbooks")`

**API Impact:** New method `getIntegrationDetailedSecrets<T>()` returns `{id, status, publicConfig, secretConfig, hasEncryptedData, encryptionAvailable}` enabling callers to distinguish "no integration" from "decrypt failed" from "encryption unavailable".

**Backward Compatibility:** All hierarchical fallback chains (tenant → system → env) unchanged. Same error types thrown. Same response shapes. No API contract changes.

**Follow-ups:** `storeTokens` in QuickBooks auth still uses direct `encryptValue` + DB ops. `disconnectQuickBooks` and `getConnectionStatus` still query DB directly.

---

## 5. List DTO vs Detail DTO Strategy

**Purpose:** Reduce payload sizes for list/table views by returning only the fields needed for rendering.

**Before:** All list endpoints returned full entity objects with nested relations (assignees, tags, subtasks, contacts, etc.).

**After:** Four payload tiers exist across all major domains:

| Tier | Purpose | Example |
|------|---------|---------|
| Picker | Dropdowns/selects | `{id, label}` |
| List | Table/list views | Core scalar fields only |
| Minimal | Compact cards | Most scalar fields |
| Full/Detail | Drawers/panels | All fields + nested relations |

**Domains with `fields=list` support:**
- `GET /api/clients?fields=list` → `{id, companyName, displayName, status, stage, parentClientId, tenantId, createdAt}`
- `GET /api/projects?fields=list` → `{id, name, clientId, status, color, teamId, projectManagerId, createdAt, updatedAt, stickyAt, visibility, budgetMinutes}`
- `GET /api/projects/:id/tasks?fields=list` → Task list DTO (no nested relations)
- `GET /api/time-entries/my?fields=list` → Lean DTO with pre-resolved display names

**Frontend Guidance:** Use `fields=list` for tables/dashboards. Fetch detail on-demand via `GET /:domain/:id` when opening drawers. Use `/api/v1/pickers/*` for dropdowns.

**Constraints:** Project `fields=list` requires `ENABLE_PROJECTS_SQL_FILTERING=true` (default ON). Legacy fallback only supports `fields=picker`.

**Follow-ups:** Migrate remaining table views to use `fields=list` where applicable.

---

## 6. SQL-First Aggregation Strategy

**Purpose:** Compute aggregations (counts, sums, averages) in the database rather than in application code.

**Before:** Stats computed by fetching all records into memory and aggregating in JavaScript.

**After:** SQL `SUM`/`COUNT`/`GROUP BY` queries compute aggregates directly in PostgreSQL:
- My Time stats: total hours, billable/unbillable split, by-client, by-project breakdowns
- Project task counts: SQL aggregation in `getProjectsWithCounts()`
- Time entry stats: `getMyTimeStats()` returns SQL-computed totals

**Before/After Metrics:**
| Metric | Before | After |
|--------|--------|-------|
| My Time stats | Fetch all entries → JS reduce | Single SQL `SUM/GROUP BY` |
| Payload for stats | Full entry array (~500KB for 200 entries) | ~2KB stats object |
| Query count for stats | 1 (fetch all) + N (relations) | 1 SQL query |

**Backward Compatibility:** Same response shapes. Stats endpoint returns identical structure.

---

## 7. My Time Stats Aggregation

**Purpose:** Provide efficient summary statistics for the My Time page.

**Before:** Stats derived client-side from the full time entry array.

**After:** Dedicated SQL aggregation in `timeTrackingRepo.getMyTimeStats()` computing:
- Total hours (overall)
- Billable vs unbillable hours split
- Hours by client (top N)
- Hours by project (top N)
- Filtered by date range and user

**API Endpoint:** `GET /api/time-entries/my/stats?dateFilter=...` returns pre-computed stats object.

**Frontend Usage:** `queryKeys.timeEntries.myStats` with `tenantKey()` wrapping. Stats are fetched independently from the entry list, enabling independent caching.

---

## 8. Paginated Time Entries Contract

**Purpose:** Support large time entry datasets without loading all entries at once.

**Before:** `GET /api/time-entries/my` returned a flat array of all entries.

**After:** Optional cursor-based pagination:
```
GET /api/time-entries/my?limit=25&cursor=<nextCursor>
→ { items: TimeEntry[], hasMore: boolean, nextCursor: string | null, totalCount: number }
```

When `limit` is omitted, returns flat array for backward compatibility. Max limit: 50.

**Frontend Usage:** `useInfiniteQuery` with "Load more" button for "All Time" and "This Month" filters. Query key: `queryKeys.timeEntries.paginated`.

**Backward Compatibility:** Fully backward compatible. Omitting `limit` returns legacy flat array format.

---

## 9. Time Entry List DTO vs Detail DTO

**Purpose:** Reduce per-entry payload size for list views.

**Before:** Each time entry in the list included full nested objects for client, project, task, and user.

**After:** `fields=list` returns a `TimeEntryListItem` with pre-resolved display names:
```typescript
{ id, title, description, startTime, endTime, durationSeconds, scope, isManual,
  clientName, projectName, taskTitle, userName, billingStatus, ... }
```

**Implementation:** `batchFlattenEntries()` in `server/storage/timeTracking.repo.ts` batch-loads related entities in a single pass, then maps display names onto entries.

**Before/After Metrics:**
| Metric | Before | After |
|--------|--------|-------|
| Per-entry payload | ~2KB (with nested objects) | ~500B (flat with display names) |
| Related entity queries | N+1 per entry | Batch: 3-4 queries total |

---

## 10. My Time Targeted Cache Invalidation

**Purpose:** Replace broad cache invalidation with scoped, targeted invalidation for time entries.

**Before:** Time entry mutations invalidated all time entry caches globally.

**After:** Scoped invalidation per active date filter + optimistic updates:
- `optimisticInsertTimeEntry(qc, entry, dateFilter)` — instant UI insert
- `optimisticUpdateTimeEntry(qc, entryId, dateFilter, data)` — instant UI update
- `optimisticRemoveTimeEntry(qc, entryId, dateFilter)` — instant UI removal
- `rollbackTimeEntryCache(qc, dateFilter, prev)` — restore on error
- `invalidateTimeEntries(qc, { dateFilter })` — scoped invalidation in `onSuccess`

**Frontend Flow:** `onMutate` → optimistic cache update → server request → `onSuccess` (scoped invalidation + cross-tab broadcast) or `onError` (rollback).

**Before/After Metrics:**
| Metric | Before | After |
|--------|--------|-------|
| Cache invalidation scope | All time entry queries | Only matching dateFilter |
| UI responsiveness | Wait for server → refetch | Instant (optimistic) |
| Cross-tab sync | None | BroadcastChannel + localStorage fallback |

---

## 11. Lightweight Picker Endpoint Guidance

**Purpose:** Provide minimal payloads for dropdown/select UI components.

**Endpoints:**
| Endpoint | Response | Params |
|----------|----------|--------|
| `GET /api/v1/pickers/clients` | `{id, label}[]` | — |
| `GET /api/v1/pickers/projects` | `{id, label, clientId}[]` | `clientId`, `search` |
| `GET /api/v1/pickers/tasks` | `{id, label, projectId, parentTaskId, status}[]` | `projectId` (required), `search` |

**Frontend Usage:** `queryKeys.pickers.clients`, `queryKeys.pickers.projects(clientId)`, `queryKeys.pickers.tasks(projectId)`. Used by `useTimeEntryCascade`, `StartTimerDrawer`, `GlobalActiveTimer`, `TaskSelectorWithCreate`.

**Implementation:** `server/http/domains/pickers.router.ts` — tenant-scoped with private project/task visibility filters. Non-archived projects only, non-done tasks only.

**Backward Compatibility:** New endpoints; no existing endpoints changed.

---

## 12. Tenant-Aware Query Key Strategy

**Purpose:** Prevent cross-tenant cache pollution in the multi-tenant frontend.

**Implementation:**
- All query keys defined in `client/src/lib/queryKeys.ts`
- Wrapped with `tenantKey()` from `queryClient.ts` which prefixes keys with `["tenant", tenantId, ...]`
- Super-scoped keys (`/api/v1/super/*`) bypass prefix via `isSuperScopedKey()`
- System/global keys (feature flags, system config) intentionally unprefixed

**Cache Invalidation Helpers:**
- `invalidateTaskCaches(qc, opts)` — tasks, project tasks, picker tasks
- `invalidateClientCaches(qc, opts)` — `.all`, `.list`, `.minimal`, `.hierarchy`, `.stagesSummary`, detail, notes, CRM summary
- `invalidateProjectCaches(qc, opts)` — `.all`, `.list`, `.picker`, `.withCounts`, `.analyticsSummary`, `/api/v1/pickers/projects`, detail, tasks, members
- `invalidateTimeEntries(qc, opts)` — date-scoped, stats, task-scoped
- `clearTenantScopedCaches()` — removes both `["tenant", ...]` prefixed and un-migrated inline keys on tenant switch

**Audit Results (Phase 3):** All inline keys are either super-scoped or system-level. No tenant isolation gaps found.

**Follow-ups:** Continue incremental migration of remaining inline API keys to `tenantKey()` wrapper.

---

## 13. Canonical Endpoint / Deprecation Guidance

**Purpose:** Define the canonical read endpoints and deprecation path for legacy overlapping routes.

**Canonical Read Endpoints:**
| Domain | List | Detail | Picker |
|--------|------|--------|--------|
| Clients | `GET /api/clients` | `GET /api/clients/:id` | `GET /api/v1/pickers/clients` |
| Projects | `GET /api/projects` | `GET /api/projects/:id` | `GET /api/v1/pickers/projects` |
| Tasks | `GET /api/tasks/my` | `GET /api/tasks/:id` | `GET /api/v1/pickers/tasks` |
| Time Entries | `GET /api/time-entries/my` | (inline in list) | (via cascade) |

**Deprecation Path:** No routes removed in this sprint. Consolidation is additive:
- `GET /api/projects` storage-layer path (when `enableProjectsSqlFiltering=false`) → Keep as fallback, default ON
- `GET /api/clients` full payload path → Consumers should migrate to `fields=list`
- Full task payload for board views → Use `fields=list`

---

## 14. Staging Profiling / KPI Visibility

**Purpose:** Enable performance monitoring on staging without impacting production.

**Implementation:**
- `config.features.enablePerfProfiling` defaults to `true` on staging (`isStaging`), `false` elsewhere
- `config.features.enableObservability` defaults to `true` in all environments

**Components:**
1. `profilingMiddleware.ts` — per-request latency, payload bytes, DB query count
2. `requestLogger.ts` — structured JSON logs with `[perf]` prefix, `[perf:budget]` warnings
3. `perfBudgets.ts` — P95 latency, max payload, max DB query budgets for 15 endpoint groups
4. `endpointLatencyTracker.ts` — ring buffer (~1000 samples/endpoint) computing P50/P95/P99
5. `perfProfiler.ts` — `AsyncLocalStorage`-based per-request profiling
6. `perfTelemetry.ts` — global slow-request threshold monitoring
7. `queryTelemetry.ts` — DB pool instrumentation for slow query detection

**KPI Surface:** `GET /api/v1/system/observability` exposes real-time metrics including `latencyDistribution`, payload bytes, and query counts. Performance budgets are warning-only.

**Key Budgets:**
| Route | P95 Target | Max Payload | Max Queries |
|-------|-----------|-------------|-------------|
| `/api/tasks/my` | 800ms | 500KB | 12 |
| `/api/projects` | 600ms | 300KB | 8 |
| `/api/clients` | 700ms | 300KB | 6 |
| `/api/time-entries` | 800ms | 500KB | 10 |
| `/api/v1/notifications/unread-count` | 200ms | 1KB | 2 |

---

## 15. Scheduler / Worker Separation Plan

**Purpose:** Enable horizontal scaling by separating API serving from background job processing.

**Architecture:** `PROCESS_MODE` environment variable controls process behavior:

| Mode | API Server | Workers/Schedulers | Use Case |
|------|-----------|-------------------|----------|
| `all` | Yes | Yes | Development, single-instance |
| `api` | Yes | No | Production API replicas |
| `worker` | No | Yes | Dedicated worker process |

**Entry Points:**
- API: `server/index.ts` → Express, Socket.IO, Vite dev server
- Worker: `server/worker.ts` → Job queue, schedulers, health endpoint (port 5001)

**Gate Functions:** `server/lib/processMode.ts`
- `shouldRunApi()` → true for `all`/`api`
- `shouldRunWorkers()` → true for `all`/`worker`

**Worker Responsibilities:** Job queue (Asana/CSV/bulk import, AI generation, data retention), alert scheduler, digest scheduler, retention scheduler, notification checkers, SLA evaluator.

**Health Check:** Worker exposes `GET /health` on `WORKER_PORT`: `{ status: "healthy", mode: "worker", uptime: N }`.

**Graceful Shutdown:** SIGTERM/SIGINT with 10s timeout, draining queue and schedulers.

---

## 16. Sprint Summary + Remaining Follow-Ups

### Phase-by-Phase Summary

**Phase 1 (Task #71):** TypeScript stabilization verified, CI gate active via build pipeline, ES2022 target explicit, inline decrypt patterns consolidated into `TenantIntegrationService` for AI/Storage/QuickBooks providers.

**Phase 2 (Task #72):** My Time page performance optimized — lightweight picker endpoints, time entry list DTO with batch hydration, cursor pagination, SQL-first stats aggregation, optimistic mutations with targeted cache invalidation, cross-tab timer sync.

**Phase 3 (Task #73):** Platform hardening — `fields=list` DTOs for clients/projects/tasks/time-entries, tenant query key audit (no gaps), cache invalidation helpers updated for new tiers, staging profiling verified, worker separation documented.

**Phase 4 (Task #74):** Final validation — fixed 7 TypeScript errors (projects.router.ts budget column mismatch, pickers.router.ts nullable tenantId/userId), created comprehensive sprint documentation.

### Regressions Found & Fixed
1. `projects.router.ts` referenced `projects.budget` and `projects.budgetHours` which don't exist — fixed to `projects.budgetMinutes`
2. `pickers.router.ts` had nullable `tenantId` passed to `eq()` and visibility filters — fixed with `sql` template literals and non-null assertions

### Before/After Metrics Summary

| Area | Before | After |
|------|--------|-------|
| TypeScript errors | 0 (baseline) → 7 (introduced by sprint) | 0 |
| Decrypt code paths | 3 parallel inline patterns | 1 canonical service |
| My Time stats payload | ~500KB (full entries) | ~2KB (SQL aggregated) |
| Time entry list payload | ~2KB/entry (nested objects) | ~500B/entry (flat) |
| Picker payload | Full entity (~5KB/item) | ~50B/item (`{id, label}`) |
| Cache invalidation scope | All queries globally | Scoped by dateFilter/domain |
| Time entry mutation UX | Wait for server response | Instant (optimistic) |
| Endpoint DTO tiers | 1-2 per domain | 3-4 per domain |
| Worker separation | Monolithic | Configurable via PROCESS_MODE |

### Remaining Hotspots
1. `getTasksByUser` in workload reports — partially mitigated by `Promise.all`, still a hot path for tenants with many tasks
2. Drawer secondary data (comments, time entries) loaded eagerly on open — could be deferred
3. `storeTokens` in QuickBooks auth still uses direct `encryptValue` + DB ops
4. Some inline query keys remain un-migrated to `tenantKey()` (super-scoped and system-level, no isolation risk)
5. Project `fields=list` only available on SQL-filtering path (default ON, but legacy fallback lacks support)

### Follow-Up Recommendations
1. Migrate remaining table views (Clients Dashboard, Tasks Board) to use `fields=list`
2. Defer drawer secondary data loading (comments, time entries) to after initial render
3. Consolidate QuickBooks write operations through `TenantIntegrationService`
4. Add `npm run check` to a formal CI pipeline when one is introduced
5. Consider adding `fields=list` support to the legacy projects fallback path or remove it entirely
6. Continue incremental migration of inline query keys to `tenantKey()` wrapper
