# Observability and Diagnostics Review - 2026-07-21

## Executive Assessment

DigitalWorkday has a practical observability foundation for the current single-tenant pilot: request correlation, structured request logs, centralized error capture, health/readiness endpoints, super-admin diagnostics, deployment smoke checks, schema readiness checks, and opt-in performance telemetry are already present. The system is usable for production incident triage, especially when a user can provide a request ID from an error response or toast.

The main gaps are consistency and depth rather than absence. Some diagnostic routes still had raw console logging, request ID intake was too trusting, database/query metrics are in-process rather than durable, and tracing is not yet end-to-end across async jobs or external service calls.

## System Map

- Request correlation: `server/middleware/requestId.ts` attaches `req.requestId` and returns `X-Request-Id`.
- Request logs: `server/middleware/requestLogger.ts` logs method, path, status, duration, requestId, tenantId, and userId, excluding health/static noise.
- Error capture: `server/middleware/errorLogging.ts` writes selected 4xx and 5xx failures to `error_logs` with request, tenant, user, path, status, DB code, environment, and redacted message/meta.
- Error envelope: `server/middleware/errorHandler.ts` returns stable API error payloads with request IDs and redacts server-side logs.
- Diagnostics: `server/routes/super/systemStatus.router.ts` exposes super-admin health, auth diagnostics, DB/schema status, migration status, and manual check endpoints.
- Performance telemetry: `server/middleware/perfTelemetry.ts`, `server/middleware/queryTelemetry.ts`, and `server/lib/perfLogger.ts` support slow request/query counters and structured slow-operation logs.
- Readiness: `server/startup/schemaReadiness.ts` checks required tables/columns, including observability tables.
- Deployment validation: `server/scripts/deploy-smoke.cjs` validates health, readiness, API JSON behavior, and config presence without printing raw secret values.

## Findings

- High: inbound `X-Request-Id` was accepted without validation or length limits. A malformed client header could be echoed into responses and logs, weakening log hygiene and incident readability.
- Medium: super-admin diagnostics used raw `console.error` logging for health/auth/DB failures. Those logs lacked structured request context and could include unredacted exception details.
- Medium: slow query logging records query text snippets but does not attach request/tenant context. This is useful for local diagnosis but weaker for production correlation.
- Medium: performance metrics are in-memory counters only. They reset on deploy and are not aggregated across Railway instances.
- Low: health/liveness endpoints intentionally run before full middleware, so public probes do not receive request IDs. That is acceptable for platform checks but less useful for manual curl diagnostics.
- Low: diagnostics coverage exists, but tests still rely on some local mock routes rather than exercising every production route directly.

## Changes Made

- Hardened request ID intake in `server/middleware/requestId.ts`.
  - Preserves safe external trace IDs.
  - Rejects empty, oversized, or unsafe values.
  - Falls back to generated UUIDs for invalid inbound IDs.
- Updated `server/tests/requestIdCorrelation.test.ts` to use the real request ID middleware.
  - Added regression coverage for control-character and oversized request IDs.
- Converted super diagnostics failure logs in `server/routes/super/systemStatus.router.ts` to structured logger calls.
  - Adds request/tenant/user context where available.
  - Redacts exception messages before logging or returning diagnostic failure details.

## Verification

- `npx vitest run server/tests/requestIdCorrelation.test.ts` - 14 tests passed.
- `npx vitest run server/tests/requestIdCorrelation.test.ts server/tests/observability-access.test.ts server/tests/system-status.test.ts server/tests/error-logging.test.ts` - 58 tests passed.
- `npm run test:http` - 19 files / 247 tests passed.
- `npm run test:ci` - supply-chain check, TypeScript, fast tests, client tests, and production build passed.

Deployment verification pending:

- Railway production and staging health checks after deployment.

## Residual Risk

- There is no distributed tracing implementation yet. Request IDs provide correlation, but spans across DB, email, file storage, webhooks, and background jobs remain manual.
- Query telemetry needs a request context bridge before slow DB logs can reliably answer "which tenant/user/request caused this?"
- Some legacy routes still use raw console logging. The highest-risk diagnostics cluster is now improved, but a broader logging normalization pass remains worthwhile.
- Runtime metrics are not exported to a managed metrics system. Railway logs plus super-admin status are workable today, but trend analysis and alerting remain limited.

## Scorecard

- Request correlation: 8/10
- Structured logging consistency: 7/10
- Error capture and redaction: 8/10
- Health/readiness diagnostics: 8/10
- Metrics depth: 5/10
- Tracing coverage: 3/10
- Incident usefulness today: 7/10
