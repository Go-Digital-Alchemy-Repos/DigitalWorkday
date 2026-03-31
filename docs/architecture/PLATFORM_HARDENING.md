# Platform Hardening & Cache Strategy

Phase 3 of the Enterprise Stabilization sprint. Covers DTO patterns, cache strategy, endpoint consolidation, staging profiling, and worker separation.

---

## 1. List DTO vs Detail DTO Strategy

### Principle
Every major domain (clients, projects, tasks, time entries) supports multiple response shapes to minimize payload size for common operations while preserving full detail for drawers and panels.

### Payload Tiers

| Tier | Purpose | Payload | Example Use |
|------|---------|---------|-------------|
| **Picker** | Dropdowns/selects | `{id, label}` only | Timer drawers, cascade selectors |
| **List** | Table/list rendering | Core fields, no nested objects | Dashboard tables, list views |
| **Minimal** | Lightweight full-ish | Most scalar fields | Sidebar, compact cards |
| **Full/Detail** | Drawer/panel content | All fields + nested relations | Task panel, project drawer |

### Domain Inventory

#### Clients (`GET /api/clients`)
| `fields` param | Shape |
|---|---|
| *(omitted)* | Full client with contacts, projects, divisions |
| `minimal` | `{id, companyName, displayName, status, parentClientId}` |
| `list` | `{id, companyName, displayName, status, stage, parentClientId, tenantId, createdAt}` |

Picker: `GET /api/v1/pickers/clients` → `{id, label}`

#### Projects (`GET /api/projects`)
| `fields` param | Shape |
|---|---|
| *(omitted)* | Full project with all columns |
| `list` | `{id, name, clientId, status, color, teamId, projectManagerId, createdAt, updatedAt, stickyAt, visibility, budgetMinutes}` |
| `minimal` | Same as list + `workspaceId, tenantId, description` |
| `picker` | `{id, name, clientId, status}` |

Picker: `GET /api/v1/pickers/projects?clientId=...` → `{id, label, clientId}`

> **Note**: `fields=list` and `fields=minimal` for projects require `ENABLE_PROJECTS_SQL_FILTERING=true` (the default). The legacy storage-layer fallback only supports `fields=picker`.

#### Tasks
| Endpoint | Shape |
|---|---|
| `GET /api/tasks/my` | Full tasks with relations (assignees, tags, subtasks) |
| `GET /api/tasks/my?view=list` | List DTO: `{id, title, status, priority, dueDate, projectId, sectionId, ...}` (no nested relations) |
| `GET /api/tasks/my?view=list&status=...` | Filtered + paginated list DTO |
| `GET /api/projects/:id/tasks` | Full tasks with relations |
| `GET /api/projects/:id/tasks?fields=list` | List DTO for project tasks |

Picker: `GET /api/v1/pickers/tasks?projectId=...` → `{id, label, projectId, parentTaskId, status}`

#### Time Entries (`GET /api/time-entries/my`)
| `fields` param | Shape |
|---|---|
| *(omitted)* | Full time entry with client/project/task/user relations |
| `list` | Lean DTO: `{id, title, description, startTime, endTime, durationSeconds, scope, isManual, clientName, projectName, taskTitle, userName, ...}` |

### Guidance
- **Lists/tables/dashboards**: Always use `fields=list` or `fields=minimal` to avoid fetching nested relations.
- **Drawers/panels**: Fetch detail on demand via `GET /api/{domain}/:id` when the user opens a drawer.
- **Selectors/dropdowns**: Use `/api/v1/pickers/*` endpoints for minimal `{id, label}` payloads.
- **New endpoints**: Follow the additive pattern — add a `fields` query parameter, never remove fields from the default response.

---

## 2. Canonical Endpoint Map

### Read Models

| Domain | Canonical List | Canonical Detail | Picker |
|--------|---------------|-----------------|--------|
| Clients | `GET /api/clients` | `GET /api/clients/:id` | `GET /api/v1/pickers/clients` |
| Projects | `GET /api/projects` | `GET /api/projects/:id` | `GET /api/v1/pickers/projects` |
| Tasks | `GET /api/tasks/my` | `GET /api/tasks/:id` | `GET /api/v1/pickers/tasks` |
| Time Entries | `GET /api/time-entries/my` | *(inline in list)* | *(via cascade)* |
| Teams | `GET /api/teams` | — | — |
| Users | `GET /api/users` / `GET /api/tenant/users` | — | — |

### Deprecation Path
Legacy overlapping routes to eventually consolidate:
- `GET /api/projects` (storage-layer path when `enableProjectsSqlFiltering=false`) → Keep as fallback, default ON.
- `GET /api/clients` (full payload path) → Consumers should migrate to `fields=list` for table views.
- Project-scoped task fetching (`GET /api/projects/:id/tasks` full payload) → Use `fields=list` for board/list views.

No routes are removed in this phase. Consolidation is additive — new `fields` tiers are added alongside existing responses.

---

## 3. Tenant-Namespaced Query Key System

### Architecture
- All tenant-scoped query keys are wrapped with `tenantKey()` from `queryClient.ts`.
- `tenantKey()` prefixes keys with `["tenant", tenantId, ...]` based on `_effectiveTenantId`.
- Super-scoped keys (`/api/v1/super/*`) bypass the prefix via `isSuperScopedKey()`.
- System/global keys (feature flags, system features) are intentionally unprefixed.

### Query Key Namespaces (`queryKeys.ts`)
- `queryKeys.projects.*` — Project queries with `.all`, `.list`, `.picker`, `.detail(id)`, `.sections(id)`, `.tasks(id)`, etc.
- `queryKeys.tasks.*` — Task queries with `.all`, `.my`, `.detail(id)`, `.subtasks(id)`, etc.
- `queryKeys.clients.*` — Client queries with `.all`, `.list`, `.minimal`, `.detail(id)`, etc.
- `queryKeys.pickers.*` — Lightweight picker endpoints for dropdowns.
- `queryKeys.timeEntries.*` — Time entry queries with `.all`, `.list`, `.paginated`, `.myStats`, etc.

### Cache Invalidation Helpers
- `invalidateTaskCaches(qc, opts)` — Invalidates task caches scoped by `projectId`, `taskId`, `parentTaskId`. Also invalidates picker tasks when `projectId` is provided.
- `invalidateClientCaches(qc, opts)` — Invalidates `.all`, `.list`, `.minimal`, `.hierarchy`, `.stagesSummary`, and optionally detail/notes/crmSummary.
- `invalidateTimeEntries(qc, opts)` — Targeted invalidation by `dateFilter` or broad, with optional stats and task-scoped entries.
- `invalidateTimeEntryCaches(qc, opts)` — Broader helper for timer-related flows.

### Optimistic Update Helpers (Time Entries)
- `optimisticInsertTimeEntry` / `optimisticInsertTimeEntryBroad` — Insert into flat or paginated caches.
- `optimisticUpdateTimeEntry` — Patch entry in cache.
- `optimisticRemoveTimeEntry` — Remove entry from cache.
- `rollbackTimeEntryCache` — Restore previous cache state on mutation error.

### Audit Results (Phase 3)
- All inline query keys in tenant-scoped components use `tenantKey()` wrapping.
- All inline keys in super-admin components use `/api/v1/super/...` paths which correctly bypass tenant prefixing.
- `clearTenantScopedCaches()` removes both `["tenant", ...]` prefixed keys and un-migrated `/api/*` keys on tenant switch.
- No tenant isolation gaps found in current codebase.

---

## 4. Cache Strategy

### React Query Configuration
```
staleTime: 60s (standard)
gcTime: 5 minutes
retry: 2 attempts (skip for 401/403/404)
refetchOnWindowFocus: false
refetchInterval: false
```

### Stale Time Tiers (`STALE_TIMES`)
| Tier | Duration | Use Case |
|------|----------|----------|
| `realtime` | 10s | Timer, presence |
| `fast` | 30s | Notifications |
| `standard` | 60s | Default for most queries |
| `reports` | 120s | Reports, analytics |
| `slow` | 5 min | Rarely changing data |
| `static` | Infinity | Feature flags, system config |

### Invalidation Strategy
- **Targeted invalidation**: Mutations invalidate specific cache keys rather than broad sweeps.
- **Optimistic updates**: Time entry create/update/delete use cache patches with rollback on error.
- **Date-scoped**: Time entry queries are scoped by date filter, so mutations only invalidate the relevant filter's cache.
- **Cross-tab sync**: `BroadcastChannel` + `localStorage` fallback for timer/time-entry synchronization across tabs.

---

## 5. Staging Profiling & KPI Instrumentation

### Current State: ACTIVE
- `ENABLE_PERF_PROFILING` defaults to `true` in staging (`isStaging`), `false` in development/production.
- `ENABLE_OBSERVABILITY` defaults to `true` in all environments.

### Components
1. **`profilingMiddleware.ts`**: Captures per-request latency, payload bytes, and DB query count. Records via `perfProfiler`.
2. **`requestLogger.ts`**: Structured JSON request logs with `[perf]` prefix. Emits `[perf:budget]` warnings when thresholds are exceeded.
3. **`perfBudgets.ts`**: Defines P95 latency, max payload bytes, and max DB query count budgets for 15 endpoint groups.
4. **`endpointLatencyTracker.ts`**: In-memory ring buffer (~1000 samples/endpoint) computing P50/P95/P99 distributions.
5. **`perfProfiler.ts`**: `AsyncLocalStorage`-based per-request profiling store with DB query counter.
6. **`perfTelemetry.ts`**: Global slow-request threshold monitoring.
7. **`queryTelemetry.ts`**: DB pool instrumentation for slow query detection.

### KPI Surface
- `GET /api/v1/system/observability` exposes real-time endpoint metrics including `latencyDistribution` (P50/P95/P99), payload bytes, and query counts.
- Performance budgets are warning-only — never hard failures.

### Budgeted Endpoints
| Route | P95 Target | Max Payload | Max Queries |
|-------|-----------|-------------|-------------|
| `/api/tasks/my` | 800ms | 500KB | 12 |
| `/api/projects` | 600ms | 300KB | 8 |
| `/api/clients` | 700ms | 300KB | 6 |
| `/api/time-entries` | 800ms | 500KB | 10 |
| `/api/v1/notifications/unread-count` | 200ms | 1KB | 2 |
| Reports endpoints | 1.5-2s | 500KB-1MB | 12-15 |

---

## 6. Worker Separation — PROCESS_MODE Architecture

### Overview
The application supports three process modes via the `PROCESS_MODE` environment variable:

| Mode | API Server | Workers/Schedulers | Use Case |
|------|-----------|-------------------|----------|
| `all` | ✅ | ✅ | Development, single-instance deployments |
| `api` | ✅ | ❌ | Production API replicas (horizontally scaled) |
| `worker` | ❌ | ✅ | Dedicated worker process (single instance) |

### Entry Points
- **API**: `server/index.ts` → Express server, Socket.IO, Vite dev server
- **Worker**: `server/worker.ts` → Job queue, schedulers, health endpoint on port 5001

### Gate Functions (`server/lib/processMode.ts`)
- `shouldRunApi()` — `true` for `all` or `api` modes
- `shouldRunWorkers()` — `true` for `all` or `worker` modes

### Worker Responsibilities
1. **Job Queue** (`server/jobs/`): Asana import, CSV import, bulk task import, AI generation, data retention
2. **Alert Scheduler** (`server/alerts/alertScheduler.ts`): Periodic alert evaluation
3. **Digest Scheduler** (`server/digests/digestScheduler.ts`): Email digest generation
4. **Retention Scheduler** (`server/retention/retentionScheduler.ts`): Data retention policy enforcement
5. **Notification Checkers**: Deadline checker, follow-up checker
6. **SLA Evaluator**: Support ticket and conversation SLA breach detection (every 5 minutes)

### Deployment Guidance
- **Development**: Use `PROCESS_MODE=all` (default). Single process handles everything.
- **Production (single instance)**: Use `PROCESS_MODE=all`. Acceptable for small deployments.
- **Production (scaled)**: Deploy API replicas with `PROCESS_MODE=api` and a single worker instance with `PROCESS_MODE=worker`. Workers expose health at `WORKER_PORT` (default 5001).
- **Graceful shutdown**: Worker process handles SIGTERM/SIGINT with 10s timeout, draining job queue and schedulers before exiting.

### Health Check
Worker exposes `GET /health` on `WORKER_PORT`:
```json
{ "status": "healthy", "mode": "worker", "uptime": 12345 }
```
