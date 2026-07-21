# Async, Concurrency, and Backpressure Audit - 2026-07-21

## Executive Assessment

**Overall score:** 7.2 / 10  
**Release recommendation:** Approve with follow-up

### Strongest Aspects

1. **Background jobs have durable state and database claiming.** `server/jobs/queue.ts` stores jobs in `background_jobs`, uses `FOR UPDATE SKIP LOCKED`, tracks attempts, supports cancellation checks, and has per-type concurrency settings.
2. **Large imports are mostly sequential by design.** `server/jobs/handlers.ts` processes bulk task imports row-by-row with periodic progress updates and cancellation checks, avoiding a write storm against PostgreSQL.
3. **Upload UX already applies local backpressure.** `client/src/lib/uploads/useAttachmentUploadQueue.ts` caps attachments at 10 and active uploads at 2.

### Most Important Risks

1. **Several schedulers could overlap work.** Alert, retention, notification, and digest schedulers used interval callbacks that did not guard against a prior run still being active.
2. **Job polling could race itself.** `server/jobs/queue.ts` allowed overlapping `pollOnce` executions from interval ticks and enqueue-triggered `setImmediate`, which could race the in-memory `runningCounts` check.
3. **Bulk `Promise.all(map(async ...))` remains in reporting/admin paths.** These are mostly bounded by query results, but they can still amplify database work on large tenants and should be converted only where measurement shows pressure.

## System Map

### Runtime and Async Entry Points

- HTTP runtime: Express on Node.js with async route handlers.
- Database: PostgreSQL via Drizzle; session and application data share the DB.
- Background jobs: `server/jobs/queue.ts`, handlers in `server/jobs/handlers.ts`.
- Schedulers:
  - Alerts: `server/alerts/alertScheduler.ts`
  - Retention: `server/retention/retentionScheduler.ts`
  - Weekly ops digest: `server/digests/digestScheduler.ts`
  - Deadline and follow-up notifications: `server/features/notifications/notification.service.ts`
- External calls:
  - Asana: `server/services/asana/asanaClient.ts`
  - QuickBooks/OpenAI/Mailgun: `server/services/tenantIntegrations.ts`, `server/services/ai/*`, `server/services/emailOutbox.ts`
- Client-side async areas inspected:
  - Notification inbox bulk actions: `client/src/pages/notifications-inbox.tsx`
  - Attachment upload queue: `client/src/lib/uploads/useAttachmentUploadQueue.ts`
  - Chat abort/debounce behavior: `client/src/pages/chat.tsx`

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why It Matters | Recommended Remediation | Effort | Risk |
|---|---|---:|---|---|---|---|---|---|---|
| ACB-01 | Medium | Confirmed | Cross-cutting | `server/alerts/alertScheduler.ts`, `server/retention/retentionScheduler.ts`, `server/digests/digestScheduler.ts`, `server/features/notifications/notification.service.ts` | Schedulers used interval callbacks such as `setInterval(() => { void tick(); }, ...)` or direct `check...().catch(...)` without a running guard. Alert/retention also ignored `initialDelayHandle` in `start...Scheduler`. | If a scheduler run exceeds its interval or start is called twice during initial delay, duplicate evaluations/sends/archive work can overlap. Digest overlap can duplicate tenant digest sends; notification overlap can duplicate due/deadline notification checks. | Added a shared single-flight runner and guarded scheduler starts/initial timeouts. | S | Low |
| ACB-02 | Medium | Confirmed | Local | `server/jobs/queue.ts` | `enqueueJob` calls `setImmediate(() => pollOnce())` while `startJobQueue` also runs `setInterval(() => pollOnce(), 3000)`. `pollOnce` awaited `claimJob()` without a local polling lock. | Two overlapping polls can both read the same `runningCounts` value before either increments it, allowing concurrency overrun for a handler type. | Added `isPolling` guard around `pollOnce`. | XS | Low |
| ACB-03 | Low | Strongly Supported | Feature-wide | `server/services/asana/asanaClient.ts` | `lastRequestTime` was global, but concurrent callers could all compute elapsed from the same timestamp and sleep for the same duration, then burst together. Fetch calls had retry handling but no timeout. | Asana import/test calls could unintentionally violate local throttle spacing or hang on a stuck upstream request. | Serialized throttle turns with a promise chain and added a 30s request timeout. | S | Low |
| ACB-04 | Low | Plausible | Feature-wide | `client/src/pages/notifications-inbox.tsx` | Selected notification read/clear actions use `Promise.all(notificationIds.map(...))`. | Large selections could produce a burst of PATCH requests. Current UI pagination/selection limits likely bound this in practice, while `mark-all-read` uses a bulk endpoint. | Keep as follow-up unless telemetry shows request storms. Prefer a batch endpoint for selected IDs before changing client semantics. | M | Moderate |
| ACB-05 | Low | Strongly Supported | Cross-cutting | `server/http/domains/workload-reports.router.ts`, `server/routes/workloadReports.ts`, `server/routes/modules/super-admin/reports.router.ts`, `server/routes/modules/crm/conversations.router.ts` | Static scan found multiple `Promise.all(...map(async ...))` paths over users, tasks, tenants, conversations, notes, or documents. | These can amplify DB queries for large tenants, but some are intentionally bounded top-N or already pre-filtered. | Replace with batched joins or bounded concurrency when modifying those reports; do not blanket rewrite. | L | Moderate |
| ACB-06 | Informational | Confirmed | Local | `client/src/lib/uploads/useAttachmentUploadQueue.ts` | `MAX_FILES = 10`; `MAX_CONCURRENT = 2`; queue drains through `processNext`. | This is a good existing backpressure pattern. | Preserve this pattern for future upload/file workflows. | XS | Low |

## Changes Made

### Added single-flight helper

- `server/lib/singleFlight.ts`
  - New small helper that skips overlapping async runs while allowing later runs after completion.

### Guarded server schedulers

- `server/alerts/alertScheduler.ts`
  - Prevents duplicate initial scheduling.
  - Skips overlapping alert evaluation ticks.
- `server/retention/retentionScheduler.ts`
  - Prevents duplicate initial scheduling.
  - Skips overlapping soft-archive ticks.
- `server/digests/digestScheduler.ts`
  - Skips overlapping digest ticks.
- `server/features/notifications/notification.service.ts`
  - Prevents duplicate initial deadline/follow-up checks.
  - Clears initial timeout handles on stop.
  - Skips overlapping deadline and follow-up checks.

### Guarded job polling

- `server/jobs/queue.ts`
  - Added an `isPolling` guard so interval and enqueue-triggered polls cannot overlap claim attempts.

### Hardened Asana external calls

- `server/services/asana/asanaClient.ts`
  - Serialized local request throttle through a promise chain.
  - Added a 30s fetch timeout using `AbortSignal.timeout`.

### Added regression coverage

- `server/tests/single-flight.test.ts`
  - Confirms overlapping runs are skipped and later runs execute after completion.

Compatibility considerations:

- Public APIs, database schema, routes, permissions, and response shapes are unchanged.
- Scheduler work still runs on the same cadence; only overlapping executions are skipped.
- Job queue durable claiming behavior is unchanged; only local poll concurrency is constrained.

## Verification Results

| Command | Status | Notes |
|---|---|---|
| `npx vitest run server/tests/single-flight.test.ts` | Pass | New single-flight behavior test passed. |
| `npm run check` | Pass | TypeScript accepted scheduler, queue, and Asana changes. |
| `rg -n "setInterval\\(\\(\\) => \\{ void tick\\(\\); \\}" server --glob '*.ts'` | Pass | No raw server interval `void tick()` scheduler pattern remains. |
| `npm test` | Pass | 62 files, 623 tests passed. |
| `npm run test:client` | Pass | 25 files, 157 tests passed. |
| `npm run build` | Pass | Production build completed; existing Browserslist/Tailwind/PostCSS/chunk-size warnings remain. |
| `npm audit --omit=dev` | Pass | 0 vulnerabilities. |
| `git diff --check` | Pass | No whitespace errors. |

## Second Pass

- Re-scanned server scheduler code after remediation and confirmed the raw overlapping `void tick()` interval pattern is gone.
- Rechecked the job poller path and confirmed overlapping `pollOnce` calls now return early while an existing poll is in progress.
- Confirmed no Critical or High async/concurrency findings remain in this pass.
- Remaining `Promise.all(map(async ...))` findings are Medium/Low follow-up candidates because they require workload measurement or query redesign to change safely.

## Residual Risk and Roadmap

### Immediate

1. Keep scheduler single-flight behavior as the default for any new interval worker.
2. Add explicit selected-notification batch endpoints if support reports bulk selected read/clear storms.
3. Add logging/metrics for skipped scheduler ticks so long-running scheduler work is visible.

### Near Term

1. Add bounded concurrency utility for server-side fan-out where batching is not practical.
2. Convert report fan-outs that hydrate one row at a time into set-based SQL or batched repository methods.
3. Add timeouts to remaining external HTTP calls in QuickBooks and other integration paths.

### Long Term

1. Add database-backed scheduler leasing if Railway ever runs multiple app replicas.
2. Move recurring jobs into the durable job queue when they require cancellation, retries, or operator-visible progress.
3. Add backpressure metrics: queue depth, running jobs by type, scheduler duration, skipped ticks, and external retry counts.

### Do Not Pursue Yet

- Do not introduce a distributed queue service until workload metrics justify it.
- Do not blanket-replace all `Promise.all` usage; many current cases are independent bounded reads.
- Do not add aggressive retries around every external call; retries without idempotency can create duplicate side effects.

## Final Scorecard

| Dimension | Score | Deduction |
|---|---:|---|
| Scheduler overlap safety | 8 | Single-flight now covers reviewed schedulers; multi-replica leasing remains future work. |
| Job queue concurrency | 8 | Durable DB claiming is strong; local polling race fixed; queue metrics can improve. |
| External-call resilience | 7 | Asana now has serialized throttle and timeout; other providers still need timeout consistency. |
| Backpressure | 7 | Uploads and jobs have limits; reporting fan-outs need measurement and gradual batching. |
| Cancellation | 7 | Jobs expose cancellation checks; route/client cancellation is uneven but acceptable. |
| Idempotency/retry behavior | 7 | Jobs track attempts; external retries exist selectively; side-effect idempotency needs per-adapter review. |
| Test coverage | 7 | Added focused single-flight coverage; scheduler/job integration tests could be deeper. |
| Operability | 7 | Logs exist; skipped ticks and queue pressure should become metrics. |
