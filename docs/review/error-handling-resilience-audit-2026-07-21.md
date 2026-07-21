# Error Handling, Fault Tolerance, and Resilience Audit - 2026-07-21

## Executive Assessment

**Overall score:** 7.4 / 10  
**Release recommendation:** Approve with follow-up

### Strongest Aspects

1. **A standard API error envelope exists.** `server/lib/errors.ts`, `server/middleware/errorHandler.ts`, and the recent API-contract tests enforce `ok`, `success`, `requestId`, `error.code`, and legacy compatibility fields.
2. **Database error logging is already isolated from response handling.** `server/middleware/errorLogging.ts` captures important 500/403/404/429 errors and intentionally does not block the user response if logging fails.
3. **Deployment smoke and health behavior are production-aware.** `railway.toml` runs `node server/scripts/deploy-smoke.cjs && npm run start`, and `/health` reports readiness and commit version.

### Most Important Risks

1. **Console error logs could leak secrets before this pass.** DB error log persistence redacted secrets, but `errorHandler` and `handleRouteError` printed raw messages/stacks to stdout/stderr.
2. **QuickBooks external HTTP calls had no timeout.** Asana had a timeout from the prior async pass; QuickBooks OAuth and company checks could still hang on a slow upstream.
3. **There is no explicit process-level unhandled rejection/uncaught exception policy.** `server/index.ts` handles SIGTERM/SIGINT gracefully, but does not currently define what to do for unhandled promise rejections or uncaught exceptions.

## System Map

### Error Flow

1. Routes either call `handleRouteError`, `sendError`, return inline legacy errors, or pass errors to Express.
2. `server/middleware/errorLogging.ts` captures selected errors to `error_logs` with redaction and fail-open behavior.
3. `server/middleware/errorHandler.ts` normalizes `AppError`, `ZodError`, PostgreSQL errors, and generic errors into the standard envelope.
4. `server/lib/errors.ts` provides route helper functions used by most modern route modules.
5. Client routes display safe server messages through React Query/API helpers, with some older pages still throwing generic `"Failed"` messages.

### Resilience Areas Inspected

- Error taxonomy and envelope helpers: `server/lib/errors.ts`, `server/middleware/errorHandler.ts`, `server/errors/envelope.ts`.
- Error persistence and secret redaction: `server/middleware/errorLogging.ts`, `server/tests/error-logging.test.ts`.
- Process startup/shutdown: `server/index.ts`.
- External calls and timeouts: `server/services/asana/asanaClient.ts`, `server/services/tenantIntegrations.ts`, `server/routes/tenantOnboarding.ts`.
- Existing tests: `server/tests/errorHandling.test.ts`, `server/tests/error-envelope-consistency.test.ts`, `server/tests/standard-error-codes.test.ts`, `server/tests/legacy-error-shapes.test.ts`.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why It Matters | Recommended Remediation | Effort | Risk |
|---|---|---:|---|---|---|---|---|---|---|
| EHR-01 | Medium | Confirmed | Cross-cutting | `server/middleware/errorHandler.ts`, `server/lib/errors.ts` | `errorLogging.ts` redacted before DB persistence, but `errorHandler` logged raw `err.message` and `err.stack`; `handleRouteError` logged the raw error object. | Secrets embedded in thrown errors, DB URLs, API keys, bearer tokens, or upstream error bodies could reach Railway logs. | Added shared redaction utility and applied it to global/route console error logs. | S | Low |
| EHR-02 | Medium | Confirmed | Feature-wide | `server/services/tenantIntegrations.ts`, `server/routes/tenantOnboarding.ts` | QuickBooks token refresh, company check, and callback token exchange used raw `fetch` without timeout. | A slow/stalled upstream could hold a request open until platform/network timeout, tying up resources and creating poor operator signals. | Added `externalFetch` with a 30s default timeout and routed QuickBooks/Asana external fetches through it. | S | Low |
| EHR-03 | Medium | Strongly Supported | Systemic | `server/index.ts` | `SIGTERM` and `SIGINT` are handled by `gracefulShutdown`, but `rg` found no `process.on("unhandledRejection")` or `process.on("uncaughtException")`. | Undefined process behavior for unhandled fatal errors can cause either silent degradation or abrupt shutdown without consistent logs. | Define a process-level fatal error policy in a dedicated follow-up: log redacted fatal context, stop accepting traffic, drain resources, and exit. | S | Moderate |
| EHR-04 | Low | Confirmed | Cross-cutting | `server/auth.ts`, `server/http/domains/*`, legacy route modules | Many legacy handlers still return direct `res.status(...).json({ error: "..." })` shapes. Recent API-contract work preserved compatibility, but migration is incomplete. | Mixed error shapes increase client handling complexity and make taxonomy less enforceable. | Continue migrating touched routes to `AppError`, `sendError`, `handleRouteError`, and validation middleware. | L | Moderate |
| EHR-05 | Low | Plausible | Feature-wide | `server/services/ai/aiService.ts`, `server/services/tenantIntegrations.ts`, `server/services/emailOutbox.ts` | External adapters catch and rethrow generic `Error` values in several places; cause chains are not consistently preserved. | Operators may lose root-cause detail across layers while user responses remain generic. | Add cause-preserving wrapper helpers when touching each adapter; avoid changing all call sites in one sweep. | M | Low |
| EHR-06 | Informational | Confirmed | Local | `server/middleware/errorLogging.ts` | `captureError` wraps persistence in its own try/catch and does not throw back into request handling. | This is good failure isolation: logging outages should not break tenant workflows. | Preserve this pattern. | XS | Low |

## Changes Made

### Centralized secret redaction

- Added `server/lib/redaction.ts`.
- Updated `server/middleware/errorLogging.ts` to re-use and re-export the shared redaction functions.
- Updated `server/middleware/errorHandler.ts` to redact console `message` and `stack`.
- Updated `server/lib/errors.ts` so `handleRouteError` logs a sanitized summary instead of the raw error object.

### Bounded external HTTP calls

- Added `server/lib/fetchWithTimeout.ts` with `externalFetch`.
- Updated `server/services/asana/asanaClient.ts` to use the shared helper while preserving the 30s timeout behavior added in the async pass.
- Updated QuickBooks calls in `server/services/tenantIntegrations.ts` and `server/routes/tenantOnboarding.ts` to use `externalFetch`.

### Focused tests

- Extended `server/tests/errorHandling.test.ts` to verify global and route helper console logs redact secrets.
- Added `server/tests/fetch-with-timeout.test.ts` to verify timeout signal attachment and caller signal preservation.

Compatibility considerations:

- Public API responses are unchanged.
- Existing `redactSecrets` imports from `server/middleware/errorLogging.ts` continue to work through re-export.
- External HTTP calls now fail with abort semantics after 30 seconds instead of hanging indefinitely.

## Verification Results

| Command | Status | Notes |
|---|---|---|
| `npx vitest run server/tests/errorHandling.test.ts server/tests/error-logging.test.ts server/tests/fetch-with-timeout.test.ts` | Pass | 3 files, 47 tests passed. |
| `npm run check` | Pass | TypeScript accepted the redaction and timeout changes. |
| `rg -n "await fetch\\(" server --glob '*.ts'` | Pass | Only raw server `fetch` remaining is in `server/tests/time_tracking_division_cascade.test.ts`. |
| `npm test` | Pass | 63 files, 627 tests passed. |
| `npm run test:client` | Pass | 25 files, 157 tests passed. |
| `npm run build` | Pass | Production build completed; existing Browserslist/Tailwind/PostCSS/chunk-size warnings remain. |
| `npm audit --omit=dev` | Pass | 0 vulnerabilities. |
| `git diff --check` | Pass | No whitespace errors. |

## Second Pass

- Confirmed route and global console error paths no longer log raw error objects/messages.
- Confirmed server production external `fetch` calls now use `externalFetch`; the only raw server `await fetch` is test-only.
- Confirmed no Critical or High error-handling/resilience findings remain in this pass.
- Deferred process-level fatal error policy because it changes runtime failure behavior and deserves its own tightly reviewed change.

## Residual Risk and Roadmap

### Immediate

1. Preserve the standard error envelope for all new endpoints.
2. Use `externalFetch` for any new server-side HTTP integration.
3. Keep error logs redacted in both DB persistence and console output.

### Near Term

1. Add explicit `unhandledRejection` and `uncaughtException` policy in `server/index.ts`.
2. Add cause-preserving error wrappers for AI, Mailgun, Stripe, and QuickBooks adapters.
3. Convert legacy direct auth/route errors to `AppError` as those files are touched.

### Long Term

1. Add per-provider resilience policy: timeout, retryable statuses, idempotency expectations, and safe user-facing messages.
2. Add structured error metrics by `error.code`, route, tenant, and upstream provider.
3. Add chaos/fault tests for integration timeouts and failed email/storage/AI providers.

### Do Not Pursue Yet

- Do not add blanket retries to all external calls; retries need idempotency and provider-specific rate-limit handling.
- Do not expose detailed upstream errors to client users.
- Do not rewrite every legacy route error shape in one broad pass.

## Final Scorecard

| Dimension | Score | Deduction |
|---|---:|---|
| Error taxonomy | 8 | Strong `AppError`/envelope foundation; legacy direct responses remain. |
| Safe user messages | 8 | Generic 500 behavior and normalized DB errors are good; older routes vary. |
| Secret-safe logging | 8 | Console and DB paths now redact; future direct `console.error` sites need discipline. |
| External timeout behavior | 8 | Server `fetch` integrations now bounded; SDK-based providers still need adapter-level policy review. |
| Retry behavior | 7 | Asana has targeted retries; broad provider retry policy remains incomplete. |
| Failure isolation | 8 | Error logging fails open; background scheduler/job isolation has improved in prior pass. |
| Process-level resilience | 6 | Graceful SIGTERM/SIGINT exists; unhandled fatal error policy is absent. |
| Test coverage | 8 | Focused error envelope, redaction, and timeout tests exist; fault-injection tests remain future work. |
| Operability | 7 | Request IDs and error logs help; structured provider/fatal metrics are still needed. |
