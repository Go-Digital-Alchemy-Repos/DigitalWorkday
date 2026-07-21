# SLOs, Alerting, and Incident Response Audit - 2026-07-21

## Executive Assessment

Overall score: 6.5/10

Release recommendation: Approve with follow-up.

DigitalWorkday has the core primitives needed for incident response: Railway deployment health, public liveness/readiness endpoints, request IDs, centralized `error_logs`, super-admin status diagnostics, tenant health checks, and deployment smoke checks. The platform did not yet have explicit user-impact SLOs, alert severity routing, deduplication rules, or a repeatable post-deploy SLO command. This pass adds those missing operational contracts without changing user-facing product behavior.

Strongest aspects:

- Health/readiness endpoints exist in `server/index.ts` and Railway is configured to probe `/health` in `railway.toml`.
- Persistent error logs include request, tenant, user, status, DB details, and redaction via `server/middleware/errorLogging.ts`.
- Super-admin diagnostics expose system status, auth diagnostics, DB status, tenancy health, and error-log review paths.

Most important risks:

- No managed paging or external alert destination is configured in the repo.
- Error budgets and burn-rate alerts need measured traffic volume before they are meaningful.
- Business alert rules exist, but they are not platform incident alerts and should not page operators without an explicit routing policy.

## System Map

- Runtime: React 18 + Express/TypeScript, Node 18+, Vite build, PostgreSQL via Drizzle ORM.
- Deployment: Railway via `railway.toml`, GitHub-triggered deployments, `/health` healthcheck, `server/scripts/deploy-smoke.cjs` pre-start checks.
- Persistence: PostgreSQL with Drizzle schema and committed SQL migrations.
- Authentication: cookie/session auth with super-user protected diagnostics.
- Observability: request IDs, structured request logging, error logging table, perf stats endpoints, DB health endpoints, super-admin status dashboard.
- Business alerts: `alert_rules` and `alert_events` in `shared/schema.ts`, routes in `server/http/domains/reports-v2-alerts.router.ts`, UI in `client/src/pages/settings-alerts.tsx`.

Areas inspected:

- `server/index.ts`
- `railway.toml`
- `server/db.ts`
- `server/scripts/deploy-smoke.cjs`
- `server/routes/systemStatus.ts`
- `server/routes/super/systemStatus.router.ts`
- `server/middleware/errorLogging.ts`
- `server/middleware/requestLogger.ts`
- `server/middleware/perfTelemetry.ts`
- `server/middleware/queryTelemetry.ts`
- `server/lib/perfLogger.ts`
- `shared/schema.ts`
- `server/http/domains/reports-v2-alerts.router.ts`
- `client/src/pages/settings-alerts.tsx`
- `docs/12-OPERATIONS/README.md`
- `docs/INCIDENTS.md`
- `docs/ERROR_LOGGING.md`
- `docs/SUPER_SYSTEM_STATUS.md`
- `docs/RAILWAY_VERIFICATION_CHECKLIST.md`

## Findings

| ID | Severity | Confidence | Location | Evidence | Why It Matters | Recommended Remediation | Effort | Risk |
|----|----------|------------|----------|----------|-----------------|-------------------------|--------|------|
| SLO-001 | Medium | Confirmed | `docs/12-OPERATIONS/README.md`, `docs/INCIDENTS.md` | Operations docs listed metrics and incidents but no explicit availability/readiness SLOs, severity levels, paging/ticketing split, or deduplication policy. | Without written SLOs, the team can react inconsistently to production symptoms. | Add SLO/alert/incident-response runbook tied to actual endpoints and Railway workflow. | S | Low |
| SLO-002 | Medium | Confirmed | `package.json`, `docs/RAILWAY_VERIFICATION_CHECKLIST.md` | Release checks included health curl examples but no repeatable command that enforces latency, readiness, and version expectations. | Version drift or degraded readiness can be missed after Railway reports a successful deployment. | Add `npm run slo:check` and document it in deployment verification. | S | Low |
| SLO-003 | Medium | Strongly Supported | `server/http/domains/reports-v2-alerts.router.ts`, `client/src/pages/settings-alerts.tsx`, `shared/schema.ts` | Existing alert rules/events are tenant business alerts with acknowledgement UI, not platform outage paging. | Treating business alerts as platform incidents would create noisy, low-signal paging. | Document the boundary and route business alerts to product workflows unless platform degradation is present. | XS | Low |
| SLO-004 | Medium | Plausible | `server/lib/perfLogger.ts`, `server/middleware/perfTelemetry.ts` | Metrics are in-process counters and logs; no durable external metrics or alert sink is configured. | In-process metrics reset on deploy and cannot support long-window SLO calculations alone. | Add managed uptime/error monitoring before building custom alert infrastructure. | M | Moderate |
| SLO-005 | Low | Confirmed | `docs/INCIDENTS.md` | Incident log has templates and historical incidents, but no severity model or communication cadence. | Postmortems are more useful when severity and response expectations are consistent. | Add severity table and incident workflow in operations docs. | XS | Low |

## Changes Made

- Added `server/scripts/slo-check.cjs`.
  - Checks `/health` and `/readyz`.
  - Enforces latency thresholds.
  - Verifies `ok`, `ready`, and optional release version.
  - Returns non-zero exit status on SLO smoke failure.
- Added `server/tests/slo-check.test.ts`.
  - Covers URL normalization, missing base URL, healthy probe classification, symptom failures, and version drift.
- Added `npm run slo:check` to `package.json`.
- Added `docs/12-OPERATIONS/SLOS_ALERTING_INCIDENT_RESPONSE.md`.
  - Defines SLIs, pilot SLOs, severity routing, deduplication, runbooks, and roadmap.
- Updated `docs/12-OPERATIONS/README.md`.
  - Links the new SLO/incident-response guide.
- Updated `docs/RAILWAY_VERIFICATION_CHECKLIST.md`.
  - Adds SLO smoke check to Railway startup verification.

Compatibility considerations:

- No API routes, database schema, permissions, or product workflows changed.
- The new checker is opt-in and safe to run locally, against staging, or against production.
- The SLO thresholds are pilot defaults and can be overridden with environment variables.

## Verification Results

- `npx vitest run server/tests/slo-check.test.ts` - 1 file / 5 tests passed.
- `SLO_BASE_URL=https://digitalworkday.ai SLO_EXPECTED_VERSION=f8afe4b npm run slo:check` - passed; health 173ms, readiness 60ms, version `f8afe4b`.
- `SLO_BASE_URL=https://digitalworkday-staging.up.railway.app SLO_EXPECTED_VERSION=f8afe4b npm run slo:check` - passed; health 202ms, readiness 136ms, version `f8afe4b`.
- `npx vitest run server/tests/slo-check.test.ts server/tests/requestIdCorrelation.test.ts server/tests/observability-access.test.ts server/tests/system-status.test.ts server/tests/error-logging.test.ts` - 5 files / 63 tests passed.
- `npm run test:ci` - supply-chain check, TypeScript, fast tests, client tests, and production build passed.

Remaining verification before final deployment:

- Railway production and staging deployment/health checks after this commit is pushed.

## Second Pass

No Critical or High findings remain within this scope. The remaining items require external monitoring configuration and measured production data rather than additional local code changes. The changes introduced one standalone script, one focused test file, and documentation updates; no new dependencies, route contracts, migrations, or runtime middleware were added.

## Residual Risk and Roadmap

Immediate:

- Configure external uptime checks for production `/health` and `/readyz`.
- Run `npm run slo:check` after every production and staging deployment.
- Review unresolved `error_logs` daily while the client portal buildout is active.

Near term:

- Add a managed alert sink such as Sentry, Better Stack, or another service selected by operations preference.
- Route SEV-1/SEV-2 alerts to a real notification channel with ownership and escalation.
- Add a lightweight postmortem checklist to every SEV-1 and SEV-2 entry in `docs/INCIDENTS.md`.

Long term:

- Export durable latency/error metrics for burn-rate SLOs.
- Add distributed tracing across HTTP, DB, email, storage, webhooks, and background jobs.
- Recalibrate SLO thresholds after 30 days of production data.

Premature:

- Do not build a custom pager.
- Do not implement multi-window burn-rate paging until request volume supports statistically useful windows.
- Do not page on tenant business alert events by default.

## Final Scorecard

- SLI/SLO clarity: 7/10. New definitions exist; needs measured calibration.
- Alert routing: 6/10. Severity and routing are documented; external alert channels still need configuration.
- Incident runbooks: 7/10. Core workflows are documented; more scenario-specific runbooks can be added after real incidents.
- Release verification: 8/10. SLO checker now validates health, readiness, latency, and version.
- Error diagnostics: 8/10. Request IDs and error logs are strong for current scale.
- Burn-rate maturity: 3/10. Not yet implemented, appropriately deferred.
- Overall operability: 7/10. Good pilot readiness with clear next steps for managed alerting.
