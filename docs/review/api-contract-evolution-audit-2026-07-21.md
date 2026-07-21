# API Contract And Evolution Review

Date: 2026-07-21
Scope: Express API route mounting, response envelopes, validation, error taxonomy, auth/tenant policies, pagination conventions, rate limits, file contracts, documentation, and contract tests.

## 1. Executive Assessment

Overall score: 7/10 after remediation.

Release recommendation: Approve with follow-up. The production contract is safer after this pass because new and legacy envelope fields are now additive-compatible in the shared helpers, but many legacy routes still return raw or bespoke JSON responses.

Strongest aspects:
- `server/http/mount.ts` centralizes 57 registered API route mounts with explicit policies: 40 `authTenant`, 10 `superUser`, 6 `authOnly`, and 1 `public`.
- `server/http/routerFactory.ts` applies policy middleware and `responseEnvelopeMiddleware` to factory routers, giving newer domains a clear contract path.
- Request IDs are applied by `server/middleware/requestId.ts` and are propagated through standard error handling for log correlation.

Most important risks:
- Legacy routes still contain many direct `res.status(...).json(...)` responses; a static scan counted 988 direct status-json patterns outside scripts/tests.
- Validation is split across `server/middleware/validate.ts`, `server/http/middleware/validateBody.ts`, and helper functions in `server/lib/errors.ts`.
- API registry docs are useful but not complete enough to serve as the source of truth for versioning, deprecation, pagination, idempotency, and file contracts.

## 2. System Map

Application type: multi-tenant project management and client portal web app.

Runtime and architecture:
- Frontend: React 18, TypeScript, Vite, TanStack Query, Wouter.
- Backend: Express, TypeScript, Passport session auth, Socket.IO.
- Persistence: PostgreSQL with Drizzle ORM.
- Deployment: Railway Railpack via `railway.toml`; `/health` is the deploy health endpoint.
- API mounting: `server/http/mount.ts` registers domain routers into `server/http/routeRegistry.ts`.
- Auth and tenancy: `server/http/policy/requiredMiddleware.ts`, `server/auth.ts`, `server/middleware/tenantContext.ts`, and route-level helpers.
- Errors: `server/middleware/errorHandler.ts`, `server/lib/errors.ts`, `server/http/policy/responseEnvelope.ts`, `server/middleware/apiJsonGuard.ts`.
- Validation: Zod schemas from `shared/schema.ts` and route-local schemas through validation middleware and helper functions.

Areas inspected:
- API docs: `docs/04-API/README.md`, `docs/api/error-contract.md`, `docs/17-API-REGISTRY/*`.
- Route registry/mounting/policies: `server/http/*`, `server/routes/*`, `server/http/domains/*`.
- Middleware: request ID, validation, error handler, JSON guard, rate limiting, tenant context, agreement enforcement.
- Tests: `server/tests/legacy-error-shapes.test.ts`, route policy drift tests, smoke tests, tenant/task API tests.

## 3. Findings Table

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Recommended remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-01 | Medium | Confirmed | Cross-cutting | `server/http/policy/responseEnvelope.ts`, `server/middleware/errorHandler.ts`, `server/lib/errors.ts`, `server/http/middleware/validateBody.ts` | Before remediation, some helpers returned only `ok`, while newer docs and helpers expected `success`; validation middleware omitted `ok`; `res.sendError` omitted error `status` and nested `requestId`. | Mixed envelopes make client evolution brittle and force frontend code to special-case endpoint families. | Additive-compatible envelope fields: preserve legacy `ok/message/code/details` while adding `success`, nested `status`, and nested `requestId`. | S | Low | Added `server/tests/api-contract-envelope.test.ts`; existing legacy error tests still pass. |
| API-02 | Medium | Confirmed | Systemic | `server/**` | Static scan found 988 direct `res.status(...).json(...)` patterns outside scripts/tests. | Direct responses bypass shared envelope and validation conventions, increasing drift risk. | Migrate endpoint families incrementally, prioritizing auth/invite, client portal, uploads, support, and billing. Do not mass rewrite all routes at once. | L | Moderate | Static scan plus route-family contract tests. |
| API-03 | Medium | Confirmed | Cross-cutting | `server/middleware/validate.ts`, `server/http/middleware/validateBody.ts`, `server/lib/errors.ts` | Validation code existed in three places with different response shapes and detail fields. | Inconsistent validation details reduce client reliability and weaken API docs. | This pass normalized Zod detail `code` and additive envelope fields. Longer term, converge new routes on `server/http/middleware/validateBody.ts`. | M | Low/Moderate | Targeted validation contract test. |
| API-04 | Low | Strongly Supported | Cross-cutting | `server/middleware/rateLimit.ts` | Rate-limit responses had `ok: false` but no `success: false`, status, or top-level requestId in several handlers. | API clients and support workflows need consistent correlation and retry handling. | Added additive `success: false`, top-level `requestId`, and `error.status`. | XS | Low | Typecheck and contract review. |
| API-05 | Medium | Strongly Supported | Systemic | `docs/17-API-REGISTRY/00-README.md`, `server/http/mount.ts` | Docs list a small draft domain table, while runtime registry has 57 mounts. | Incomplete docs weaken versioning and deprecation decisions. | Mark runtime registry as source of truth and generate or validate docs coverage from it. | M | Low | Updated registry README note; future docs coverage check recommended. |
| API-06 | Low | Plausible | Feature-wide | List endpoints across reports, notifications, support, chat, CRM | Pagination exists but uses mixed cursor, limit/offset, and route-local caps. Examples: `server/reports/utils.ts`, `server/storage/notifications.repo.ts`, `server/storage/support.repo.ts`. | Mixed pagination is acceptable internally but should be explicitly documented per endpoint to avoid client assumptions. | Add endpoint-level pagination contract docs and tests for limits/caps on public client-facing surfaces. | M | Low | Future endpoint contract tests. |
| API-07 | Informational | Needs Measurement | Cross-cutting | Mutating POST endpoints | Idempotency is documented only ad hoc; uploads and delete paths have some idempotent behavior but not a general header/key contract. | Retried requests can duplicate side effects if clients retry after network failures. | Add idempotency only to high-risk endpoints: invites, payments/billing initialization, file completion, imports. Avoid generic idempotency middleware until use cases are clear. | L | Moderate | Endpoint-specific tests with repeated requests. |

## 4. Changes Made

Files modified:
- `server/http/policy/responseEnvelope.ts`: made `res.ok`, `res.fail`, `res.sendSuccess`, and `res.sendError` additive-compatible across `ok` and `success` envelopes.
- `server/middleware/errorHandler.ts`: added `success: false` and Zod issue `code` to standard error responses.
- `server/lib/errors.ts`: added additive `success: false`, top-level request IDs for `AppError.toJSON`, richer API error fields, and Zod issue codes.
- `server/http/middleware/validateBody.ts`: added legacy-compatible `ok: false`, nested `status`, and nested `requestId`.
- `server/middleware/validate.ts`: added Zod issue codes to validation details passed into `AppError`.
- `server/middleware/apiJsonGuard.ts`: aligned API 404 and HTML-intercept envelopes with `ok`, `success`, and top-level requestId.
- `server/middleware/rateLimit.ts`: aligned rate-limit envelopes with `success`, top-level requestId, and error status.
- `server/tests/api-contract-envelope.test.ts`: added focused contract tests for success, failure, validation, sendError, and API 404 envelopes.
- `docs/api/error-contract.md`: updated current additive envelope contract.
- `docs/17-API-REGISTRY/00-README.md`: clarified that runtime route registry is the source of truth.
- `docs/review/api-contract-evolution-audit-2026-07-21.md`: added this audit.

Compatibility:
- No routes, methods, auth policies, database schema, migrations, or response payload data were removed.
- Envelope changes are additive. Existing clients reading `ok`, `message`, `code`, `details`, `error`, or `requestId` remain supported.

## 5. Verification Results

Passed:
- `npm run check`
- `npx vitest run server/tests/api-contract-envelope.test.ts server/tests/legacy-error-shapes.test.ts`

Evidence commands:
- Static direct response scan: 988 direct `res.status(...).json(...)` patterns outside scripts/tests.
- Validation usage scan: 44 validation middleware/helper references outside scripts/tests.
- Runtime registry introspection: 57 route mounts; policies were 40 `authTenant`, 10 `superUser`, 6 `authOnly`, 1 `public`.

Note:
- Runtime registry introspection was stopped after producing evidence because `mountAllRoutes` starts schedulers and this workstation has no local `DATABASE_URL`; resulting DB connection warnings were expected for that introspection method.

Remaining verification to run before push:
- Full fast test suite.
- Client test suite.
- Production build.
- Dependency audit.
- Railway production and staging health checks after deployment.

## 6. Residual Risk And Roadmap

Immediate:
- Keep additive compatibility as the rule: new helpers must include both `ok` and `success` until frontend consumers are migrated.
- Add route-family contract tests for auth/invite, client portal, support, uploads, and billing.
- Add a docs coverage check that compares `server/http/mount.ts` domains to `docs/17-API-REGISTRY`.

Near-term:
- Standardize validation imports for new routes on `server/http/middleware/validateBody.ts`.
- Document pagination per endpoint family, especially cursor vs limit/offset semantics.
- Add file-contract docs for presign, complete, download, size limits, MIME allowlists, and retry behavior.

Long-term:
- Define API versioning and deprecation policy before introducing breaking response changes.
- Add endpoint-specific idempotency keys only where duplicate side effects are expensive or user-visible.
- Generate OpenAPI or machine-readable route docs from the route registry after the route surface is better normalized.

Do not pursue yet:
- Do not rewrite all legacy routes into router-factory form in one pass.
- Do not introduce a generic idempotency layer before endpoint-specific duplicate side effects are measured.
- Do not remove legacy `ok`, `message`, or `code` fields until frontend usage is audited and migrated.

## 7. Final Scorecard

Request validation: 7/10. Zod is present and details are now more consistent, but validation is split across three helpers.

Response consistency: 7/10. Shared helpers are additive-compatible; legacy direct responses remain.

Error taxonomy: 8/10. Stable `AppError` codes exist and now carry better envelope compatibility.

Authorization and tenant checks: 8/10. Route registry policies and tenancy middleware are strong; route-family tests should keep expanding.

Pagination/filtering/sorting: 6/10. Common patterns exist, but endpoint docs and tests are inconsistent.

Idempotency/retries/concurrency: 5/10. Some operations are naturally safe, but there is no explicit contract for high-risk mutations.

File contracts: 6/10. Upload guards and size checks exist; docs and retry contracts need tightening.

Versioning/deprecation: 5/10. Legacy compatibility is consciously preserved, but formal evolution policy is thin.

Documentation: 6/10. API registry exists, but it trails the runtime route registry.

Contract testing: 7/10. Existing legacy tests plus new envelope tests are useful; endpoint family coverage remains the next big gain.
