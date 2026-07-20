# DigitalWorkday Master Engineering Review - 2026-07-20

## 1. Executive Assessment

Overall score after implementation pass: 7.8 / 10.

Release recommendation: ready for production and staging deploy after the portal invite fix and stability hardening in this pass. Continue shipping customer-portal expansion in narrowly scoped increments, with the large-file decomposition handled as a follow-on stability project.

Strengths:

- The system has a clear full-stack product shape: React 18, TypeScript, Express, Drizzle, Postgres, Socket.IO, Railway deployment, and documented multi-tenant operations.
- Route policy enforcement is better than average for a codebase of this size. `server/http/routerFactory.ts`, `server/http/policy/requiredMiddleware.ts`, and `server/tests/policy/*` provide a useful control plane.
- Production deployment has real readiness checks and smoke checks through `railway.toml`, `/health`, `/ready`, schema readiness, and `server/scripts/deploy-smoke.cjs`.
- TypeScript strict mode is enabled and the current implementation typechecks.
- The codebase has meaningful regression coverage, including route policy, tenant scope, socket policy, errors, notifications, attachments, and auth helpers.

Primary risks addressed in this pass:

- Portal invites now either send an email or expose a copyable registration link if email delivery is unavailable.
- Direct observability endpoints now require super-user access in production.
- Direct `/api/*` route policy coverage now guards against accidental policy drift.
- Portal React Query keys have a centralized namespace and regression coverage.
- Import cycles found in the review were removed.
- New HTTP domain routers no longer depend directly on legacy route helpers.
- Production dependency audit now reports zero vulnerabilities.
- The CI script now includes typecheck, server tests, client tests, and build.

Remaining structural risk:

- A small number of very large files still concentrate responsibilities, type escapes, and UI state transitions. This is intentionally deferred because it is a broad refactor rather than a production hotfix.

## 2. System Map

- Client: `client/src/App.tsx` composes auth, tenant, theme, realtime, and query providers. `client/src/routing/tenantRouter.tsx`, `client/src/routing/portalRouter.tsx`, and `client/src/routing/superRouter.tsx` split authenticated app, portal, and super-admin surfaces.
- Data fetching: `client/src/lib/queryClient.ts` implements URL construction, auth error handling, and broad mutation invalidation. `client/src/lib/queryKeys.ts` exists as the intended centralized query-key builder.
- Server entrypoint: `server/index.ts` creates the Express app, health endpoints, auth, tenant context, CSRF, response guards, direct system endpoints, route mounting, and static serving.
- Route registry: `server/http/mount.ts` registers domain routers and their required policy. `server/http/routerFactory.ts` applies JSON envelopes and required auth/tenant/super-user middleware.
- Tenant model: `server/middleware/tenantContext.ts` establishes effective tenant context; repository patterns and tenant checks are documented in `docs/security/multi-tenancy-checklist.md`.
- Persistence: `shared/schema.ts` defines Drizzle schema and shared types. `server/storage.ts` remains the central storage interface and implementation with supplemental repositories in `server/storage/*.repo.ts`.
- Realtime: `server/realtime/socket.ts` and socket policy tests enforce authenticated tenant-aware Socket.IO access.
- Deployment: `railway.toml` runs `npm run build`, then `node server/scripts/deploy-smoke.cjs && npm run start`.

## 3. Findings

| ID | Severity | Confidence | Location | Evidence | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-001 | High | Fixed | `server/index.ts`, `server/middleware/observabilityAccess.ts` | Observability defaults enabled, and `/api/v1/system/perf/stats` plus `/api/v1/system/observability` were direct app routes outside normal auth policy. | Added `requireObservabilityAccess` and applied it to both endpoints. | S | Low | `server/tests/observability-access.test.ts`, targeted policy tests, `npm run check`, `npm test`, `npm run build`. |
| F-002 | Medium | Fixed | `server/index.ts`, `server/tests/direct-system-route-policy.test.ts` | Several system routes are registered directly in `server/index.ts`, while policy drift tests inspect the route registry. | Added a direct-route policy regression test that enumerates expected direct `/api/*` routes and verifies observability protection. | S | Low | `server/tests/direct-system-route-policy.test.ts`. |
| F-003 | Medium | Partially fixed | `client/src/lib/queryKeys.ts`, `client/src/pages/client-portal-*.tsx`, `client/src/components/client-portal-sidebar.tsx` | Portal screens had raw query keys and duplicate route strings, increasing stale-cache risk. | Added a portal query-key namespace, migrated portal pages/sidebar, and added a regression scan for raw portal query keys. Broader app-wide migration remains follow-on work. | M | Low | `server/tests/portal-query-key-convention.test.ts`, client tests. |
| F-004 | Medium | Deferred | `server/storage.ts`, `client/src/pages/chat.tsx`, `shared/schema.ts` | Largest files include `server/storage.ts`, `client/src/pages/chat.tsx`, `shared/schema.ts`, and several 2,000+ line client pages. | Defer broad decomposition to a dedicated stability cycle to avoid unnecessary production blast radius in this hotfix. | L | Medium | Component-level tests and route/storage smoke tests after each extraction. |
| F-005 | Medium | Fixed | `server/services/uploads/*`, `server/routes/modules/super-admin/*` | Import graph found upload and super-admin cycles. | Moved upload types to `uploadTypes.ts` and tenant audit helper to `modules/super-admin/audit.ts`. | S | Low | Import-cycle analyzer reports zero cycles. |
| F-006 | Medium | Fixed | `server/http/domains/*.router.ts`, `server/http/helpers.ts` | New domain routers imported legacy route helpers. | Moved helpers into `server/http/helpers.ts`, left `server/routes/helpers.ts` as compatibility re-export, and rewired domain imports. | S | Low | Import-direction scan shows no domain imports from `server/routes/helpers.ts`. |
| F-007 | Medium | Fixed in code | `server/config.ts` | `TENANCY_ENFORCEMENT` defaulted to `off` when unset. | Changed default to `strict` so missing Railway values do not silently weaken enforcement. | S | Medium | Typecheck and test suite. Railway variable review remains an environment operation. |
| F-008 | High | Fixed | `package.json`, `package-lock.json` | `npm audit --omit=dev` previously reported production-tree advisories. | Updated production dependency tree, including `drizzle-orm` to `0.45.2`. | M | Medium | `npm audit --omit=dev` reports zero vulnerabilities. |
| F-009 | Low | Fixed | `package.json` | Default release path did not explicitly include the client test tree. | Added `test:client` and `test:ci` scripts. | S | Low | `npm run test:client`, `npm run build`. |
| F-010 | Low | Fixed | `docs/architecture/organization.md`, `server/http/routerFactory.ts` | Docs showed a stale `createApiRouter()` example and unclear legacy route status. | Updated architecture docs to match current router policy requirements and legacy route posture. | S | Low | Docs review. |

## 4. Changes Made

- Added `server/middleware/observabilityAccess.ts`.
- Updated `server/index.ts` so production requests to `/api/v1/system/perf/stats` and `/api/v1/system/observability` require an authenticated `SUPER_USER`.
- Added `server/tests/observability-access.test.ts` covering development access, production unauthenticated rejection, production non-super-user rejection, and production super-user access.
- Fixed client portal invites so tenant admins can send invite emails and still receive a copyable setup link if email delivery is unavailable.
- Added tenant-admin authorization to client portal user-management routes.
- Added safety checks to prevent internal users or users from another tenant from being granted client portal access through the invite path.
- Centralized portal query keys in `client/src/lib/queryKeys.ts` and migrated portal pages/sidebar to those builders.
- Added direct-route policy coverage and portal query-key convention coverage.
- Broke upload and super-admin import cycles.
- Moved HTTP route helpers to `server/http/helpers.ts` and rewired new domain routers away from legacy route utilities.
- Changed the default tenancy enforcement mode to `strict`.
- Updated production dependencies and added explicit client/CI test scripts.
- Updated architecture documentation to match the current route-policy model.

## 5. Verification Results

- Passed: `npm run check`.
- Passed: `npm test` with 55 files and 607 tests.
- Passed: `npm run test:client` with 20 files and 146 tests.
- Passed: `npx vitest run server/tests/client-portal-invites.test.ts server/tests/direct-system-route-policy.test.ts server/tests/portal-query-key-convention.test.ts server/tests/observability-access.test.ts`.
- Passed: `npm run build`.
- Passed: `npm audit --omit=dev`.
- Passed: `git diff --check`.
- Warning: build reports large chunks over 500 kB, including `index`, charting, priority selector, super-admin, client detail, and task drawer chunks.

## 6. Residual Risk And Roadmap

Phase 1: Production hardening and release gates.

- Verify Railway production and staging both run this same commit.
- Confirm Railway environment variables are intentionally set, especially `TENANCY_ENFORCEMENT`, email provider variables, auth origin/callback values, and database URLs.
- Keep `test:ci` as the release gate.

Phase 2: Query/cache stability.

- Centralize notification query keys first.
- Move chat, portal, and client-360 keys to `queryKeys`.
- Add a test or lint rule that prevents new raw query-key arrays in feature code.

Phase 3: Boundary and architecture cleanup.

- Add a permanent import-direction test for `server/http/domains/*` once the route/helper migration stabilizes.
- Continue moving legacy route utilities behind `server/http/*` or service-layer modules.
- Review the remaining largest route/page modules before customer-portal expansion.

Phase 4: Controlled modularization.

- Split `server/storage.ts` by domain while preserving the existing `storage` facade.
- Extract `client/src/pages/chat.tsx` into a page shell plus hooks/components.
- Use bundle analysis to target the largest chunks and add manual chunks where appropriate.

## 7. Final Scorecard

| Area | Score | Notes |
| --- | ---: | --- |
| Architecture | 7.0 | Good policy model, but direct routes and legacy helper dependencies weaken consistency. |
| Code organization | 6.4 | Large files are the largest engineering drag. |
| Simplification | 6.7 | Some accidental complexity is localized, especially frontend state/query code. |
| Code health | 7.0 | Tests and strict TS are strong, but type escapes and audit advisories need attention. |
| Module boundaries | 6.8 | Shared/client/server split is generally clean; cycles and helper direction need cleanup. |
| TypeScript correctness | 7.4 | Strict project typecheck passes; tests are not typechecked by default. |
| React performance | 6.8 | Lazy routing exists, but bundle warnings and large stateful pages remain. |
| React state/data flow | 6.3 | Query-key drift is the highest practical frontend reliability risk. |

Recommended next action: deploy this same commit to production and staging, then begin the customer-portal completion cycle with account invitation acceptance, client-visible project/task/support permissions, and portal smoke tests as the first-class release surface.
