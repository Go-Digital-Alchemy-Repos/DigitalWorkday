# Scalability, Capacity, and Growth-Readiness Review - 2026-07-21

## Executive Assessment

Overall score: 7.5/10.

Release recommendation: Approve with follow-up for the current pilot and near-term client portal rollout. Do not scale beyond the current single-tenant/pilot shape without setting Railway pool caps, measuring DB saturation, and adding synthetic portal checks.

Strongest aspects:
- Core list/reporting paths already use bounded pagination in `server/reports/utils.ts`, `server/reports/forecasting/snapshotService.ts`, and related report calculators.
- The app has DB pool telemetry through `server/db.ts`, observability endpoints in `server/index.ts`, and SLO probes in `server/scripts/slo-check.cjs`.
- The recent release gate, deploy smoke check, guarded migrations, and Railway `/health` wiring give a practical deploy foundation before adding complexity.

Most important risks:
- Postgres connection capacity was previously implicit: `server/db.ts` hard-coded the app pool at `max=10`, while `server/auth.ts` created a separate session pool with default sizing.
- Capacity planning still depends on live Railway metrics. The repository can estimate per-replica connection ceilings, but it cannot prove production/staging headroom without observing pool waiters, query latency, and Railway Postgres limits.
- Realtime chat/project sockets are in-process. That is fine for one Railway replica, but horizontal scaling will require sticky sessions or a Socket.IO adapter.

## System Map

Application type: Node/Express API with React/Vite frontend, PostgreSQL through Drizzle and `pg`, session auth through Passport/Express Session with `connect-pg-simple`, Socket.IO realtime, npm `11.16.0`, TypeScript `5.6.3`, Railway deployment via `railway.toml`.

Capacity-critical execution paths inspected:
- HTTP/API request path: `server/index.ts` middleware, route registration, JSON body limit, health and readiness endpoints.
- Database path: `server/db.ts`, Drizzle queries, pool stats, DB health endpoint, report pagination helpers.
- Auth/session path: `server/auth.ts`, PostgreSQL session table/store, Passport login flows.
- Rate-limited paths: `server/middleware/rateLimit.ts` for login, invites, uploads, chat sends, and client messages.
- Realtime path: `server/socket.ts`, `client/src/lib/realtime/socket.ts`, chat/project room usage.
- Background and external dependency paths: `server/services/emailOutbox.ts`, Asana retry/pagination in `server/services/asana/asanaClient.ts`, alert/digest flags in `server/config.ts`.
- Operational paths: Railway config, SLO smoke checks, readiness/observability endpoints, deployment and environment docs.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SCALE-001 | High | Confirmed | Cross-cutting | `server/db.ts`, `server/auth.ts` | App pool was fixed at `max: 10`; session store created a second `Pool` without app-level capacity configuration. | Railway replicas multiply connection usage. With one app pool plus one session pool per replica, DB exhaustion can happen before CPU or memory is saturated. | Added explicit `DB_POOL_MAX`, `DB_POOL_MIN`, `SESSION_DB_POOL_MAX`, and `SESSION_DB_POOL_MIN` parsing and applied it to both pools. | S | Low | `npx vitest run server/tests/db-pool-config.test.ts` |
| SCALE-002 | Medium | Strongly Supported | Operability | `/readyz` in `server/index.ts` | `/readyz` checked DB connectivity but did not expose pool stats. | During spikes, pool waiting count is one of the first practical saturation signals. | Include `dbHealth.pool` in ready/degraded readiness responses. | XS | Low | Typecheck and build in `npm run test:ci` |
| SCALE-003 | Medium | Strongly Supported | Systemic | `server/socket.ts`, realtime client hooks | Realtime state is in-process and socket rooms are local to the Node instance. | Horizontal scaling to multiple app replicas can fragment realtime delivery unless Railway routing is sticky or Socket.IO uses a shared adapter. | Keep one replica for pilot; before multi-replica, add sticky-session validation or Redis/Postgres adapter design. | M | Moderate | Future multi-replica staging test |
| SCALE-004 | Medium | Plausible | Feature-wide | DB/report routes and large tenant data | Reports have bounded pagination, but no production query-plan evidence was found for 100x tenant data. | Large-tenant imbalance can turn acceptable queries into slow or pool-saturating ones. | Capture `EXPLAIN ANALYZE` on top portal/dashboard/report queries against staging-sized data before broad rollout. | M | Low | Future staging data-volume drill |
| SCALE-005 | Low | Strongly Supported | Operability | `server/middleware/rateLimit.ts` | Rate limits are in-memory and documented as such. | In-memory limits are acceptable for one replica but inconsistent across horizontal replicas. | Keep for current pilot; move to a shared store only when multi-replica traffic is planned. | M | Moderate | Future multi-replica rate-limit test |

## Changes Made

- Added `server/dbPoolConfig.ts` to centralize app/session Postgres pool sizing.
- Updated `server/db.ts` to use `DB_POOL_MAX` and `DB_POOL_MIN` with existing defaults of app `min=2`, `max=10`.
- Updated `server/auth.ts` so the session store uses `SESSION_DB_POOL_MAX`, `SESSION_DB_POOL_MIN`, production SSL parity, and the same timeout posture as the app pool.
- Updated `/readyz` in `server/index.ts` to include current DB pool stats.
- Added `server/tests/db-pool-config.test.ts` for default, capped, invalid, and clamped pool sizing behavior.
- Documented pool capacity variables in `docs/ENVIRONMENT_VARIABLES.md`, `docs/RAILWAY_DEPLOYMENT_CHECKLIST.md`, and `railway.toml`.

Compatibility considerations: defaults preserve current app pool behavior and add a conservative session pool default of five connections per replica. Operators can now deliberately cap per-replica DB demand without code changes.

## Verification Results

Commands executed:
- `npx vitest run server/tests/db-pool-config.test.ts`
- `npm run production:check`
- `npm run test:ci`

Expected remaining gaps:
- Docker build could not be proven in the previous container review because this workstation had no active Docker daemon.
- Live Railway production/staging capacity cannot be proven from repository state alone. Confirm with Railway metrics, DB connection limits, `/readyz`, and `SLO_BASE_URL=<env> npm run slo:check`.

## Residual Risk And Roadmap

Immediate:
- Set explicit Railway variables for production and staging: `DB_POOL_MAX=10` and `SESSION_DB_POOL_MAX=5` unless Railway Postgres limits require lower values.
- For each Railway service, calculate maximum DB connections as `(DB_POOL_MAX + SESSION_DB_POOL_MAX) * app replicas`, leaving headroom for migrations, psql sessions, and Railway maintenance.
- Watch `/readyz` pool `waiting` and DB health latency during the next customer portal validation session.

Near term:
- Build a staging data-volume script for 10x users, 100x tenants, and large-tenant skew, then capture query timings for dashboard, portal projects, portal tasks, notifications, comments, chat, and reports.
- Add synthetic checks for client portal dashboard load, project/task list load, comments visibility, notification clear, and invite acceptance.
- Create a "scale envelope" doc recording current Railway plan limits, DB connection cap, expected replica count, target concurrent users, and observed p95 latency.

Long term:
- Add a shared Socket.IO adapter only when multi-replica realtime becomes a concrete requirement.
- Move rate limiting to a shared store only when multiple app replicas are active.
- Consider dedicated queues for email, integrations, forecasting alerts, and weekly digests after backlog metrics show in-process work is delaying interactive requests.

Not justified yet:
- Kubernetes, service mesh, CQRS/event sourcing, read replicas, sharding, distributed tracing infrastructure beyond current needs, global CDN invalidation architecture, or a dedicated queue cluster. These add operational load before the product has measured bottlenecks that require them.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Connection capacity control | 8 | Pool sizes are now explicit; live Railway caps still need confirmation. |
| Query scalability | 7 | Pagination exists; 100x data-volume query plans are not yet measured. |
| Realtime scalability | 6 | Good for one replica; multi-replica socket delivery needs shared adapter/sticky validation. |
| Backpressure | 7 | Timeouts, rate limits, and deploy smoke checks exist; background workload queues are still lightweight. |
| Observability | 8 | Pool stats, readiness, SLO probes, and observability endpoints exist. |
| Operational readiness | 8 | Docs and release gates are strong; staging load drills remain. |
| Complexity discipline | 9 | No premature distributed-system changes were added. |
