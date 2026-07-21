# SLOs, Alerting, and Incident Response

**Status:** Current  
**Last Updated:** July 21, 2026

This document defines production service-level indicators, service-level objectives, alert routing, and incident workflow for DigitalWorkday on Railway.

## Service Ownership

| Area | Owner | Backup | Escalation |
|------|-------|--------|------------|
| Production application | Digital Alchemy engineering | Platform admin | Business owner |
| Railway deployment and runtime | Digital Alchemy engineering | Platform admin | Railway support when platform issue is suspected |
| PostgreSQL data integrity | Digital Alchemy engineering | Platform admin | Business owner before destructive repair |
| Tenant/client access incidents | Digital Alchemy engineering | Tenant admin | Business owner |

## User-Impact SLIs

| SLI | Source | Why It Matters |
|-----|--------|----------------|
| Availability | `GET /health`, Railway deployment health, external uptime monitor | Users can reach the app shell and API process is alive. |
| Readiness | `GET /readyz`, `GET /api/v1/system/health/db` | Authenticated workflows depend on database connectivity. |
| Error rate | `error_logs` table plus Railway request logs | Captures 5xx failures and key 403/404/429 conditions with request IDs. |
| Latency | Request logs, `/api/v1/system/perf/stats`, `npm run slo:check` | Slow requests cause user-facing degradation before total outage. |
| Deployment freshness | `/health.version` compared to expected Git commit | Confirms production and staging are running the intended release. |
| Tenant data health | `/api/v1/super/tenancy/health`, `/api/v1/super/status/summary` | Missing tenant context can become data visibility or workflow defects. |

## Initial SLO Targets

These are pilot-stage SLOs. They should be tuned after at least 30 days of measured production data.

| Capability | Objective | Measurement Window | Page When |
|------------|-----------|--------------------|-----------|
| App availability | 99.5% successful `/health` checks | 30 days | 2 consecutive failed checks or 5 failures in 10 minutes |
| DB readiness | 99.0% successful `/readyz` checks | 30 days | 2 consecutive failed checks |
| Health latency | p95 `/health` under 1s | 7 days | 3 consecutive checks over 1s |
| Readiness latency | p95 `/readyz` under 1.5s | 7 days | 3 consecutive checks over 1.5s |
| Server errors | Fewer than 1% 5xx responses | 24 hours | Any sustained 5xx spike for 10 minutes |
| Deployment correctness | Production/staging health version equals latest deployed commit | Per deployment | Version mismatch after Railway reports success |

## Alert Routing

| Severity | Symptoms | Route | Response Target |
|----------|----------|-------|-----------------|
| SEV-1 | Production unavailable, login broadly broken, database unreachable, suspected cross-tenant data exposure | Page immediately | Start triage within 15 minutes |
| SEV-2 | Major feature broken for multiple users, repeated 5xx errors, portal access outage, deployment rollback required | Page during business hours, otherwise urgent ticket | Start triage within 1 hour |
| SEV-3 | Single-tenant or single-user defect with workaround, elevated latency without outage | Ticket | Same or next business day |
| SEV-4 | Documentation, cosmetic issue, non-urgent warning | Backlog | Planned maintenance |

## Deduplication Rules

- Deduplicate alerts by environment, endpoint, and symptom for 30 minutes.
- Attach the current Git version from `/health.version` to every alert.
- Attach at least one request ID when the symptom comes from an application error.
- Do not page on a single transient slow check unless it repeats.
- Do not page on business alert events such as client health or support SLA breach unless the platform itself is degraded.

## Manual SLO Check

Run against production:

```bash
SLO_BASE_URL=https://digitalworkday.ai npm run slo:check
```

Run against staging and confirm a release version:

```bash
SLO_BASE_URL=https://digitalworkday-staging.up.railway.app SLO_EXPECTED_VERSION=f8afe4b npm run slo:check
```

The checker fails when `/health` or `/readyz` is unavailable, too slow, reports `ok=false` or `ready=false`, or returns a different release version than expected.

## Incident Workflow

1. Assign an incident commander and severity.
2. Confirm current deployment state in Railway for production and staging.
3. Run `npm run slo:check` against the affected environment.
4. Check `/api/v1/super/status/summary` and `/api/v1/super/status/error-logs`.
5. If users supplied a reference ID, search Railway logs and error logs by request ID.
6. Decide: mitigate, rollback, disable feature flag, or continue diagnosis.
7. Communicate status, scope, workaround, and next update time.
8. After resolution, add a postmortem entry to `docs/INCIDENTS.md`.

## Runbooks

### Production Unavailable

- Check Railway deployment status for the `DigitalWorkday` service.
- Run `SLO_BASE_URL=https://digitalworkday.ai npm run slo:check`.
- If `/health` fails and the latest deployment is new, roll back in Railway to the previous successful deployment.
- If `/health` passes but `/readyz` fails, investigate database health and Railway PostgreSQL status before restarting.

### Login or Session Failure

- Open `/api/v1/super/status/auth-diagnostics` as a super user.
- Verify `SESSION_SECRET`, secure cookies, trust proxy, and configured app base URL.
- Check recent error logs for 401/403 spikes and auth route failures.

### Database Degraded

- Check `/readyz` and `/api/v1/system/health/db`.
- Check `/api/v1/super/status/db` for migration or schema readiness issues.
- Review pool stats for active/waiting saturation.
- Avoid `drizzle-kit push` against staging or production. Use committed migrations only.

### Portal Access Incident

- Confirm the user exists, is active, and has portal access configured.
- Verify tenant/client access relationships before changing permissions.
- Review error logs by affected user, tenant, and request ID.

## Alert Implementation Roadmap

Immediate:

- Configure an external uptime monitor for production `/health` and `/readyz`.
- Run `npm run slo:check` after every production and staging deployment.
- Treat version mismatch as a release verification failure.

Near term:

- Add a managed error/alerting sink such as Sentry or Better Stack.
- Create notification channels for SEV-1 and SEV-2 alerts.
- Add daily unresolved `error_logs` review.

Long term:

- Add distributed tracing across HTTP, DB, email, storage, webhooks, and background jobs.
- Export request/error/latency metrics to a durable metrics backend.
- Track error-budget burn rates once there is enough traffic to make rates statistically meaningful.

## Premature Work to Avoid

- Do not build an in-house pager system while Railway logs and a managed alerting product can cover this stage.
- Do not create complex burn-rate paging until traffic volume supports meaningful windows.
- Do not page staff for every business-level alert rule. Client health and support SLA events are product workflows, not platform incidents by default.
